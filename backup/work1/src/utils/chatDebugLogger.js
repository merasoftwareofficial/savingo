const CHAT_DEBUG_ENABLED = __DEV__;

const sanitizePayload = payload => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  return payload;
};

export const isChatDebugEnabled = () => CHAT_DEBUG_ENABLED;

export const chatDebugLog = (channel, event, payload = undefined) => {
  if (!CHAT_DEBUG_ENABLED) {
    return;
  }

  const normalizedChannel = String(channel || 'general').trim() || 'general';
  const normalizedEvent = String(event || 'event').trim() || 'event';

  if (typeof payload === 'undefined') {
    console.log(`[CHAT_DEBUG][${normalizedChannel}] ${normalizedEvent}`);
    return;
  }

  console.log(
    `[CHAT_DEBUG][${normalizedChannel}] ${normalizedEvent}`,
    sanitizePayload(payload),
  );
};

export const createChatDebugLogger = channel => (event, payload = undefined) =>
  chatDebugLog(channel, event, payload);

