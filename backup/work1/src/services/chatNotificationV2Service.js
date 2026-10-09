import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AuthorizationStatus,
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
} from '@notifee/react-native';
import {Platform} from 'react-native';
import {getUnreadCount} from './chatDatabase';
import {evaluateIncomingMessage} from './chatSystem';

const CHAT_V2_CHANNEL_ID = 'chat_messages_v2';
const CHAT_V2_THREAD_PREFIX = 'chatNotifV2:thread:';
const MAX_THREAD_MESSAGES = 20;
const MAX_STYLE_MESSAGES = 7;

const normalizeText = value => String(value || '').trim();
const toNumber = value => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : Date.now();
};

const sanitizeForNotificationId = value =>
  normalizeText(value).replace(/[^a-zA-Z0-9_.-]/g, '_');

const readThreadKey = conversationId => `${CHAT_V2_THREAD_PREFIX}${conversationId}`;
const logChatNotif = (event, payload = {}) => {
  if (!__DEV__) {
    return;
  }
  console.log('[CHAT_NOTIF_V2]', event, payload);
};

const isNotificationAuthGranted = status =>
  status === AuthorizationStatus.AUTHORIZED ||
  status === AuthorizationStatus.PROVISIONAL;

export const getNotificationPermissionSnapshot = async () => {
  try {
    const settings = await notifee.getNotificationSettings();
    const status = settings?.authorizationStatus;
    return {
      granted: isNotificationAuthGranted(status),
      status,
    };
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] permission snapshot failed:', error);
    return {
      granted: false,
      status: 'error',
    };
  }
};

const ensureNotificationPermission = async () => {
  try {
    const snapshot = await getNotificationPermissionSnapshot();
    const status = snapshot?.status;
    if (isNotificationAuthGranted(status)) {
      return {granted: true, status, source: 'existing'};
    }

    const requested = await notifee.requestPermission();
    const requestedStatus = requested?.authorizationStatus;
    return {
      granted: isNotificationAuthGranted(requestedStatus),
      status: requestedStatus,
      source: 'requested',
    };
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] permission check failed:', error);
    return {granted: false, status: 'error', source: 'error'};
  }
};

const readThreadMessages = async conversationId => {
  try {
    const key = readThreadKey(conversationId);
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] read thread failed:', error);
    return [];
  }
};

const writeThreadMessages = async (conversationId, messages) => {
  try {
    const key = readThreadKey(conversationId);
    await AsyncStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] write thread failed:', error);
  }
};

const upsertThreadMessage = (existingMessages, nextMessage) => {
  const messageId = normalizeText(nextMessage?.messageId);
  const list = Array.isArray(existingMessages) ? [...existingMessages] : [];
  const existingIndex = list.findIndex(item => normalizeText(item?.messageId) === messageId);

  if (existingIndex >= 0) {
    list[existingIndex] = {
      ...list[existingIndex],
      ...nextMessage,
    };
  } else {
    list.push(nextMessage);
  }

  list.sort((a, b) => toNumber(a?.timestamp) - toNumber(b?.timestamp));
  return list.slice(-MAX_THREAD_MESSAGES);
};

const toMessagingStyleMessages = messages =>
  messages.slice(-MAX_STYLE_MESSAGES).map(item => ({
    text: normalizeText(item?.text),
    timestamp: toNumber(item?.timestamp),
    person: {
      name: normalizeText(item?.personName) || 'Contact',
      ...(normalizeText(item?.personPhotoURL)
        ? {icon: normalizeText(item?.personPhotoURL)}
        : {}),
    },
  }));

export const buildChatThreadNotificationId = conversationId =>
  `chat_thread_${sanitizeForNotificationId(conversationId)}`;

const ensureChatNotificationChannel = async () => {
  await notifee.createChannel({
    id: CHAT_V2_CHANNEL_ID,
    name: 'Chat Messages',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
  return CHAT_V2_CHANNEL_ID;
};

const buildNotificationData = payload => ({
  notifVersion: normalizeText(payload?.notifVersion || 'v3'),
  eventId: normalizeText(payload?.eventId),
  conversationId: normalizeText(payload?.conversationId),
  senderId: normalizeText(payload?.senderId),
  senderPhone: normalizeText(payload?.senderPhone),
  senderName: normalizeText(payload?.senderName),
  senderPhotoURL: normalizeText(payload?.senderPhotoURL),
  contactRecordId: normalizeText(payload?.contactRecordId),
  messageId: normalizeText(payload?.messageId),
  notificationId: normalizeText(payload?.notificationId),
});

export const clearChatThreadNotification = async conversationId => {
  const convId = normalizeText(conversationId);
  if (!convId) {
    return;
  }
  const notificationId = buildChatThreadNotificationId(convId);
  try {
    await notifee.cancelNotification(notificationId);
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] clear notification failed:', error);
  }
};

export const clearChatThreadNotificationState = async conversationId => {
  const convId = normalizeText(conversationId);
  if (!convId) {
    return;
  }

  await clearChatThreadNotification(convId);
  try {
    await AsyncStorage.removeItem(readThreadKey(convId));
  } catch (error) {
    console.error('[CHAT_NOTIF_V2] clear thread state failed:', error);
  }
};

export const upsertIncomingChatThreadNotification = async payload => {
  const conversationId = normalizeText(payload?.conversationId);
  if (!conversationId) {
    return;
  }
  const incomingPolicy = evaluateIncomingMessage({
    conversationId,
    contactRecordId: normalizeText(payload?.contactRecordId),
  });
  if (!incomingPolicy.showNotification) {
    if (incomingPolicy.dismissNotification) {
      await clearChatThreadNotificationState(conversationId);
    }
    logChatNotif('incoming-render-skip-active-thread', {
      conversationId,
    });
    return;
  }

  const senderName = normalizeText(payload?.senderName) || 'Contact';
  const senderPhotoURL = normalizeText(payload?.senderPhotoURL);
  const messageText = normalizeText(payload?.messageText) || 'New message';
  const messageId = normalizeText(payload?.messageId) || `msg_${Date.now()}`;
  const timestamp = toNumber(payload?.timestamp);
  const senderId = normalizeText(payload?.senderId);
  const contactRecordId = normalizeText(payload?.contactRecordId);

  const threadMessages = await readThreadMessages(conversationId);
  const nextMessages = upsertThreadMessage(threadMessages, {
    messageId,
    text: messageText,
    timestamp,
    personName: senderName,
    personPhotoURL: senderPhotoURL,
  });
  await writeThreadMessages(conversationId, nextMessages);

  const unreadCount = getUnreadCount(conversationId);
  const notificationId = buildChatThreadNotificationId(conversationId);
  logChatNotif('incoming-render-attempt', {
    conversationId,
    notificationId,
    messageId,
    unreadCount,
  });

  const permission = await ensureNotificationPermission();
  if (!permission.granted) {
    logChatNotif('incoming-render-skip-permission', {
      conversationId,
      notificationId,
      status: permission.status,
      source: permission.source,
    });
    return;
  }

  const channelId = await ensureChatNotificationChannel();
  if (Platform.OS === 'android') {
    try {
      const isBlocked = await notifee.isChannelBlocked(channelId);
      if (isBlocked) {
        logChatNotif('incoming-render-skip-channel-blocked', {
          conversationId,
          notificationId,
          channelId,
        });
        return;
      }
    } catch (channelError) {
      console.error('[CHAT_NOTIF_V2] channel blocked check failed:', channelError);
    }
  }

  try {
    await notifee.displayNotification({
      id: notificationId,
      title: senderName,
      body: unreadCount > 1 ? `${messageText} (${unreadCount} unread)` : messageText,
      data: buildNotificationData({
        conversationId,
        senderId,
        senderPhone: normalizeText(payload?.senderPhone),
        senderName,
        senderPhotoURL,
        contactRecordId,
        messageId,
        notificationId,
      }),
      android: {
        channelId,
        smallIcon: 'ic_launcher',
        ...(senderPhotoURL ? {largeIcon: senderPhotoURL} : {}),
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'chat_open',
          launchActivity: 'default',
        },
        actions: [
          {
            title: 'Reply',
            pressAction: {id: 'chat_reply'},
            input: true,
          },
          {
            title: 'Mark as read',
            pressAction: {id: 'chat_mark_read'},
          },
        ],
        style: {
          type: AndroidStyle.MESSAGING,
          person: {
            name: senderName,
            ...(senderPhotoURL ? {icon: senderPhotoURL} : {}),
          },
          messages: toMessagingStyleMessages(nextMessages),
          conversationTitle: senderName,
          groupConversation: false,
        },
      },
    });
    logChatNotif('incoming-render-success', {
      conversationId,
      notificationId,
      unreadCount,
      styleMessageCount: nextMessages.slice(-MAX_STYLE_MESSAGES).length,
    });
  } catch (displayError) {
    console.error('[CHAT_NOTIF_V2] incoming display failed:', displayError);
  }
};

export const appendOutgoingReplyToThreadNotification = async payload => {
  const conversationId = normalizeText(payload?.conversationId);
  if (!conversationId) {
    return;
  }
  const messageText = normalizeText(payload?.messageText);
  if (!messageText) {
    return;
  }

  const threadMessages = await readThreadMessages(conversationId);
  const nextMessages = upsertThreadMessage(threadMessages, {
    messageId: normalizeText(payload?.messageId) || `reply_${Date.now()}`,
    text: messageText,
    timestamp: toNumber(payload?.timestamp),
    personName: 'You',
  });
  await writeThreadMessages(conversationId, nextMessages);

  const senderName = normalizeText(payload?.senderName) || 'Chat';
  const senderPhotoURL = normalizeText(payload?.senderPhotoURL);
  const notificationId = buildChatThreadNotificationId(conversationId);
  const permission = await ensureNotificationPermission();
  if (!permission.granted) {
    logChatNotif('reply-render-skip-permission', {
      conversationId,
      notificationId,
      status: permission.status,
      source: permission.source,
    });
    return;
  }
  const channelId = await ensureChatNotificationChannel();

  try {
    await notifee.displayNotification({
      id: notificationId,
      title: senderName,
      body: messageText,
      data: buildNotificationData({
        conversationId,
        senderId: normalizeText(payload?.senderId),
        senderPhone: normalizeText(payload?.senderPhone),
        senderName,
        senderPhotoURL,
        contactRecordId: normalizeText(payload?.contactRecordId),
        messageId: normalizeText(payload?.messageId),
        notificationId,
      }),
      android: {
        channelId,
        smallIcon: 'ic_launcher',
        ...(senderPhotoURL ? {largeIcon: senderPhotoURL} : {}),
        category: AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'chat_open',
          launchActivity: 'default',
        },
        actions: [
          {
            title: 'Reply',
            pressAction: {id: 'chat_reply'},
            input: true,
          },
          {
            title: 'Mark as read',
            pressAction: {id: 'chat_mark_read'},
          },
        ],
        style: {
          type: AndroidStyle.MESSAGING,
          person: {
            name: senderName,
            ...(senderPhotoURL ? {icon: senderPhotoURL} : {}),
          },
          messages: toMessagingStyleMessages(nextMessages),
          conversationTitle: senderName,
          groupConversation: false,
        },
      },
    });
    logChatNotif('reply-render-success', {
      conversationId,
      notificationId,
      styleMessageCount: nextMessages.slice(-MAX_STYLE_MESSAGES).length,
    });
  } catch (displayError) {
    console.error('[CHAT_NOTIF_V2] reply display failed:', displayError);
  }
};
