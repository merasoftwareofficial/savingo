import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppState} from 'react-native';
import {deliveryFetch, deliveryRetryDelay} from './deliveryTransport';

const API_URL = 'https://account-android-app-backend.vercel.app/api';
const LEDGER_SYNC_QUEUE_KEY = 'ledgerSyncQueue:v1';
const LEDGER_SYNC_ALL_ENTRIES_PREFIX = 'ledgerSyncAllEntries:';
let queueMutation = Promise.resolve();
let processing = false;
let retryTimer = null;
const activeSends = new Map();

const readQueue = async () => {
  const raw = await AsyncStorage.getItem(LEDGER_SYNC_QUEUE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) throw new Error('Invalid ledger delivery queue');
  return parsed;
};

// Never hold the storage lock over a network request. Apply removals/updates to
// the latest queue so an event added during a send cannot be overwritten.
const mutateQueue = operation => {
  const task = queueMutation.then(async () => {
    const queue = await readQueue();
    const {next, result} = operation(queue);
    await AsyncStorage.setItem(LEDGER_SYNC_QUEUE_KEY, JSON.stringify(next));
    return result;
  });
  queueMutation = task.catch(() => {});
  return task;
};

const isLedgerSyncEnabledForContact = async contactRecordId => {
  const id = String(contactRecordId || '').trim();
  return !id || (await AsyncStorage.getItem(`${LEDGER_SYNC_ALL_ENTRIES_PREFIX}${id}`)) !== '0';
};

const makeIdempotencyKey = event =>
  `ledger:${String(event?.sourceUserId || '')}:${String(event?.originTxnId || '')}:${String(event?.op || 'create')}`;
const queueKey = event => JSON.stringify([
  String(event.sourceUserId || ''), String(event.peerUserId || ''),
  event.idempotencyKey || makeIdempotencyKey(event),
]);

const scheduleRetry = async () => {
  if (retryTimer || AppState.currentState !== 'active') return;
  const uid = auth().currentUser?.uid;
  if (!uid) return;
  const queue = await readQueue();
  const mine = queue.filter(item => item.sourceUserId === uid);
  if (!mine.length || retryTimer) return;
  const nextAt = Math.min(...mine.map(item => Number(item.nextRetryAt || 0)));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (AppState.currentState === 'active') {
      void processPendingLedgerEvents().catch(error => console.error('Ledger retry failed:', error));
    }
  }, Math.max(1000, nextAt - Date.now()));
};

export const removeQueuedLedgerEventsForContact = async contactRecordId => {
  const target = String(contactRecordId || '').trim();
  if (!target) return 0;
  return mutateQueue(queue => {
    const next = queue.filter(item => String(item.contactRecordId || '').trim() !== target);
    return {next, result: queue.length - next.length};
  });
};

export const enqueueLedgerEvent = async event => {
  const payload = {...event, idempotencyKey: event.idempotencyKey || makeIdempotencyKey(event)};
  if (!payload.sourceUserId || !payload.peerUserId || !payload.originTxnId) {
    throw new Error('Ledger delivery identity missing');
  }
  return mutateQueue(queue => {
    const existing = queue.find(item => queueKey(item) === queueKey(payload));
    if (existing) return {next: queue, result: existing};
    const item = {...payload, queuedAt: Date.now(), retryCount: 0, nextRetryAt: 0};
    return {next: [...queue, item], result: item};
  });
};

const postLedgerEvent = async event => {
  const user = auth().currentUser;
  if (!user || user.uid !== event.sourceUserId) throw new Error('Ledger delivery session mismatch');
  const token = await user.getIdToken();
  if (auth().currentUser?.uid !== user.uid) throw new Error('Session changed');
  const {response, body} = await deliveryFetch(`${API_URL}/ledger/sync`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify(event),
  });
  if (auth().currentUser?.uid !== user.uid) throw new Error('Session changed');
  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  }
  // Legacy backend delivered means FCM accepted, not receiver acknowledgement.
  // In particular, queued=true is NOT a durable handoff on that backend.
  return {status: response.status, body, delivered: body.delivered === true && body.queued !== true};
};

const deliverQueuedEvent = item => {
  const key = queueKey(item);
  if (activeSends.has(key)) return activeSends.get(key);
  const task = (async () => {
    try {
      const current = (await readQueue()).find(entry => queueKey(entry) === key);
      if (!current) return {ok: false, skipped: true, reason: 'queue_removed'};
      if (!(await isLedgerSyncEnabledForContact(item.contactRecordId))) {
        await mutateQueue(queue => ({next: queue.filter(entry => queueKey(entry) !== key)}));
        return {ok: false, sent: false, delivered: false, queued: false, skipped: true, reason: 'sync_disabled'};
      }
      const result = await postLedgerEvent(current);
      if (result.delivered) {
        await mutateQueue(queue => ({next: queue.filter(entry => queueKey(entry) !== key)}));
        return {ok: true, sent: true, queued: false, ...result};
      }
      throw new Error('Backend has not handed ledger event to FCM');
    } catch (error) {
      await mutateQueue(queue => ({next: queue.map(entry => queueKey(entry) !== key ? entry : {
        ...entry, retryCount: Number(entry.retryCount || 0) + 1,
        nextRetryAt: Date.now() + deliveryRetryDelay(entry.retryCount),
        lastError: String(error?.message || error),
      })}));
      return {ok: false, sent: false, delivered: false, queued: true, enqueued: true, error: String(error?.message || error)};
    } finally {
      activeSends.delete(key);
      void scheduleRetry().catch(error => console.error('Ledger retry scheduling failed:', error));
    }
  })();
  activeSends.set(key, task);
  return task;
};

export const sendLedgerEvent = async (event, options = {}) => {
  const withResult = options.withResult === true;
  if (!(await isLedgerSyncEnabledForContact(event.contactRecordId))) {
    return withResult ? {ok: false, sent: false, delivered: false, queued: false, skipped: true, reason: 'sync_disabled'} : false;
  }
  // A storage failure must reach the caller: do not claim a successful enqueue.
  const item = await enqueueLedgerEvent(event);
  const result = await deliverQueuedEvent(item);
  return withResult ? result : result.sent === true;
};

export const processPendingLedgerEvents = async () => {
  const uid = auth().currentUser?.uid;
  if (!uid || processing) return;
  processing = true;
  try {
    await queueMutation;
    const queue = await readQueue();
    for (const item of queue) {
      if (auth().currentUser?.uid !== uid) break;
      if (item.sourceUserId !== uid || Number(item.nextRetryAt || 0) > Date.now()) continue;
      await deliverQueuedEvent(item);
    }
  } finally {
    processing = false;
    await scheduleRetry();
  }
};

const packOriginTxnIdWithCreatedAt = (originTxnId, createdAt) => {
  const base = String(originTxnId || '').trim();
  if (!base) {
    return '';
  }
  const createdAtValue = Number(createdAt || 0);
  if (!Number.isFinite(createdAtValue) || createdAtValue <= 0) {
    return base;
  }
  return `${base}|ca=${Math.floor(createdAtValue)}`;
};

const normalizeEditHistoryPayload = value => {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
    ? (() => {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return [];
        }
      })()
    : [];
  return list
    .map(item => Number(item))
    .filter(item => Number.isFinite(item) && item >= 0);
};

export const buildLedgerCreateEvent = params => {
  const sourceUserId = String(params?.sourceUserId || '');
  const peerUserId = String(params?.peerUserId || '');
  const rawOriginTxnId = String(params?.originTxnId || '');
  const originTxnId = packOriginTxnIdWithCreatedAt(
    rawOriginTxnId,
    Number(params?.createdAt || 0),
  );
  const amount = Number(params?.amount || 0);
  const type = params?.type === 'get' ? 'get' : 'paid';
  const editHistory = normalizeEditHistoryPayload(params?.editHistory);
  const editHistoryJson = editHistory.length > 0 ? JSON.stringify(editHistory) : '';

  return {
    op: 'create',
    originTxnId,
    sourceUserId,
    peerUserId,
    contactRecordId: String(params?.contactRecordId || ''),
    type,
    entryType: type,
    amount,
    note: String(params?.note || ''),
    editHistory,
    editHistoryJson,
    timestamp: Number(params?.timestamp || Date.now()),
    version: 1,
    idempotencyKey: `ledger:${sourceUserId}:${originTxnId}:create`,
  };
};

