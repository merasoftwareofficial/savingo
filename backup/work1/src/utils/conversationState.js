/**
 * Backward-compatible conversation state facade.
 * Runtime truth now lives in chatSystem.
 */

import {
  clearActiveConversation,
  evaluateConversationOpen,
  getActiveConversation,
  setActiveConversation,
} from '../services/chatSystem';

const DEBUG_CONVERSATION_STATE = false;

const logConversationState = (...args) => {
  if (__DEV__ && DEBUG_CONVERSATION_STATE) {
    console.log('[CONV_STATE]', ...args);
  }
};

export const setCurrentOpenConversation = conversationId => {
  const active = getActiveConversation();
  setActiveConversation({
    conversationId,
    contactRecordId: active.contactRecordId,
    focused: active.focused,
    visible: active.visible,
  });
  logConversationState('set-open-conversation', conversationId);
};

export const clearCurrentOpenConversation = () => {
  clearActiveConversation();
  logConversationState('clear-open-conversation');
};

export const setConversationScreenFocused = focused => {
  const active = getActiveConversation();
  setActiveConversation({
    conversationId: active.conversationId,
    contactRecordId: active.contactRecordId,
    focused,
    visible: focused,
  });
  logConversationState('screen-focused', Boolean(focused));
};

export const getCurrentOpenConversationId = () =>
  getActiveConversation().conversationId || null;

export const isConversationOpen = conversationId => {
  const isOpen = evaluateConversationOpen({conversationId}).isOpen;
  logConversationState('is-open-check', {conversationId, isOpen});
  return isOpen;
};

export default {
  setCurrentOpenConversation,
  clearCurrentOpenConversation,
  setConversationScreenFocused,
  getCurrentOpenConversationId,
  isConversationOpen,
};
