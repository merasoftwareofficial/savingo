import auth from '@react-native-firebase/auth';
import notifee, {EventType} from '@notifee/react-native';
import {Platform} from 'react-native';
import {
  initChatDatabase,
  getConversation,
} from './chatDatabase';
import {storePendingChatNavigation} from './notificationNavigationService';
import {
  buildChatThreadNotificationId,
  clearChatThreadNotificationState,
} from './chatNotificationV2Service';
import {storePendingPhoneClaimNavigation} from './phoneClaimNavigationService';
import {
  evaluateNotificationOpen,
  handleConversationSeen,
} from './chatSystem';

const normalizeText = value => String(value || '').trim();
const CHAT_NOTIF_PENDING_ACTIONS_KEY = 'chatNotifV2:pendingActions';
const ACTION_DEDUPE_WINDOW_MS = 3500;
const MAX_PENDING_ACTIONS = 30;
const recentActionKeys = new Map();
const markReadInFlight = new Set();
let chatDbReady = false;

export const resetChatNotificationActionServiceState = () => {
  chatDbReady = false;
  recentActionKeys.clear();
  markReadInFlight.clear();
};

const ensureChatDatabaseReady = () => {
  if (chatDbReady) {
    return;
  }
  try {
    initChatDatabase();
    chatDbReady = true;
  } catch (error) {
    chatDbReady = false;
    throw error;
  }
};

const isPressType = type =>
  type === EventType.PRESS || type === EventType.ACTION_PRESS || type === 1;

const resolveActionKind = ({type, detail}) => {
  if (!isPressType(type)) {
    return 'ignore';
  }
  if (type === EventType.PRESS) {
    return 'open';
  }
  const actionId = normalizeText(detail?.pressAction?.id);
  if (actionId === 'chat_reply') {
    return 'reply';
  }
  if (actionId === 'chat_mark_read') {
    return 'mark_read';
  }
  if (actionId === 'chat_open') {
    return 'open';
  }
  if (actionId === 'phone_claim_open' || actionId === 'phone_claim_result_open') {
    return 'open';
  }
  return 'ignore';
};

const getEventData = detail => {
  const notification = detail?.notification || {};
  const data = notification?.data || {};
  return {
    type: normalizeText(data?.type),
    conversationId: normalizeText(data?.conversationId || data?.conversation_id),
    senderId: normalizeText(data?.senderId || data?.sender_id),
    senderPhone: normalizeText(data?.senderPhone || data?.sender_phone),
    senderName: normalizeText(data?.senderName || data?.sender_name),
    contactRecordId: normalizeText(data?.contactRecordId || data?.contact_record_id),
    messageId: normalizeText(data?.messageId || data?.message_id),
    claimId: normalizeText(data?.claimId || data?.claim_id),
    status: normalizeText(data?.status),
    phoneNormalized: normalizeText(data?.phoneNormalized || data?.phone_normalized),
    phoneLastFour: normalizeText(data?.phoneLastFour || data?.phone_last_four),
    eventId: normalizeText(data?.eventId || data?.event_id),
    notifVersion: normalizeText(data?.notifVersion || data?.notif_version),
    notificationId:
      normalizeText(data?.notificationId || notification?.id || data?.messageId || data?.message_id),
  };
};

const toPendingAction = ({kind, data, input}) => ({
  id: `notif_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  kind,
  data,
  input: normalizeText(input),
  createdAt: Date.now(),
});

const readPendingActions = async () => {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(CHAT_NOTIF_PENDING_ACTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] pending actions read failed:', error);
    return [];
  }
};

const writePendingActions = async actions => {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(
      CHAT_NOTIF_PENDING_ACTIONS_KEY,
      JSON.stringify(Array.isArray(actions) ? actions.slice(-MAX_PENDING_ACTIONS) : []),
    );
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] pending actions write failed:', error);
  }
};

const enqueuePendingAction = async action => {
  const list = await readPendingActions();
  list.push(action);
  await writePendingActions(list);
  if (__DEV__) {
    console.log('[CHAT_NOTIF_V2] action queued for later processing', {
      kind: action?.kind,
      conversationId: normalizeText(action?.data?.conversationId),
      pendingCount: list.length,
    });
  }
};

const removePendingActionById = async actionId => {
  const id = normalizeText(actionId);
  if (!id) {
    return;
  }
  const list = await readPendingActions();
  const next = list.filter(item => normalizeText(item?.id) !== id);
  await writePendingActions(next);
};

const buildActionKey = ({kind, data, input}) =>
  [
    normalizeText(data?.type),
    normalizeText(kind),
    normalizeText(data?.eventId),
    normalizeText(data?.conversationId),
    normalizeText(data?.messageId),
    normalizeText(data?.claimId),
    normalizeText(data?.notificationId),
    normalizeText(input),
  ].join('|');

const shouldDedupAction = actionKey => {
  const key = normalizeText(actionKey);
  if (!key) {
    return false;
  }
  const now = Date.now();
  const last = Number(recentActionKeys.get(key) || 0);
  if (last > 0 && now - last < ACTION_DEDUPE_WINDOW_MS) {
    return true;
  }
  recentActionKeys.set(key, now);

  for (const [savedKey, timestamp] of recentActionKeys.entries()) {
    if (now - Number(timestamp || 0) > ACTION_DEDUPE_WINDOW_MS) {
      recentActionKeys.delete(savedKey);
    }
  }
  return false;
};

const sendReadReceiptsBestEffort = async conversationId => {
  const convId = normalizeText(conversationId);
  const selfUid = normalizeText(auth().currentUser?.uid);
  if (!convId || !selfUid) {
    return;
  }

  try {
    const {sendDeliveryReceipt} = require('./messagingService');
    await handleConversationSeen({
      conversationId: convId,
      selfUserId: selfUid,
      sendReadReceipt: async (senderId, messageId, status) => {
        const authToken = await auth().currentUser?.getIdToken?.();
        return sendDeliveryReceipt(senderId, messageId, status, authToken);
      },
      receiptLimit: 50,
    });
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] unable to load messagingService for read receipts:', error);
  }
};

const handleOpen = async (data, onOpenRequested) => {
  const eventType = normalizeText(data?.type);
  if (
    eventType === 'phone_claim_request' ||
    eventType === 'phone_claim_result'
  ) {
    await storePendingPhoneClaimNavigation({
      type: eventType,
      status: normalizeText(data?.status),
      claimId: normalizeText(data?.claimId),
      requesterId: normalizeText(data?.requesterId),
      requesterName: normalizeText(data?.requesterName),
      phoneNormalized: normalizeText(data?.phoneNormalized),
      phoneLastFour: normalizeText(data?.phoneLastFour),
      notificationId: normalizeText(data?.notificationId),
      eventId: normalizeText(data?.eventId),
      notifVersion: normalizeText(data?.notifVersion),
      pressedAt: Date.now(),
    });
    if (typeof onOpenRequested === 'function') {
      await onOpenRequested();
    }
    return;
  }

  const conversationId = normalizeText(data?.conversationId);
  if (!conversationId) {
    return;
  }
  const navigationPolicy = evaluateNotificationOpen({
    conversationId,
    contactRecordId: normalizeText(data?.contactRecordId),
  });

  if (!navigationPolicy.shouldNavigate) {
    await clearChatThreadNotificationState(conversationId);
    return;
  }

  await storePendingChatNavigation({
    ...data,
    conversationId,
    pressedAt: Date.now(),
  });
  if (typeof onOpenRequested === 'function') {
    await onOpenRequested();
  }
};

const handleMarkRead = async data => {
  const conversationId = normalizeText(data?.conversationId);
  if (!conversationId) {
    return;
  }
  if (markReadInFlight.has(conversationId)) {
    return;
  }
  markReadInFlight.add(conversationId);
  ensureChatDatabaseReady();
  try {
    await sendReadReceiptsBestEffort(conversationId);
  } finally {
    try {
      await clearChatThreadNotificationState(conversationId);
    } finally {
      markReadInFlight.delete(conversationId);
    }
  }
};

const resolveReplyReceiver = data => {
  const senderId = normalizeText(data?.senderId);
  if (senderId) {
    return {
      receiverId: senderId,
      receiverPhoneCandidates: [normalizeText(data?.senderPhone)].filter(Boolean),
    };
  }

  const conversationId = normalizeText(data?.conversationId);
  let conversation = null;
  if (conversationId) {
    try {
      ensureChatDatabaseReady();
      conversation = getConversation(conversationId);
    } catch (error) {
      console.error('[CHAT_NOTIF_V2] resolve reply receiver conversation read failed:', error);
    }
  }
  const fallbackReceiverId = normalizeText(conversation?.other_user_id);
  const fallbackPhone = normalizeText(conversation?.other_user_phone);
  return {
    receiverId: fallbackReceiverId,
    receiverPhoneCandidates: [normalizeText(data?.senderPhone), fallbackPhone].filter(Boolean),
  };
};

const handleReply = async (data, inputText) => {
  const conversationId = normalizeText(data?.conversationId);
  const text = normalizeText(inputText);
  if (!conversationId || !text) {
    return;
  }
  ensureChatDatabaseReady();

  const {receiverId, receiverPhoneCandidates} = resolveReplyReceiver(data);
  if (!receiverId) {
    throw new Error('reply_receiver_unresolved');
  }

  try {
    const {sendMessageToUser} = require('./messagingService');
    const timestamp = Date.now();
    await sendMessageToUser(receiverId, {
      conversationId,
      contactRecordId: normalizeText(data?.contactRecordId),
      messageText: text,
      messageType: 'text',
      timestamp,
      receiverPhoneCandidates,
    });
    await handleMarkRead(data);
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] inline reply failed:', error);
    throw error;
  }
};

const processActionCore = async (
  {kind, data, input},
  {source = 'unknown', onOpenRequested} = {},
) => {
  if (kind === 'open') {
    await handleOpen(data, onOpenRequested);
    return true;
  }

  if (kind === 'mark_read') {
    await handleMarkRead(data);
    return true;
  }

  if (kind === 'reply') {
    if (!normalizeText(auth().currentUser?.uid)) {
      throw new Error('reply_auth_unavailable');
    }
    await handleReply(data, input);
    return true;
  }

  return false;
};

export const processChatNotificationAction = async (
  {type, detail},
  {source = 'unknown', onOpenRequested} = {},
) => {
  const kind = resolveActionKind({type, detail});
  if (kind === 'ignore') {
    return false;
  }

  const data = getEventData(detail);
  const eventType = normalizeText(data?.type);
  const isPhoneClaimEvent =
    eventType === 'phone_claim_request' || eventType === 'phone_claim_result';
  if (!isPhoneClaimEvent && !data.conversationId) {
    return false;
  }
  if (isPhoneClaimEvent && !data.claimId) {
    return false;
  }

  const actionKey = buildActionKey({
    kind,
    data,
    input: detail?.input,
  });
  if (shouldDedupAction(actionKey)) {
    if (__DEV__) {
      console.log('[CHAT_NOTIF_V2] action deduped', {
        source,
        kind,
        conversationId: data.conversationId,
      });
    }
    return false;
  }

  if (__DEV__) {
    console.log('[CHAT_NOTIF_V2] action event', {
      source,
      kind,
      type: data.type,
      conversationId: data.conversationId,
      claimId: data.claimId,
      senderId: data.senderId,
      notificationId:
        data.notificationId ||
        (data.conversationId
          ? buildChatThreadNotificationId(data.conversationId)
          : ''),
    });
  }

  try {
    if (kind === 'reply' || kind === 'mark_read') {
      ensureChatDatabaseReady();
    }
    return await processActionCore(
      {kind, data, input: detail?.input},
      {source, onOpenRequested},
    );
  } catch (error) {
    const normalizedMessage = normalizeText(error?.message);
    const shouldQueue =
      kind === 'reply' &&
      (normalizedMessage === 'reply_auth_unavailable' ||
        normalizedMessage === 'reply_receiver_unresolved' ||
        source === 'background' ||
        source === 'initial');

    if (shouldQueue) {
      await enqueuePendingAction(
        toPendingAction({kind, data, input: detail?.input}),
      );
      await clearChatThreadNotificationState(data.conversationId);
      return true;
    }
    throw error;
  }
};

export const flushPendingChatNotificationActions = async ({onOpenRequested} = {}) => {
  const pending = await readPendingActions();
  if (!pending.length) {
    return {processed: 0, remaining: 0};
  }

  let processed = 0;
  for (const item of pending) {
    const kind = normalizeText(item?.kind);
    const data = item?.data || {};
    try {
      await processActionCore(
        {
          kind,
          data,
          input: item?.input,
        },
        {
          source: 'pending-flush',
          onOpenRequested,
        },
      );
      processed += 1;
      await removePendingActionById(item?.id);
    } catch (error) {
      if (__DEV__) {
        console.log('[CHAT_NOTIF_V2] pending action still blocked', {
          kind,
          conversationId: normalizeText(data?.conversationId),
          reason: normalizeText(error?.message),
        });
      }
    }
  }

  const remaining = (await readPendingActions()).length;
  if (__DEV__) {
    console.log('[CHAT_NOTIF_V2] pending actions flush result', {
      processed,
      remaining,
    });
  }
  return {processed, remaining};
};

export const consumeInitialChatNotificationAction = async ({onOpenRequested} = {}) => {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const initial = await notifee.getInitialNotification();
    const notification = initial?.notification || null;
    if (!notification) {
      return false;
    }

    const pressAction = initial?.pressAction || {};
    const pressId = normalizeText(pressAction?.id);
    const type = pressId && pressId !== 'default' ? EventType.ACTION_PRESS : EventType.PRESS;
    return await processChatNotificationAction(
      {
        type,
        detail: {
          notification,
          pressAction,
          input: initial?.input,
        },
      },
      {
        source: 'initial',
        onOpenRequested,
      },
    );
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] initial notification action consume failed:', error);
    return false;
  }
};

export const registerForegroundChatNotificationActions = ({onOpenRequested} = {}) =>
  notifee.onForegroundEvent(async event => {
    try {
      await processChatNotificationAction(event, {
        source: 'foreground',
        onOpenRequested,
      });
    } catch (error) {
      console.error('[CHAT_NOTIF_V2] foreground action handling failed:', error);
    }
  });
