import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chatStore } from '../context/ChatStore';
import {DeviceEventEmitter, AppState, Platform} from 'react-native';
import {
  initLedgerDatabase,
  createTransaction as createLedgerTransaction,
} from './ledgerDatabase';
import {
  initChatDatabase,
  createConversation,
  insertMessage,
  updateMessageStatus,
  updateConversation,
  queueMessage,
  getPendingMessages,
  removeFromQueue,
  incrementRetryCount,
  updateQueuedMessageTarget,
  getConversation,
  getMessageById,
} from './chatDatabase';
import {upsertIncomingChatThreadNotification} from './chatNotificationV2Service';
import {evaluateIncomingMessage} from './chatSystem';
import {
  displayPhoneClaimRequestNotification,
  displayPhoneClaimResultNotification,
} from './phoneClaimNotificationService';
import {storePendingPhoneClaimNavigation} from './phoneClaimNavigationService';
import {
  deriveCanonicalRecordId,
  derivePeerUserId,
  normalizeInstallState,
} from './ledgerChatIdentityService';
import {resolveInitialContactIdentity} from './ledgerContactBootstrapService';

// Backend API base URL
const API_URL = 'https://account-android-app-backend.vercel.app/api';

const incomingMessageListeners = new Set();
let fcmListenersInitialized = false;
let tokenRefreshListenerInitialized = false;
let networkListenerInitialized = false;
let appStateTokenListenerInitialized = false;
let tokenRecoveryTimer = null;
let tokenHealInFlight = false;
let pendingMessageProcessingInFlight = false;
let chatDbInitialized = false;
const processedIncomingMessageIds = new Set();
const processedIncomingMessageIdQueue = [];
const MAX_PROCESSED_INCOMING_IDS = 500;

const LEDGER_CONTACTS_KEY = 'ledgerContacts';
const PROCESSED_LEDGER_EVENTS_KEY = 'processedLedgerEvents:v1';
const LEDGER_CHAT_CACHE_PREFIX = 'ledgerChatCache:';
const LEDGER_SYNC_ALL_ENTRIES_PREFIX = 'ledgerSyncAllEntries:';
const DEVICE_CONTACTS_CACHE_KEY = 'ledgerDeviceContacts';
const FCM_TOKEN_KEY = 'fcmToken';
const FCM_TOKEN_LAST_SYNC_KEY = 'fcmTokenLastSync';
const FCM_TOKEN_LAST_SYNC_AT_KEY = 'fcmTokenLastSyncAt';
const FCM_SYNC_DEDUPE_WINDOW_MS = 2 * 60 * 60 * 1000;
const PLACEHOLDER_CONTACT_NAMES = new Set(['contact', 'app user', 'user']);
const PENDING_RETRY_MIN_DELAY_MS = 10 * 1000;
const PENDING_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

const normalizeValidContactName = value => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (PLACEHOLDER_CONTACT_NAMES.has(raw.toLowerCase())) {
    return '';
  }
  return raw;
};

const normalizePhoneForLookup = value => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 10) return digits.slice(-10);
  if (digits.length < 8) return '';
  return digits;
};

const normalizeIncomingMessageId = (remoteMessage, data) => {
  const directId = String(
    data?.messageId || data?.message_id || data?.id || remoteMessage?.messageId || '',
  ).trim();
  if (directId) {
    return directId;
  }

  const conversationId = String(data?.conversationId || data?.conversation_id || '').trim();
  const senderId = String(data?.senderId || data?.sender_id || '').trim();
  const timestamp = Number.parseInt(
    String(data?.timestamp || remoteMessage?.sentTime || Date.now()),
    10,
  );
  const text = String(data?.messageText || data?.message_text || '').slice(0, 40);

  return `fcm_${conversationId}_${senderId}_${timestamp}_${text}`;
};

const markIncomingMessageProcessed = messageId => {
  if (!messageId) {
    return;
  }

  processedIncomingMessageIds.add(messageId);
  processedIncomingMessageIdQueue.push(messageId);

  if (processedIncomingMessageIdQueue.length > MAX_PROCESSED_INCOMING_IDS) {
    const oldest = processedIncomingMessageIdQueue.shift();
    if (oldest) {
      processedIncomingMessageIds.delete(oldest);
    }
  }
};

const hasIncomingMessageBeenProcessed = messageId => {
  if (!messageId) {
    return false;
  }
  return processedIncomingMessageIds.has(messageId);
};

export const resetMessagingServiceDatabaseState = () => {
  chatDbInitialized = false;
};

const ensureChatDatabaseInitialized = () => {
  if (chatDbInitialized) {
    return;
  }
  try {
    initChatDatabase();
    chatDbInitialized = true;
  } catch (error) {
    chatDbInitialized = false;
    throw error;
  }
};

const emitIncomingChatUpdate = normalizedData => {
  chatStore.emitIncomingMessage(normalizedData);
  incomingMessageListeners.forEach(listener => {
    try {
      listener(normalizedData);
    } catch (listenerError) {
      console.error('Incoming message listener error:', listenerError);
    }
  });
};

const logChatLatency = (stage, payload = {}) => {
  if (!__DEV__) {
    return;
  }
  console.log(`[CHAT_LATENCY][${stage}]`, payload);
};

const applyIncomingChatMessage = async ({
  conversationId,
  senderId,
  senderName = '',
  senderPhone = '',
  contactRecordId = '',
  messageId,
  messageText = '',
  messageType = 'text',
  imageUri = null,
  transactionRequestData = null,
  timestamp = Date.now(),
  skipNotification = false,
  data = {},
}) => {
  const applyStartedAt = Date.now();
  const convId = String(conversationId || '').trim();
  const incomingSenderId = String(senderId || '').trim();
  const incomingMessageId = String(messageId || '').trim();
  if (!convId || !incomingSenderId || !incomingMessageId) {
    return {applied: false, reason: 'invalid'};
  }
  if (getMessageById(incomingMessageId)) {
    return {applied: false, reason: 'duplicate'};
  }

  const policy = evaluateIncomingMessage({
    conversationId: convId,
    contactRecordId: String(contactRecordId || '').trim(),
  });

  await insertMessage({
    messageId: incomingMessageId,
    conversationId: convId,
    senderId: incomingSenderId,
    receiverId: auth().currentUser?.uid,
    messageText,
    messageType,
    imageUri,
    transactionRequestData,
    timestamp,
    deliveryStatus: 'delivered',
    isRead: policy.markReadNow,
  });

  await updateConversation(convId, {
    lastMessageText: messageText,
    lastMessageTimestamp: timestamp,
    unreadCount: policy.incrementUnread ? 'INCREMENT' : 0,
  });

  logChatLatency('LOCAL_APPLY', {
    messageId: incomingMessageId,
    conversationId: convId,
    senderId: incomingSenderId,
    applyMs: Date.now() - applyStartedAt,
    endToEndMs: Math.max(0, Date.now() - Number(timestamp || applyStartedAt)),
  });

  const normalizedData = {
    ...data,
    type: 'chat_message',
    messageId: incomingMessageId,
    conversationId: convId,
    senderId: incomingSenderId,
    senderName,
    messageText,
    timestamp,
  };
  emitIncomingChatUpdate(normalizedData);

  if (!skipNotification && policy.showNotification) {
    let resolvedNotificationSenderName = senderName || 'Contact';
    let resolvedNotificationContactRecordId = String(contactRecordId || '').trim();
    let resolvedNotificationPhotoURL = '';
    try {
      const resolvedIdentity = await resolveInitialContactIdentity({
        recordID: String(contactRecordId || '').trim(),
        userId: incomingSenderId,
        senderName: senderName || 'Contact',
        conversationId: convId,
      });
      const resolvedName = normalizeValidContactName(
        resolvedIdentity?.savedName || resolvedIdentity?.displayName,
      );
      if (resolvedName) {
        resolvedNotificationSenderName = resolvedName;
      }
      const resolvedRecordId = String(resolvedIdentity?.recordID || '').trim();
      if (resolvedRecordId) {
        resolvedNotificationContactRecordId = resolvedRecordId;
      }
      resolvedNotificationPhotoURL = String(
        resolvedIdentity?.photoURL ||
          resolvedIdentity?.photo_url ||
          resolvedIdentity?.thumbnailPath ||
          '',
      ).trim();
    } catch (resolveIdentityError) {
      console.error('[CHAT_NOTIF_V2] resolve notification sender failed:', resolveIdentityError);
    }

    await upsertIncomingChatThreadNotification({
      conversationId: convId,
      senderId: incomingSenderId,
      senderPhone,
      senderName: resolvedNotificationSenderName,
      senderPhotoURL: resolvedNotificationPhotoURL,
      contactRecordId: resolvedNotificationContactRecordId,
      messageId: incomingMessageId,
      messageText,
      timestamp,
    });
  } else if (__DEV__ && policy.dismissNotification) {
    console.log('[NOTIF_SUPPRESS] Active conversation open, skipping chat notification', {
      conversationId: convId,
    });
  }

  // Delivery receipt is a secondary sync side-effect. It must not block
  // the user-visible notification path in background/headless execution.
  void sendDeliveryReceipt(
    incomingSenderId,
    incomingMessageId,
    policy.receiptStatus,
  );

  return {
    applied: true,
    policy,
    normalizedData,
  };
};

/**
 * Get Firebase auth token
 */
const getAuthToken = async () => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }
  return await currentUser.getIdToken();
};

const waitMs = ms => new Promise(resolve => setTimeout(resolve, ms));

const maskTokenForLog = token =>
  token && token.length > 16 ? `${token.substring(0, 10)}...${token.substring(token.length - 6)}` : token || 'null';

const getStoredSyncMeta = async () => {
  const pairs = await AsyncStorage.multiGet([
    FCM_TOKEN_KEY,
    FCM_TOKEN_LAST_SYNC_KEY,
    FCM_TOKEN_LAST_SYNC_AT_KEY,
  ]);
  const data = Object.fromEntries(pairs);
  return {
    localToken: String(data[FCM_TOKEN_KEY] || ''),
    syncedToken: String(data[FCM_TOKEN_LAST_SYNC_KEY] || ''),
    syncedAt: Number.parseInt(String(data[FCM_TOKEN_LAST_SYNC_AT_KEY] || '0'), 10) || 0,
  };
};

const markTokenSyncSuccess = async fcmToken => {
  const now = String(Date.now());
  await AsyncStorage.multiSet([
    [FCM_TOKEN_KEY, String(fcmToken || '')],
    [FCM_TOKEN_LAST_SYNC_KEY, String(fcmToken || '')],
    [FCM_TOKEN_LAST_SYNC_AT_KEY, now],
  ]);
};

const setLocalToken = async fcmToken => {
  await AsyncStorage.setItem(FCM_TOKEN_KEY, String(fcmToken || ''));
};

const syncFcmTokenToBackend = async (fcmToken, reason = 'unknown') => {
  const token = await getAuthToken();
  const currentUser = auth().currentUser;
  const firebaseUid = currentUser?.uid;
  const displayName = currentUser?.displayName || 'User';

  if (!firebaseUid || !fcmToken) {
    return false;
  }

  const primaryResp = await fetch(`${API_URL}/users/update-fcm-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fcmToken,
      reason,
      platform: Platform.OS,
    }),
  });

  if (primaryResp.ok) {
    await markTokenSyncSuccess(fcmToken);
    return true;
  }

  // Fallback to keep compatibility with existing backend flows.
  const fallbackResp = await fetch(`${API_URL}/auth/update-profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      firebaseUid,
      displayName,
      fcmToken,
    }),
  });

  if (fallbackResp.ok) {
    await markTokenSyncSuccess(fcmToken);
    return true;
  }

  return false;
};

const scheduleTokenRecovery = (reason = 'retry', delayMs = 30000) => {
  if (tokenRecoveryTimer) {
    clearTimeout(tokenRecoveryTimer);
  }

  tokenRecoveryTimer = setTimeout(() => {
    tokenRecoveryTimer = null;
    ensureValidFcmToken({ reason: `${reason}:timer`, forceRotateIfNeeded: true });
  }, Math.max(5000, delayMs));
};

const getNetworkSnapshot = async () => {
  try {
    const NetInfo = require('@react-native-community/netinfo');
    const state = await NetInfo.fetch();
    return {
      type: state?.type || 'unknown',
      isConnected: state?.isConnected,
      isInternetReachable: state?.isInternetReachable,
      details: state?.details || null,
    };
  } catch (error) {
    return {
      error: String(error?.message || error || 'netinfo_unavailable'),
    };
  }
};

const captureFcmDiagnostics = async ({reason, stage, error}) => {
  const currentUser = auth().currentUser;
  const network = await getNetworkSnapshot();
  const localMeta = await getStoredSyncMeta().catch(() => ({
    localToken: '',
    syncedToken: '',
    syncedAt: 0,
  }));

  let permissionStatus = 'unknown';
  try {
    const status = await messaging().hasPermission();
    permissionStatus = String(status);
  } catch (permError) {
    permissionStatus = `error:${String(permError?.message || permError)}`;
  }

  return {
    reason,
    stage,
    platform: Platform.OS,
    platformVersion: Platform.Version,
    appState: AppState.currentState,
    userSignedIn: Boolean(currentUser?.uid),
    firebaseUid: String(currentUser?.uid || ''),
    isDeviceRegisteredForRemoteMessages: Boolean(
      messaging()?.isDeviceRegisteredForRemoteMessages
    ),
    permissionStatus,
    tokenMeta: {
      localTokenMasked: maskTokenForLog(localMeta?.localToken),
      syncedTokenMasked: maskTokenForLog(localMeta?.syncedToken),
      syncedAt: localMeta?.syncedAt || 0,
    },
    network,
    error: {
      code: String(error?.code || ''),
      message: String(error?.message || error || ''),
      name: String(error?.name || ''),
      nativeErrorCode: String(error?.nativeErrorCode || ''),
      stackTop: String(error?.stack || '').split('\n').slice(0, 2).join(' | '),
    },
    timestamp: Date.now(),
  };
};

/**
 * Request notification permissions from user
 */
export const requestNotificationPermission = async () => {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      const fcmToken = await messaging().getToken();
      console.log('FCM Token:', fcmToken);
      return fcmToken;
    }

    console.log('Notification permission denied');
    return null;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return null;
  }
};


export const subscribeToIncomingMessages = (listener) => {
  incomingMessageListeners.add(listener);
  return () => {
    incomingMessageListeners.delete(listener);
  };
};

const parseJsonResponseSafely = async response => {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {message: raw};
  }
};

const normalizeBackendMessage = value =>
  String(value || '')
    .trim()
    .toLowerCase();

const normalizeBackendCode = value =>
  String(value || '')
    .trim()
    .toUpperCase();

const isReceiverUnavailableMessage = message =>
  normalizeBackendMessage(message).includes('receiver not found') ||
  normalizeBackendMessage(message).includes('receiver unavailable');

const isExplicitReceiverUnavailable = payload =>
  normalizeBackendCode(payload?.code) === 'RECEIVER_UNAVAILABLE' ||
  isReceiverUnavailableMessage(payload?.message || payload?.error || payload?.note);

const buildReceiverUnavailableError = (message = 'Receiver unavailable', extra = {}) => {
  const error = new Error(message);
  error.code = 'RECEIVER_UNAVAILABLE';
  Object.assign(error, extra);
  return error;
};

const computePendingRetryDelayMs = retryCount => {
  const count = Math.max(0, Number(retryCount) || 0);
  const backoff = PENDING_RETRY_MIN_DELAY_MS * 2 ** count;
  return Math.min(PENDING_RETRY_MAX_DELAY_MS, backoff);
};

/**
 * Send message to another user via backend
 */
export const sendMessageToUser = async (receiverId, messageData) => {
  const currentUserId = auth().currentUser?.uid;
  if (!currentUserId) {
    throw new Error('User not authenticated');
  }

  const messageId =
    messageData.messageId ||
    `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let activeReceiverId = String(receiverId || '').trim();
  const emitChatActivity = (timestamp = Date.now()) => {
    DeviceEventEmitter.emit('ledger:chatActivity', {
      contactRecordId: String(messageData?.contactRecordId || '').trim(),
      userId: String(activeReceiverId || receiverId || '').trim(),
      timestamp: Number(timestamp) || Date.now(),
    });
  };
  try {
    const messageTimestamp = Number(messageData.timestamp) || Date.now();
    await insertMessage({
      messageId,
      conversationId: messageData.conversationId,
      senderId: currentUserId,
      receiverId: activeReceiverId,
      messageText: messageData.messageText || '',
      messageType: messageData.messageType || 'text',
      imageUri: messageData.imageUri || null,
      transactionRequestData: messageData.transactionRequestData || null,
      deliveryStatus: 'sending',
      timestamp: messageTimestamp,
      isRead: 0,
    });

    await updateConversation(messageData.conversationId, {
      lastMessageText: messageData.messageText,
      lastMessageTimestamp: messageTimestamp,
    });
    emitChatActivity(messageTimestamp);

    const token = await getAuthToken();
    const buildPayload = () => ({
      conversationId: messageData.conversationId,
      senderId: currentUserId,
      receiverId: activeReceiverId,
      messageId,
      messageText: messageData.messageText || '',
      messageType: messageData.messageType || 'text',
      imageUri: messageData.imageUri || null,
      transactionRequestData: messageData.transactionRequestData || null,
      timestamp: messageTimestamp,
    });

    let response = await fetch(`${API_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildPayload()),
    });

    let responseData = await parseJsonResponseSafely(response);

    if (!response.ok && isExplicitReceiverUnavailable(responseData)) {
      await updateMessageStatus(messageId, 'failed');
      throw buildReceiverUnavailableError('Receiver unavailable', {
        responseData,
        receiverId: activeReceiverId || receiverId,
        contactRecordId: String(messageData?.contactRecordId || '').trim(),
      });
    }

    const resolvedStatus = String(responseData?.status || '').toLowerCase();
    const treatAsQueued =
      response.ok &&
      (responseData?.queued === true || resolvedStatus === 'accepted');

    if (response.ok && !treatAsQueued) {
      await updateMessageStatus(messageId, 'sent');
      emitIncomingChatUpdate({
        type: 'message_status_update',
        messageId,
        status: 'sent',
        conversationId: messageData.conversationId || '',
      });
    } else {
      if (!response.ok) {
        console.error('Backend returned error:', responseData);
      } else {
        console.log('Message accepted but queued for delivery:', {
          messageId,
          status: responseData?.status || null,
        });
      }
      await queueMessage(messageId, activeReceiverId || receiverId, messageData);
      await updateMessageStatus(messageId, 'queued');
      emitChatActivity(messageTimestamp);
    }

    return messageId;
  } catch (error) {
    console.error('Error sending message:', error);
    if (error?.code === 'RECEIVER_UNAVAILABLE') {
      throw error;
    }
    await queueMessage(messageId, activeReceiverId || receiverId, messageData);
    await updateMessageStatus(messageId, 'queued');
    emitChatActivity(Number(messageData?.timestamp) || Date.now());
    return messageId;
  }
};

export const ensureValidFcmToken = async ({
  reason = 'init',
  forceRotateIfNeeded = true,
  background = false,
} = {}) => {
  if (tokenHealInFlight) {
    return null;
  }

  const currentUser = auth().currentUser;
  if (!currentUser) {
    return null;
  }

  tokenHealInFlight = true;
  try {
    await messaging().requestPermission();
    let lastTokenError = null;

    const syncIfNeeded = async (candidateToken, sourceLabel) => {
      const fcmToken = String(candidateToken || '').trim();
      if (!fcmToken) {
        return false;
      }

      await setLocalToken(fcmToken);
      const meta = await getStoredSyncMeta();
      const sameAsSynced = meta.syncedToken && meta.syncedToken === fcmToken;
      const freshSync = sameAsSynced && Date.now() - meta.syncedAt < FCM_SYNC_DEDUPE_WINDOW_MS;
      if (freshSync) {
        console.log(`[FCM] token already synced recently (${sourceLabel})`, maskTokenForLog(fcmToken));
        return true;
      }

      const saved = await syncFcmTokenToBackend(fcmToken, reason);
      if (saved) {
        console.log(`[FCM] backend token sync ok (${sourceLabel})`, {
          token: maskTokenForLog(fcmToken),
          reason,
          background,
          sourceLabel,
        });
      } else {
        console.warn(`[FCM] backend token sync failed (${sourceLabel})`, {
          token: maskTokenForLog(fcmToken),
          reason,
          background,
          sourceLabel,
        });
      }
      return saved;
    };

    const quickTryDelays = [0, 1200, 2500];
    for (let i = 0; i < quickTryDelays.length; i += 1) {
      if (quickTryDelays[i] > 0) {
        await waitMs(quickTryDelays[i]);
      }
      let token = null;
      try {
        token = await messaging().getToken();
      } catch (attemptError) {
        lastTokenError = attemptError;
        console.warn(
          `[FCM] getToken attempt ${i + 1} failed:`,
          attemptError?.code || '',
          attemptError?.message || attemptError
        );
        continue;
      }
      if (await syncIfNeeded(token, `getToken:${i + 1}`)) {
        console.log('[FCM] live token fetched', {
          token: maskTokenForLog(token),
          attempt: i + 1,
          reason,
        });
        return token;
      }
    }

    if (forceRotateIfNeeded) {
      try {
        await messaging().deleteToken();
        await waitMs(1200);
        const rotatedToken = await messaging().getToken();
        if (await syncIfNeeded(rotatedToken, 'rotate:getToken')) {
          console.log('[FCM] rotated live token fetched', {
            token: maskTokenForLog(rotatedToken),
            reason,
          });
          return rotatedToken;
        }
      } catch (rotateError) {
        lastTokenError = rotateError;
        console.warn('[FCM] token rotate attempt failed:', rotateError?.message || rotateError);
      }
    }

    console.warn('[FCM] unable to obtain/sync token now; scheduling recovery retry');
    const diag = await captureFcmDiagnostics({
      reason,
      stage: 'token-unavailable',
      error: lastTokenError,
    });
    console.warn('[FCM][DIAG]', JSON.stringify(diag));
    if (!background) {
      scheduleTokenRecovery(reason, 30000);
    }
    return null;
  } catch (error) {
    console.error('[FCM] ensure token failed:', error?.message || error);
    const diag = await captureFcmDiagnostics({
      reason,
      stage: 'ensure-token-catch',
      error,
    });
    console.error('[FCM][DIAG]', JSON.stringify(diag));
    if (!background) {
      scheduleTokenRecovery(reason, 45000);
    }
    return null;
  } finally {
    tokenHealInFlight = false;
  }
};

export const syncPendingMessagesForConversation = async ({
  conversationId,
  sinceTimestamp = 0,
  limit = 100,
} = {}) => {
  const convId = String(conversationId || '').trim();
  if (!convId) {
    return {synced: 0};
  }

  try {
    const token = await getAuthToken();
    const query = new URLSearchParams({
      conversationId: convId,
      sinceTimestamp: String(Math.max(0, Number(sinceTimestamp) || 0)),
      limit: String(Math.min(200, Math.max(1, Number(limit) || 100))),
    }).toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${API_URL}/messages/pending-sync?${query}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseData = await parseJsonResponseSafely(response);
    if (!response.ok) {
      throw new Error(String(responseData?.message || responseData?.error || `HTTP ${response.status}`));
    }

    const messages = Array.isArray(responseData?.messages) ? responseData.messages : [];
    if (!messages.length) {
      return {synced: 0};
    }

    let synced = 0;
    for (const message of messages) {
      const messageId = String(message?.messageId || '').trim();
      if (!messageId) {
        continue;
      }
      const senderId = String(message?.senderId || '').trim();
      const messageText = String(message?.messageText || '');
      const timestamp = Number.parseInt(String(message?.timestamp || Date.now()), 10) || Date.now();

      const result = await applyIncomingChatMessage({
        conversationId: convId,
        senderId,
        senderName: String(message?.senderName || ''),
        messageId,
        messageText,
        messageType: String(message?.messageType || 'text'),
        timestamp,
        skipNotification: true,
      });
      if (!result?.applied) {
        continue;
      }

      DeviceEventEmitter.emit('ledger:chatActivity', {
        contactRecordId: '',
        userId: senderId,
        timestamp,
      });
      synced += 1;
    }

    return {synced};
  } catch (error) {
    console.error('[PENDING_SYNC] Failed to sync pending messages:', error?.message || error);
    return {synced: 0, error: String(error?.message || error)};
  }
};

/**
 * Handle incoming FCM messages (foreground & background)
 */
const readLedgerContacts = async () => {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read ledger contacts:', error);
    return [];
  }
};

const writeLedgerContacts = async contacts => {
  try {
    await AsyncStorage.setItem(LEDGER_CONTACTS_KEY, JSON.stringify(contacts));
  } catch (error) {
    console.error('Failed to write ledger contacts:', error);
  }
};

const findLedgerRecordIdFromChatCache = async sourceUserId => {
  try {
    const expectedId = String(sourceUserId || '');
    if (!expectedId) {
      return null;
    }

    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => key.startsWith(LEDGER_CHAT_CACHE_PREFIX));
    if (!cacheKeys.length) {
      return null;
    }

    const pairs = await AsyncStorage.multiGet(cacheKeys);
    for (const [key, raw] of pairs) {
      if (!raw) {
        continue;
      }

      try {
        const parsed = JSON.parse(raw);
        const cachedUserId = String(parsed?.userId || parsed?.firebaseUid || '');
        if (cachedUserId && cachedUserId === expectedId) {
          return String(key).slice(LEDGER_CHAT_CACHE_PREFIX.length);
        }
      } catch {
        // Ignore malformed cache entries.
      }
    }
  } catch (error) {
    console.error('Failed to resolve ledger record from chat cache:', error);
  }

  return null;
};

const resolveLedgerContactRecordId = async (sourceUserId, sourceName = 'App User') => {
  const contacts = await readLedgerContacts();
  const sourceId = derivePeerUserId({userId: sourceUserId});
  const canonicalRecordId = deriveCanonicalRecordId({userId: sourceId});
  const normalizedSourceName = normalizeValidContactName(sourceName);
  if (!sourceId) return null;

  const existing = contacts.find(item => derivePeerUserId(item) === sourceId);
  if (existing?.recordID) {
    if (String(existing.recordID) === canonicalRecordId) {
      return canonicalRecordId;
    }
    const next = contacts.map(item => {
      if (item !== existing) {
        return item;
      }
      return {
        ...item,
        recordID: canonicalRecordId,
        userId: sourceId,
        firebaseUid: sourceId,
        appInstallState: normalizeInstallState(item?.appInstallState),
        isAppUser: 1,
        displayName: normalizeValidContactName(item?.displayName) || normalizedSourceName || '',
      };
    });
    await writeLedgerContacts(next);
    return canonicalRecordId;
  }

  const mappedRecordId = await findLedgerRecordIdFromChatCache(sourceId);
  if (mappedRecordId) {
    const mappedIdx = contacts.findIndex(item => {
      const recordId = String(item?.recordID || '');
      return recordId === mappedRecordId || recordId === canonicalRecordId;
    });
    if (mappedIdx >= 0) {
      const existingValidName = normalizeValidContactName(contacts[mappedIdx]?.displayName);
      contacts[mappedIdx] = {
        ...contacts[mappedIdx],
        recordID: canonicalRecordId,
        userId: sourceId,
        firebaseUid: sourceId,
        appInstallState: normalizeInstallState(contacts[mappedIdx]?.appInstallState),
        isAppUser: 1,
        displayName: existingValidName || normalizedSourceName || '',
      };
    } else {
      contacts.push({
        recordID: canonicalRecordId,
        displayName: normalizedSourceName || '',
        givenName: '',
        familyName: '',
        phoneNumbers: [],
        isAppUser: 1,
        userId: sourceId,
        firebaseUid: sourceId,
        appInstallState: 'installed',
      });
    }
    await writeLedgerContacts(contacts);
    return canonicalRecordId;
  }

  const recordID = canonicalRecordId;
  contacts.push({
    recordID,
    displayName: normalizedSourceName || '',
    givenName: '',
    familyName: '',
    phoneNumbers: [],
    isAppUser: 1,
    userId: sourceId,
    firebaseUid: sourceId,
    appInstallState: 'installed',
  });
  await writeLedgerContacts(contacts);
  return recordID;
};

const resolveNameFromChatCache = async (contact = {}) => {
  const recordId = String(contact?.recordID || '').trim();
  const explicitUserId = String(contact?.userId || contact?.firebaseUid || '').trim();
  const inferredUserId =
    explicitUserId || (recordId.startsWith('app_') ? recordId.slice(4).trim() : '');
  const keyCandidates = [recordId, inferredUserId ? `app_${inferredUserId}` : '']
    .filter(Boolean)
    .map(key => `${LEDGER_CHAT_CACHE_PREFIX}${key}`);

  if (!keyCandidates.length) {
    return '';
  }

  try {
    const pairs = await AsyncStorage.multiGet(Array.from(new Set(keyCandidates)));
    for (const [, raw] of pairs) {
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        const candidate = normalizeValidContactName(parsed?.displayName);
        if (candidate) {
          return candidate;
        }
      } catch {
        // Ignore malformed cache data.
      }
    }
  } catch (error) {
    console.error('Failed to resolve contact name from chat cache:', error);
  }

  return '';
};

const resolveNameFromDeviceContactsByPhones = async phoneCandidates => {
  const normalizedPhoneSet = new Set(
    (Array.isArray(phoneCandidates) ? phoneCandidates : [])
      .map(phone => normalizePhoneForLookup(phone))
      .filter(Boolean),
  );

  if (!normalizedPhoneSet.size) {
    return '';
  }

  try {
    const raw = await AsyncStorage.getItem(DEVICE_CONTACTS_CACHE_KEY);
    const contacts = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(contacts) || !contacts.length) {
      return '';
    }

    for (const item of contacts) {
      const deviceName = normalizeValidContactName(
        item?.displayNameComputed ||
          item?.displayName ||
          [item?.givenName, item?.familyName].filter(Boolean).join(' ').trim(),
      );
      if (!deviceName) {
        continue;
      }

      const phones = [
        item?.phoneComputed,
        ...(Array.isArray(item?.phoneNumbers) ? item.phoneNumbers.map(entry => entry?.number) : []),
      ];
      const matched = phones.some(phone => normalizedPhoneSet.has(normalizePhoneForLookup(phone)));
      if (matched) {
        return deviceName;
      }
    }
  } catch (error) {
    console.error('Failed to resolve contact name from cached device contacts:', error);
  }

  return '';
};

const migrateLedgerContactPlaceholders = async () => {
  const contacts = await readLedgerContacts();
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return;
  }

  const bestNameByUserId = new Map();
  contacts.forEach(item => {
    const userId = String(item?.userId || item?.firebaseUid || '').trim();
    const validName = normalizeValidContactName(item?.displayName);
    if (userId && validName && !bestNameByUserId.has(userId)) {
      bestNameByUserId.set(userId, validName);
    }
  });

  let changed = false;
  const nextContacts = [];
  for (const item of contacts) {
    const recordID = String(item?.recordID || '').trim();
    const explicitUserId = String(item?.userId || item?.firebaseUid || '').trim();
    const inferredUserId =
      explicitUserId || (recordID.startsWith('app_') ? recordID.slice(4).trim() : '');

    const currentValidName = normalizeValidContactName(item?.displayName);
    const mappedValidName = inferredUserId ? bestNameByUserId.get(inferredUserId) || '' : '';
    const cacheValidName =
      !currentValidName && !mappedValidName ? await resolveNameFromChatCache(item) : '';
    const resolvedName = currentValidName || mappedValidName || cacheValidName || '';

    const nextItem = {
      ...item,
      userId: inferredUserId || '',
      isAppUser:
        item?.isAppUser === true ||
        Number(item?.isAppUser) === 1 ||
        Boolean(inferredUserId) ||
        recordID.startsWith('app_')
          ? 1
          : 0,
      displayName: resolvedName,
    };

    if (
      String(item?.displayName || '').trim() !== nextItem.displayName ||
      String(item?.userId || '').trim() !== nextItem.userId ||
      (item?.isAppUser === true || Number(item?.isAppUser) === 1 ? 1 : 0) !==
        nextItem.isAppUser
    ) {
      changed = true;
    }

    if (inferredUserId && resolvedName && !bestNameByUserId.has(inferredUserId)) {
      bestNameByUserId.set(inferredUserId, resolvedName);
    }
    nextContacts.push(nextItem);
  }

  if (changed) {
    await writeLedgerContacts(nextContacts);
  }
};

const ensureConversationForLedgerEvent = async (
  sourceUserId,
  sourceName,
  contactRecordId = '',
) => {
  const peerUserId = String(sourceUserId || '').trim();
  if (!peerUserId) {
    return '';
  }

  const selfUserId = String(
    auth().currentUser?.uid || (await AsyncStorage.getItem('firebaseUid')) || '',
  ).trim();
  if (!selfUserId || selfUserId === peerUserId) {
    return '';
  }

  try {
    initChatDatabase();
    const convId = createConversation(
      peerUserId,
      {
        userId: peerUserId,
        firebaseUid: peerUserId,
        displayName: normalizeValidContactName(sourceName) || '',
      },
      selfUserId,
    );

    if (convId) {
      const cachePayload = JSON.stringify({
        userId: peerUserId,
        firebaseUid: peerUserId,
        displayName: normalizeValidContactName(sourceName) || '',
        conversationId: convId,
      });
      const cacheKeys = [String(contactRecordId || '').trim(), `app_${peerUserId}`]
        .filter(Boolean)
        .map(recordId => `${LEDGER_CHAT_CACHE_PREFIX}${recordId}`);
      if (cacheKeys.length) {
        await AsyncStorage.multiSet(cacheKeys.map(key => [key, cachePayload]));
      }
    }

    return String(convId || '');
  } catch (error) {
    console.error('Failed to ensure conversation for ledger event:', error);
    return '';
  }
};

const upsertLedgerContactByUser = async (
  sourceUserId,
  sourceName = 'App User',
  options = {},
) => {
  const sourceId = String(sourceUserId || '').trim();
  if (!sourceId) {
    return {recordID: null, contact: null, changed: false};
  }

  const selfUserId = String(auth().currentUser?.uid || '').trim();
  if (selfUserId && sourceId === selfUserId) {
    return {recordID: null, contact: null, changed: false};
  }

  const contacts = await readLedgerContacts();
  const mappedRecordId = await findLedgerRecordIdFromChatCache(sourceId);
  const canonicalRecordId = 'app_' + sourceId;
  const targetRecordId = canonicalRecordId;

  const existingIndex = contacts.findIndex(item => {
    const sameUser = String(item?.userId || item?.firebaseUid || '').trim() === sourceId;
    if (sameUser) {
      return true;
    }
    const recordId = String(item?.recordID || '').trim();
    return recordId === targetRecordId || (mappedRecordId && recordId === mappedRecordId);
  });

  const existing = existingIndex >= 0 ? contacts[existingIndex] : null;
  const optionPhones = Array.from(
    new Set(
      (Array.isArray(options?.phoneCandidates) ? options.phoneCandidates : [options?.senderPhone || ''])
        .map(item => String(item || '').trim())
        .filter(Boolean),
    ),
  );
  const normalizedOptionPhones = optionPhones
    .map(phone => normalizePhoneForLookup(phone))
    .filter(Boolean);
  const existingPhoneNumbers = Array.isArray(existing?.phoneNumbers)
    ? existing.phoneNumbers.filter(item => String(item?.number || '').trim())
    : [];
  const existingPhoneSet = new Set(
    existingPhoneNumbers
      .map(item => normalizePhoneForLookup(item?.number))
      .filter(Boolean),
  );
  normalizedOptionPhones.forEach(phone => existingPhoneSet.add(phone));
  const mergedPhoneNumbers = Array.from(existingPhoneSet).map(number => ({number}));

  const existingValidName = normalizeValidContactName(existing?.displayName);
  const incomingValidName = normalizeValidContactName(sourceName);
  const localDeviceName = await resolveNameFromDeviceContactsByPhones(
    optionPhones,
  );
  const chatCacheName = !existingValidName && !incomingValidName
    ? await resolveNameFromChatCache(existing || {recordID: targetRecordId, userId: sourceId})
    : '';
  const resolvedDisplayName =
    localDeviceName || existingValidName || incomingValidName || chatCacheName || '';
  const merged = {
    ...(existing || {}),
    recordID: targetRecordId,
    displayName: resolvedDisplayName,
    givenName: existing?.givenName || '',
    familyName: existing?.familyName || '',
    phoneNumbers: mergedPhoneNumbers,
    isAppUser: 1,
    userId: sourceId,
    appInstallState: 'installed',
  };

  const existingRecordID = String(existing?.recordID || '').trim();
  const existingDisplayName = normalizeValidContactName(existing?.displayName);
  const existingIsAppUser =
    existing?.isAppUser === true || Number(existing?.isAppUser) === 1 ? 1 : 0;
  const existingUserId = String(existing?.userId || existing?.firebaseUid || '').trim();
  const existingPhoneSignature = JSON.stringify(
    existingPhoneNumbers.map(item => normalizePhoneForLookup(item?.number)).filter(Boolean).sort(),
  );
  const mergedPhoneSignature = JSON.stringify(
    mergedPhoneNumbers.map(item => normalizePhoneForLookup(item?.number)).filter(Boolean).sort(),
  );

  const changed =
    !existing ||
    existingRecordID !== String(merged.recordID || '').trim() ||
    existingDisplayName !== normalizeValidContactName(merged.displayName) ||
    existingIsAppUser !== 1 ||
    existingUserId !== sourceId ||
    existingPhoneSignature !== mergedPhoneSignature;

  if (changed) {
    if (existingIndex >= 0) {
      contacts[existingIndex] = merged;
    } else {
      contacts.push(merged);
    }
    await writeLedgerContacts(contacts);
  }

  return {
    recordID: String(merged.recordID || ''),
    contact: {
      ...merged,
      autoAdded: options.autoAdded === true,
      silent: options.silent === true,
    },
    changed,
  };
};

const wasLedgerEventProcessed = async idempotencyKey => {
  try {
    const raw = await AsyncStorage.getItem(PROCESSED_LEDGER_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return false;
    return parsed.includes(idempotencyKey);
  } catch {
    return false;
  }
};

const markLedgerEventProcessed = async idempotencyKey => {
  try {
    const raw = await AsyncStorage.getItem(PROCESSED_LEDGER_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    if (!list.includes(idempotencyKey)) {
      list.push(idempotencyKey);
    }
    const trimmed = list.slice(-500);
    await AsyncStorage.setItem(PROCESSED_LEDGER_EVENTS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to mark ledger event processed:', error);
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

const decodeCanonicalOriginTxn = rawOriginTxnId => {
  const raw = String(rawOriginTxnId || '').trim();
  if (!raw || !raw.startsWith('canon#')) {
    return null;
  }
  const parts = raw.split('#');
  if (parts.length < 3) {
    return null;
  }
  let decodedSource = '';
  let decodedOrigin = '';
  try {
    decodedSource = decodeURIComponent(String(parts[1] || '')).trim();
    decodedOrigin = decodeURIComponent(String(parts.slice(2).join('#') || '')).trim();
  } catch (error) {
    return null;
  }
  if (!decodedSource || !decodedOrigin) {
    return null;
  }
  return {
    canonicalSourceUserId: decodedSource,
    canonicalOriginTxnId: decodedOrigin,
  };
};

const unpackOriginTxnIdEnvelope = rawOriginTxnId => {
  const raw = String(rawOriginTxnId || '').trim();
  if (!raw) {
    return {originTxnId: '', createdAt: 0};
  }
  const marker = '|ca=';
  const markerIndex = raw.lastIndexOf(marker);
  if (markerIndex <= 0) {
    return {originTxnId: raw, createdAt: 0};
  }
  const base = String(raw.slice(0, markerIndex) || '').trim();
  const createdAtRaw = String(raw.slice(markerIndex + marker.length) || '').trim();
  const createdAtValue = Number(createdAtRaw || 0);
  if (!base || !Number.isFinite(createdAtValue) || createdAtValue <= 0) {
    return {originTxnId: raw, createdAt: 0};
  }
  return {
    originTxnId: base,
    createdAt: Math.floor(createdAtValue),
  };
};

const normalizeLedgerEditHistory = value => {
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

const handleLedgerEvent = async data => {
  const sourceUserId = String(data?.sourceUserId || data?.senderId || '');
  const sourceUserPhone = String(
    data?.sourceUserPhone || data?.source_user_phone || data?.senderPhone || data?.sender_phone || ''
  ).trim();
  const incomingOriginTxnId = String(data?.originTxnId || data?.transactionId || '');
  const unpackedOrigin = unpackOriginTxnIdEnvelope(incomingOriginTxnId);
  const originTxnId = String(unpackedOrigin?.originTxnId || '').trim();
  const op = String(data?.op || 'create');
  const syncMode = String(data?.syncMode || '').toLowerCase();
  const isOldEntriesSync = String(data?.syncMode || '').toLowerCase() === 'old_entries';
  const idempotencyKey = String(
    data?.idempotencyKey || ('ledger:' + sourceUserId + ':' + incomingOriginTxnId + ':' + op)
  );
  const isManualSingleSync =
    syncMode === 'single_entry' || idempotencyKey.startsWith('ledger-manual:');

  if (!sourceUserId || !originTxnId) {
    return;
  }

  if (!isOldEntriesSync && (await wasLedgerEventProcessed(idempotencyKey))) {
    return;
  }

  if (op !== 'create') {
    if (!isOldEntriesSync) {
      await markLedgerEventProcessed(idempotencyKey);
    }
    return;
  }

  initLedgerDatabase();

  const amount = Math.abs(Number(data?.amount || 0));
  if (!amount) {
    await markLedgerEventProcessed(idempotencyKey);
    return;
  }

  const sourceType =
    data?.entryType === 'get' || data?.transactionType === 'get' || data?.type === 'get'
      ? 'get'
      : 'paid';
  const mirroredType = sourceType === 'paid' ? 'get' : 'paid';
  const sourceName = data?.sourceUserName || data?.senderName || 'App User';
  const incomingEditHistory = normalizeLedgerEditHistory(
    data?.editHistory ??
      data?.edit_history ??
      data?.editHistoryJson ??
      data?.edit_history_json ??
      '',
  );
  const upsertedContact = await upsertLedgerContactByUser(sourceUserId, sourceName, {
    autoAdded: true,
    silent: true,
    senderPhone: sourceUserPhone,
    phoneCandidates: [sourceUserPhone],
  });
  const contactRecordId =
    String(upsertedContact?.recordID || '').trim() ||
    (await resolveLedgerContactRecordId(sourceUserId, sourceName));

  if (!contactRecordId) {
    return;
  }

  if (upsertedContact?.changed && upsertedContact?.contact) {
    DeviceEventEmitter.emit('ledger:addContact', upsertedContact.contact);
  }

  await ensureConversationForLedgerEvent(
    sourceUserId,
    sourceName,
    contactRecordId,
  );

  const syncEnabled = await isLedgerSyncEnabledForContact(contactRecordId);
  if (!syncEnabled) {
    if (!isOldEntriesSync) {
      await markLedgerEventProcessed(idempotencyKey);
    }
    console.log('[LEDGER_SYNC] Incoming ledger event skipped - disabled for contact', {
      contactRecordId,
      sourceUserId,
      originTxnId,
    });
    return;
  }

  const incomingTimestampRaw = Number(
    data?.timestamp || data?.transactionDate || data?.transaction_date || 0
  );
  const incomingTimestamp =
    Number.isFinite(incomingTimestampRaw) && incomingTimestampRaw > 0
      ? Math.floor(incomingTimestampRaw)
      : Date.now();
  const forwardedCreatedAt = Number(unpackedOrigin?.createdAt || 0);
  const createdAtTimestamp =
    Number.isFinite(forwardedCreatedAt) && forwardedCreatedAt > 0
      ? Math.floor(forwardedCreatedAt)
      : 0;
  const canonicalOrigin = decodeCanonicalOriginTxn(originTxnId);
  const originSourceUserId =
    String(canonicalOrigin?.canonicalSourceUserId || sourceUserId || '').trim();
  const originTxnKey =
    String(canonicalOrigin?.canonicalOriginTxnId || originTxnId || '').trim();
  const sourceOriginKey = `${originSourceUserId}:${originTxnKey}`;

  createLedgerTransaction(contactRecordId, amount, mirroredType, String(data?.note || ''), {
    sourceUserId: originSourceUserId,
    sourceOriginKey,
    transactionDate: incomingTimestamp,
    createdAt: createdAtTimestamp,
    allowUpsertByOrigin: true,
    syncTag: isManualSingleSync ? 'synced' : null,
    editHistory: incomingEditHistory,
  });
  if (!isOldEntriesSync) {
    await markLedgerEventProcessed(idempotencyKey);
  }

  DeviceEventEmitter.emit('ledger:updated', {
    contactRecordId,
    sourceUserId,
    originTxnId,
    op,
  });
};

export const handleIncomingMessage = async (remoteMessage) => {
  try {
    const receiveStartedAt = Date.now();
    ensureChatDatabaseInitialized();
    const {data} = remoteMessage;

    if (!data || !data.type) {
      console.log('Invalid message data');
      return;
    }

    if (data.type === 'ledger_event') {
      await handleLedgerEvent(data);
      return;
    }

    if (data.type === 'phone_claim_request') {
      const payload = {
        type: 'phone_claim_request',
        claimId: String(data?.claimId || data?.claim_id || '').trim(),
        requesterId: String(data?.requesterId || data?.requester_id || '').trim(),
        requesterName: String(data?.requesterName || data?.requester_name || '').trim(),
        phoneNormalized: String(data?.phoneNormalized || data?.phone_normalized || '').trim(),
        phoneLastFour: String(data?.phoneLastFour || data?.phone_last_four || '').trim(),
        eventId: String(data?.eventId || data?.event_id || '').trim(),
        notifVersion: String(data?.notifVersion || data?.notif_version || '').trim(),
      };
      await storePendingPhoneClaimNavigation(payload);
      if (String(AppState.currentState || '').trim().toLowerCase() !== 'active') {
        await displayPhoneClaimRequestNotification(payload);
      }
      return;
    }

    if (data.type === 'phone_claim_result') {
      await displayPhoneClaimResultNotification({
        type: 'phone_claim_result',
        status: String(data?.status || '').trim(),
        claimId: String(data?.claimId || data?.claim_id || '').trim(),
        phoneNormalized: String(data?.phoneNormalized || data?.phone_normalized || '').trim(),
        phoneLastFour: String(data?.phoneLastFour || data?.phone_last_four || '').trim(),
        eventId: String(data?.eventId || data?.event_id || '').trim(),
        notifVersion: String(data?.notifVersion || data?.notif_version || '').trim(),
      });
      return;
    }

    if (data.type === 'chat_message') {
      const messageId = normalizeIncomingMessageId(remoteMessage, data);
      const conversationId = String(data?.conversationId || data?.conversation_id || '');
      const senderId = String(data?.senderId || data?.sender_id || '');
      const senderName = String(data?.senderName || data?.sender_name || '');
      const senderPhone = String(data?.senderPhone || data?.sender_phone || '').trim();
      const payloadContactRecordId = String(
        data?.contactRecordId || data?.contact_record_id || ''
      ).trim();
      const messageText = String(data?.messageText || data?.message_text || '');
      const messageType = String(data?.messageType || data?.message_type || 'text');
      const timestamp = Number.parseInt(
        String(data?.timestamp || remoteMessage?.sentTime || Date.now()),
        10,
      );

      if (!conversationId || !senderId) {
        console.log('Invalid chat message payload - missing conversationId/senderId');
        return;
      }

      console.log('Incoming chat message received:', {
        messageId,
        conversationId,
        senderName,
        messageText: messageText.substring(0, 50) + '...',
      });
      logChatLatency('FCM_RECEIVED', {
        messageId,
        conversationId,
        senderId,
        appState: AppState.currentState,
        receiveDelayMs: Math.max(0, receiveStartedAt - timestamp),
        sentTimeSkewMs: Math.max(
          0,
          receiveStartedAt -
            Number(remoteMessage?.sentTime || data?.timestamp || receiveStartedAt),
        ),
      });

      if (hasIncomingMessageBeenProcessed(messageId)) {
        console.log('Duplicate message skipped (in-memory):', messageId);
        return;
      }
      markIncomingMessageProcessed(messageId);

      if (getMessageById(messageId)) {
        console.log('Duplicate message skipped (db):', messageId);
        return;
      }

      const optimisticContactRecordId = String(
        payloadContactRecordId || `app_${senderId}`
      ).trim();
      const incomingResult = await applyIncomingChatMessage({
        conversationId,
        senderId,
        senderName,
        senderPhone,
        contactRecordId: optimisticContactRecordId,
        messageId,
        messageText,
        messageType,
        imageUri: data.imageUri || data.image_uri || null,
        transactionRequestData: data.transactionRequestData || data.transaction_request_data || null,
        timestamp,
        data,
      });
      logChatLatency('HANDLE_COMPLETE', {
        messageId,
        conversationId,
        senderId,
        totalHandleMs: Date.now() - receiveStartedAt,
        endToEndMs: Math.max(0, Date.now() - timestamp),
      });
      if (incomingResult?.applied) {
        DeviceEventEmitter.emit('ledger:chatActivity', {
          contactRecordId: optimisticContactRecordId,
          userId: senderId,
          timestamp,
        });
      }

      void (async () => {
        try {
          const upsertedContact = await upsertLedgerContactByUser(
            senderId,
            senderName || 'Contact',
            {
              autoAdded: true,
              silent: true,
              senderPhone,
              phoneCandidates: [senderPhone],
            }
          );
          if (upsertedContact?.changed && upsertedContact?.contact) {
            DeviceEventEmitter.emit('ledger:addContact', upsertedContact.contact);
          }
        } catch (upsertError) {
          console.error('Failed to finish incoming contact upsert:', upsertError);
        }
      })();
    }

    if (data.type === 'delivery_receipt') {
      console.log('📦 [RECEIPT] Delivery receipt received:', {
        messageId: data.messageId,
        status: data.status,
      });
      // Update message delivery status
      await updateMessageStatus(data.messageId, data.status);
      console.log('✅ [RECEIPT] Message status updated to:', data.status);
      emitIncomingChatUpdate({
        type: 'delivery_receipt',
        messageId: data.messageId,
        status: data.status,
        conversationId: data.conversationId || '',
      });
    }

    if (data.type === 'read_receipt') {
      console.log('👁️ [RECEIPT] Read receipt received:', {
        messageId: data.messageId,
      });
      // Update message read status
      await updateMessageStatus(data.messageId, 'read');
      console.log('✅ [RECEIPT] Message status updated to: read');
      emitIncomingChatUpdate({
        type: 'read_receipt',
        messageId: data.messageId,
        status: 'read',
        conversationId: data.conversationId || '',
      });
    }
  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
};

/**
 * Send delivery receipt back to sender
 */
export const sendDeliveryReceipt = async (
  senderId,
  messageId,
  status,
  authTokenOverride = null,
) => {
  try {
    const token = String(authTokenOverride || '').trim() || (await getAuthToken());

    await fetch(`${API_URL}/messages/delivery-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        senderId,
        messageId,
        status, // 'delivered' or 'read'
      }),
    });
  } catch (error) {
    console.error('Error sending delivery receipt:', error);
  }
};

/**
 * Setup FCM listeners (foreground only).
 * Background handler is registered at entry point (index.js) for killed-state reliability.
 */
export const setupFCMListeners = () => {
  if (fcmListenersInitialized) {
    console.log('FCM listeners already setup, skipping duplicate registration');
    return;
  }
  fcmListenersInitialized = true;

  // Foreground message handler
  messaging().onMessage(async remoteMessage => {
    console.log('Foreground message received:', remoteMessage);
    await handleIncomingMessage(remoteMessage);
  });

  console.log('FCM listeners setup complete (foreground only; background handler entry-registered)');
};

/**
 * Process pending messages (retry failed sends)
 */
export const processPendingMessages = async () => {
  if (pendingMessageProcessingInFlight) {
    if (__DEV__) {
      console.log('[PENDING_QUEUE] process skipped (already running)');
    }
    return;
  }

  pendingMessageProcessingInFlight = true;
  try {
    const pendingMessages = getPendingMessages();

    if (pendingMessages.length === 0) {
      return;
    }

    console.log(`Processing ${pendingMessages.length} pending messages...`);

    for (const queuedMessage of pendingMessages) {
      try {
        let messageData = {};
        try {
          messageData = JSON.parse(queuedMessage.message_data || '{}');
        } catch (parseError) {
          console.error(
            `[PENDING_QUEUE] invalid message_data; dropping queue item ${queuedMessage.queue_id}:`,
            parseError,
          );
          removeFromQueue(queuedMessage.queue_id);
          continue;
        }

        const token = await getAuthToken();
        const currentUserId = auth().currentUser?.uid;
        const conversationId = String(
          messageData?.conversationId || queuedMessage.conversation_id || '',
        ).trim();
        const conversation = conversationId ? getConversation(conversationId) : null;
        let activeReceiverId = String(
          queuedMessage.receiver_id ||
            messageData?.receiverId ||
            conversation?.other_user_id ||
            '',
        ).trim();

        if (!activeReceiverId) {
          const delayMs = computePendingRetryDelayMs(queuedMessage.retry_count);
          incrementRetryCount(queuedMessage.queue_id, {delayMs});
          console.warn(
            `[PENDING_QUEUE] receiver unresolved for ${queuedMessage.message_id}, retry scheduled in ${Math.round(
              delayMs / 1000,
            )}s`,
          );
          continue;
        }

        const buildPayload = () => ({
          conversationId,
          senderId: String(messageData?.senderId || currentUserId || '').trim(),
          receiverId: activeReceiverId,
          messageId: queuedMessage.message_id,
          messageText: messageData?.messageText || '',
          messageType: messageData?.messageType || 'text',
          imageUri: messageData?.imageUri || null,
          transactionRequestData: messageData?.transactionRequestData || null,
          timestamp: Number(messageData?.timestamp) || Date.now(),
        });

        // Retry sending
        let response = await fetch(`${API_URL}/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(buildPayload()),
        });

        let responseData = await parseJsonResponseSafely(response);
        if (!response.ok && isExplicitReceiverUnavailable(responseData)) {
          removeFromQueue(queuedMessage.queue_id);
          await updateMessageStatus(queuedMessage.message_id, 'failed');
          console.log(
            `Message ${queuedMessage.message_id} marked unavailable; removed from retry queue`,
          );
          continue;
        }

        const resolvedStatus = String(responseData?.status || '').toLowerCase();
        const treatAsQueued =
          response.ok &&
          (responseData?.queued === true || resolvedStatus === 'accepted');

        if (response.ok && !treatAsQueued) {
          // Success - remove from queue
          removeFromQueue(queuedMessage.queue_id);
          await updateMessageStatus(queuedMessage.message_id, 'sent');
          console.log(`Message ${queuedMessage.message_id} sent successfully`);
        } else {
          if (response.ok && treatAsQueued) {
            // Backend has accepted/queued it, so local retry queue should stop retrying.
            removeFromQueue(queuedMessage.queue_id);
            await updateMessageStatus(queuedMessage.message_id, 'queued');
            console.log(
              `Message ${queuedMessage.message_id} accepted by backend queue; local retry removed`,
            );
          } else {
            // Failed - increment retry count
            const delayMs = computePendingRetryDelayMs(queuedMessage.retry_count);
            incrementRetryCount(queuedMessage.queue_id, {delayMs});
            console.log(
              `Message ${queuedMessage.message_id} retry ${
                queuedMessage.retry_count + 1
              }/3 failed (next in ${Math.round(delayMs / 1000)}s)`,
            );
          }
        }
      } catch (error) {
        // Error - increment retry count
        const delayMs = computePendingRetryDelayMs(queuedMessage.retry_count);
        incrementRetryCount(queuedMessage.queue_id, {delayMs});
        console.error('Error retrying message:', error);
      }
    }
  } catch (error) {
    console.error('Error processing pending messages:', error);
  } finally {
    pendingMessageProcessingInFlight = false;
  }
};

/**
 * Setup network state listener for auto-retry
 */
export const setupNetworkListener = () => {
  if (networkListenerInitialized) {
    return;
  }
  networkListenerInitialized = true;

  const NetInfo = require('@react-native-community/netinfo');

  NetInfo.addEventListener(state => {
    if (state.isConnected) {
      console.log('Online - processing pending messages');
      processPendingMessages();
    }
  });
};

/**
 * Update FCM token on token refresh
 */
export const setupTokenRefreshListener = () => {
  if (tokenRefreshListenerInitialized) {
    return;
  }
  tokenRefreshListenerInitialized = true;

  messaging().onTokenRefresh(async fcmToken => {
    console.log('FCM token refreshed:', fcmToken);

    try {
      await setLocalToken(fcmToken);
      const saved = await syncFcmTokenToBackend(fcmToken, 'token_refresh');
      if (!saved) {
        scheduleTokenRecovery('token_refresh_failed', 25000);
      }
    } catch (error) {
      console.error('Error updating FCM token:', error);
      scheduleTokenRecovery('token_refresh_exception', 25000);
    }
  });
};

export const setupAppStateTokenListener = () => {
  if (appStateTokenListenerInitialized) {
    return;
  }
  appStateTokenListenerInitialized = true;

  AppState.addEventListener('change', async nextState => {
    if (nextState === 'active') {
      await ensureValidFcmToken({
        reason: 'app_active',
        forceRotateIfNeeded: false,
        background: true,
      });
    }
  });
};

/**
 * Initialize messaging service
 */
export const initMessagingService = async () => {
  try {
    // Initialize chat database first (creates all tables)
    console.log('🗄️ Initializing chat database...');
    ensureChatDatabaseInitialized();
    console.log('✅ Chat database initialized');
    await migrateLedgerContactPlaceholders();

    // Request/sync token with retry + self-heal path.
    const fcmToken = await ensureValidFcmToken({ reason: 'init', forceRotateIfNeeded: true });
    console.log('FCM Token obtained:', fcmToken ? `${fcmToken.substring(0, 20)}...` : 'null');

    if (!fcmToken) {
      console.warn('No FCM token received');
    }

    // Setup listeners
    setupFCMListeners();
    setupTokenRefreshListener();
    setupAppStateTokenListener();
    setupNetworkListener();

    console.log('✅ Messaging service initialized');
  } catch (error) {
    console.error('❌ Error initializing messaging service:', error);
  }
};

export default {
  requestNotificationPermission,
  sendMessageToUser,
  handleIncomingMessage,
  sendDeliveryReceipt,
  setupFCMListeners,
  subscribeToIncomingMessages,
  processPendingMessages,
  setupNetworkListener,
  setupTokenRefreshListener,
  setupAppStateTokenListener,
  ensureValidFcmToken,
  syncPendingMessagesForConversation,
  initMessagingService,
};
