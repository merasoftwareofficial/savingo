import {AppState} from 'react-native';
import {
  markConversationReadWithReceipts,
} from './chatDatabase';
import {clearChatThreadNotificationState} from './chatNotificationV2Service';

const normalizeText = value => String(value || '').trim();
const DIRECT_OPEN_MODE = 'direct';
const PUSH_OPEN_MODE = 'push';
const NON_RETURN_ROUTE_NAMES = new Set(['', 'Boot', 'Login', 'ProfileSetup']);

const activeConversationState = {
  conversationId: '',
  contactRecordId: '',
  focused: false,
  visible: false,
};

const buildSnapshot = () => ({
  conversationId: activeConversationState.conversationId,
  contactRecordId: activeConversationState.contactRecordId,
  focused: activeConversationState.focused,
  visible: activeConversationState.visible,
});

const isActiveStateVisible = () =>
  Boolean(AppState.currentState === 'active' && activeConversationState.focused && activeConversationState.visible);

const isMatchingActiveConversation = ({conversationId, contactRecordId} = {}) => {
  if (!isActiveStateVisible()) {
    return false;
  }

  const convId = normalizeText(conversationId);
  const recordId = normalizeText(contactRecordId);
  if (convId && convId === activeConversationState.conversationId) {
    return true;
  }
  return Boolean(
    !convId &&
      recordId &&
      recordId === activeConversationState.contactRecordId,
  );
};

export const setActiveConversation = ({
  conversationId,
  contactRecordId,
  focused = true,
  visible = true,
} = {}) => {
  const nextConversationId = normalizeText(conversationId);
  const nextContactRecordId = normalizeText(contactRecordId);

  if (!nextConversationId && !nextContactRecordId) {
    activeConversationState.focused = Boolean(focused);
    activeConversationState.visible = Boolean(visible);
    return buildSnapshot();
  }

  activeConversationState.conversationId = nextConversationId;
  activeConversationState.contactRecordId = nextContactRecordId;
  activeConversationState.focused = Boolean(focused);
  activeConversationState.visible = Boolean(visible);
  return buildSnapshot();
};

export const clearActiveConversation = () => {
  activeConversationState.conversationId = '';
  activeConversationState.contactRecordId = '';
  activeConversationState.focused = false;
  activeConversationState.visible = false;
};

export const getActiveConversation = () => buildSnapshot();

export const evaluateConversationOpen = identity => ({
  isOpen: isMatchingActiveConversation(identity),
  activeConversation: buildSnapshot(),
});

export const evaluateIncomingMessage = identity => {
  const isOpen = isMatchingActiveConversation(identity);
  return {
    isOpen,
    markReadNow: isOpen,
    incrementUnread: !isOpen,
    receiptStatus: isOpen ? 'read' : 'delivered',
    showNotification: !isOpen,
    dismissNotification: isOpen,
  };
};

export const evaluateNotificationOpen = identity => {
  const isSameActiveConversation = isMatchingActiveConversation(identity);
  return {
    isSameActiveConversation,
    shouldNavigate: !isSameActiveConversation,
    shouldMarkRead: true,
    shouldDismissNotification: true,
  };
};

export const resolveConversationOpenIntent = ({
  conversationId,
  contactRecordId,
  currentRoute,
  defaultFallbackRoute = null,
} = {}) => {
  const conversationIdentity = {
    conversationId,
    contactRecordId,
  };
  const notificationPolicy = evaluateNotificationOpen(conversationIdentity);
  if (!notificationPolicy.shouldNavigate) {
    return {
      ...notificationPolicy,
      openMode: DIRECT_OPEN_MODE,
      returnTo: null,
      fallbackRoute: defaultFallbackRoute,
    };
  }

  const currentRouteName = normalizeText(currentRoute?.name);
  const hasCurrentScreen = Boolean(
    currentRouteName && !NON_RETURN_ROUTE_NAMES.has(currentRouteName),
  );
  const currentParams =
    currentRoute?.params && typeof currentRoute.params === 'object'
      ? currentRoute.params
      : {};

  return {
    ...notificationPolicy,
    openMode: hasCurrentScreen ? PUSH_OPEN_MODE : DIRECT_OPEN_MODE,
    returnTo: hasCurrentScreen
      ? {
          name: currentRouteName,
          params: currentParams,
        }
      : null,
    fallbackRoute: defaultFallbackRoute,
  };
};

export const resolveDirectBackBehavior = ({
  openMode,
  returnTo,
  fallbackRoute,
  canGoBack = false,
} = {}) => {
  const mode = normalizeText(openMode);
  if (mode !== DIRECT_OPEN_MODE) {
    return {
      action: canGoBack ? 'go_back' : 'fallback',
      target: canGoBack ? null : fallbackRoute || null,
    };
  }
  if (returnTo?.name) {
    return {
      action: 'return_to',
      target: returnTo,
    };
  }
  if (canGoBack) {
    return {
      action: 'go_back',
      target: null,
    };
  }
  return {
    action: 'fallback',
    target: fallbackRoute || null,
  };
};

export const handleNotificationClear = async ({conversationId} = {}) => {
  const convId = normalizeText(conversationId);
  if (!convId) {
    return false;
  }
  await clearChatThreadNotificationState(convId);
  return true;
};

export const handleConversationSeen = async ({
  conversationId,
  selfUserId,
  sendReadReceipt,
} = {}) => {
  const convId = normalizeText(conversationId);
  const selfId = normalizeText(selfUserId);
  if (!convId || !selfId) {
    return {marked: false, unreadCount: 0};
  }

  const unreadIncoming = markConversationReadWithReceipts(convId, selfId);

  if (typeof sendReadReceipt === 'function') {
    // All receipts are already persisted atomically. One callback starts the
    // shared queue drain; avoid re-enqueueing every successfully flushed row.
    for (const message of unreadIncoming.slice(0, 1)) {
      const senderId = normalizeText(message?.sender_id);
      const messageId = normalizeText(message?.message_id);
      if (!senderId || !messageId) {
        continue;
      }
      try {
        await sendReadReceipt(senderId, messageId, 'read');
      } catch (error) {
        console.error('[CHAT_SYSTEM] read receipt failed:', messageId, error);
      }
    }
  }

  await handleNotificationClear({conversationId: convId});
  return {
    marked: true,
    unreadCount: unreadIncoming.length,
  };
};

export default {
  setActiveConversation,
  clearActiveConversation,
  getActiveConversation,
  evaluateConversationOpen,
  evaluateIncomingMessage,
  evaluateNotificationOpen,
  resolveConversationOpenIntent,
  resolveDirectBackBehavior,
  handleConversationSeen,
  handleNotificationClear,
};
