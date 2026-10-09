import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://account-android-app-backend.vercel.app/api';
const LEDGER_SYNC_QUEUE_KEY = 'ledgerSyncQueue:v1';
const LEDGER_SYNC_ALL_ENTRIES_PREFIX = 'ledgerSyncAllEntries:';

const getAuthToken = async () => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }
  return currentUser.getIdToken();
};

const readQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read ledger sync queue:', error);
    return [];
  }
};

const writeQueue = async queue => {
  try {
    await AsyncStorage.setItem(LEDGER_SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to write ledger sync queue:', error);
  }
};

const isLedgerSyncEnabledForContact = async contactRecordId => {
  const recordId = String(contactRecordId || '').trim();
  if (!recordId) {
    return true;
  }
  try {
    const stored = await AsyncStorage.getItem(`${LEDGER_SYNC_ALL_ENTRIES_PREFIX}${recordId}`);
    return stored !== '0';
  } catch (error) {
    console.error('Failed to read sync entries preference:', error);
    return true;
  }
};

const parseJsonResponseSafely = async response => {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {message: raw};
  }
};

export const removeQueuedLedgerEventsForContact = async contactRecordId => {
  const target = String(contactRecordId || '').trim();
  if (!target) {
    return 0;
  }
  const queue = await readQueue();
  if (!queue.length) {
    return 0;
  }
  const next = queue.filter(item => String(item?.contactRecordId || '').trim() !== target);
  const removed = queue.length - next.length;
  if (removed > 0) {
    await writeQueue(next);
  }
  return removed;
};

const makeIdempotencyKey = event => {
  const originTxn = String(event?.originTxnId || '');
  const op = String(event?.op || 'create');
  const source = String(event?.sourceUserId || '');
  return `ledger:${source}:${originTxn}:${op}`;
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

const postLedgerEvent = async event => {
  const token = await getAuthToken();
  const payload = {
    ...event,
    idempotencyKey: event.idempotencyKey || makeIdempotencyKey(event),
  };

  console.log('[LEDGER_SYNC][API] POST /api/ledger/sync -> request', {
    originTxnId: payload.originTxnId,
    sourceUserId: payload.sourceUserId,
    peerUserId: payload.peerUserId,
    type: payload.type || payload.entryType,
    amount: payload.amount,
  });

  const response = await fetch(`${API_URL}/ledger/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await parseJsonResponseSafely(response);
    console.log('[LEDGER_SYNC][API] POST /api/ledger/sync -> failed', {
      status: response.status,
      body,
    });
    const message = body?.error || body?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const body = await parseJsonResponseSafely(response);

  const queued = body?.queued === true;
  const delivered = body?.delivered === true || (!queued && body?.success !== false);

  console.log('[LEDGER_SYNC][API] POST /api/ledger/sync -> success', {
    status: response.status,
    originTxnId: payload.originTxnId,
    queued,
    delivered,
  });
  return {
    ok: true,
    status: response.status,
    queued,
    delivered,
    body,
  };
};

export const enqueueLedgerEvent = async event => {
  const queue = await readQueue();
  queue.push({
    ...event,
    idempotencyKey: event.idempotencyKey || makeIdempotencyKey(event),
    queuedAt: Date.now(),
    retryCount: Number(event.retryCount || 0),
  });
  await writeQueue(queue);
};

export const sendLedgerEvent = async (event, options = {}) => {
  const withResult = options?.withResult === true;
  const payload = {
    ...event,
    idempotencyKey: event.idempotencyKey || makeIdempotencyKey(event),
  };
  const syncEnabled = await isLedgerSyncEnabledForContact(payload.contactRecordId);
  if (!syncEnabled) {
    console.log('[LEDGER_SYNC] Event skipped - disabled for contact', {
      originTxnId: payload.originTxnId,
      contactRecordId: payload.contactRecordId || null,
      peerUserId: payload.peerUserId,
    });
    if (withResult) {
      return {
        ok: false,
        sent: false,
        delivered: false,
        queued: false,
        skipped: true,
        reason: 'sync_disabled',
      };
    }
    return false;
  }
  try {
    const apiResult = await postLedgerEvent(payload);
    const delivered = apiResult?.delivered === true;
    const queued = apiResult?.queued === true;
    const sent = delivered && !queued;
    console.log('[LEDGER_SYNC] Event sent successfully', {
      originTxnId: payload.originTxnId,
      peerUserId: payload.peerUserId,
      delivered,
      queued,
    });
    if (withResult) {
      return {
        ok: true,
        sent,
        delivered,
        queued,
        status: apiResult?.status || 200,
        body: apiResult?.body || null,
      };
    }
    return sent;
  } catch (error) {
    console.error('Ledger event sync failed, queued for retry:', error?.message || error);
    await enqueueLedgerEvent(payload);
    console.log('[LEDGER_SYNC] Event queued for retry', {
      originTxnId: payload.originTxnId,
      peerUserId: payload.peerUserId,
    });
    if (withResult) {
      return {
        ok: false,
        sent: false,
        delivered: false,
        queued: true,
        enqueued: true,
        error: String(error?.message || error),
      };
    }
    return false;
  }
};

export const processPendingLedgerEvents = async () => {
  const queue = await readQueue();
  if (!queue.length) return;

  const pending = [];
  for (const item of queue) {
    const syncEnabled = await isLedgerSyncEnabledForContact(item?.contactRecordId);
    if (!syncEnabled) {
      console.log('[LEDGER_SYNC] Dropped queued event - disabled for contact', {
        originTxnId: item?.originTxnId || null,
        contactRecordId: item?.contactRecordId || null,
      });
      continue;
    }
    try {
      await postLedgerEvent(item);
    } catch (error) {
      pending.push({
        ...item,
        retryCount: Number(item.retryCount || 0) + 1,
        lastError: String(error?.message || error),
      });
    }
  }

  await writeQueue(pending);
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

