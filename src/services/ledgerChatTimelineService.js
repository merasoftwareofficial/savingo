import {getMessages} from './chatDatabase';
import {getUnifiedTimeline} from './ledgerDatabase';

const CONTACT_CACHE_TTL_MS = 20000;
const CONTACT_TIMELINE_CACHE_MAX_ENTRIES = 8;
const CONTACT_TIMELINE_CACHE_MAX_ITEMS = 80;
const CONTACT_TIMELINE_CACHE = new Map();

const normalizeText = value => String(value || '').trim();

const getTimelineCacheKey = (contactRecordId, conversationId = null) =>
  `${normalizeText(contactRecordId)}::${normalizeText(conversationId) || 'none'}`;

const pruneTimelineCache = () => {
  while (CONTACT_TIMELINE_CACHE.size > CONTACT_TIMELINE_CACHE_MAX_ENTRIES) {
    const oldestKey = CONTACT_TIMELINE_CACHE.keys().next().value;
    if (!oldestKey) {
      break;
    }
    CONTACT_TIMELINE_CACHE.delete(oldestKey);
  }
};

const isMessageTimelineItem = item => item?.type === 'message';

export const readLedgerChatTimelineCache = (contactRecordId, conversationId = null) => {
  const cacheKey = getTimelineCacheKey(contactRecordId, conversationId);
  if (!cacheKey.trim()) {
    return null;
  }
  const cached = CONTACT_TIMELINE_CACHE.get(cacheKey) || null;
  if (!cached) {
    return null;
  }
  const updatedAt = Number(cached?.updatedAt || 0);
  if (!updatedAt || Date.now() - updatedAt >= CONTACT_CACHE_TTL_MS) {
    CONTACT_TIMELINE_CACHE.delete(cacheKey);
    return null;
  }
  CONTACT_TIMELINE_CACHE.delete(cacheKey);
  CONTACT_TIMELINE_CACHE.set(cacheKey, cached);
  return cached;
};

export const writeLedgerChatTimelineCache = (
  contactRecordId,
  conversationId = null,
  timeline = [],
) => {
  const cacheKey = getTimelineCacheKey(contactRecordId, conversationId);
  if (!cacheKey.trim()) {
    return;
  }
  if (CONTACT_TIMELINE_CACHE.has(cacheKey)) {
    CONTACT_TIMELINE_CACHE.delete(cacheKey);
  }
  CONTACT_TIMELINE_CACHE.set(cacheKey, {
    contactRecordId: normalizeText(contactRecordId),
    conversationId: normalizeText(conversationId) || null,
    timeline: Array.isArray(timeline)
      ? timeline.slice(0, CONTACT_TIMELINE_CACHE_MAX_ITEMS)
      : [],
    updatedAt: Date.now(),
  });
  pruneTimelineCache();
};

export const clearLedgerChatTimelineCache = contactRecordId => {
  const normalizedContactRecordId = normalizeText(contactRecordId);
  if (!normalizedContactRecordId) {
    return;
  }
  Array.from(CONTACT_TIMELINE_CACHE.keys()).forEach(key => {
    if (key.startsWith(`${normalizedContactRecordId}::`)) {
      CONTACT_TIMELINE_CACHE.delete(key);
    }
  });
};

export const prependOptimisticLedgerChatMessage = (timeline = [], optimisticMessage) => {
  const optimisticId = normalizeText(
    optimisticMessage?.data?.message_id || optimisticMessage?.id,
  );
  const nextTimeline = Array.isArray(timeline) ? timeline : [];
  const withoutDuplicate = optimisticId
    ? nextTimeline.filter(item => {
        const itemId = normalizeText(item?.data?.message_id || item?.id);
        return itemId !== optimisticId;
      })
    : nextTimeline;
  return [optimisticMessage, ...withoutDuplicate];
};

export const loadLedgerChatTimeline = async ({
  contactRecordId,
  conversationId = null,
  limit = null,
  offset = 0,
} = {}) => {
  const normalizedContactRecordId = normalizeText(contactRecordId);
  const normalizedConversationId = normalizeText(conversationId) || null;
  if (!normalizedContactRecordId) {
    return {
      timeline: [],
      messages: [],
      conversationId: normalizedConversationId,
    };
  }

  const messages = normalizedConversationId
    ? await getMessages(normalizedConversationId)
    : [];
  const timeline = getUnifiedTimeline(
    normalizedContactRecordId,
    messages,
    limit,
    offset,
  );
  const nextTimeline = Array.isArray(timeline) ? timeline : [];

  writeLedgerChatTimelineCache(
    normalizedContactRecordId,
    normalizedConversationId,
    nextTimeline,
  );

  return {
    timeline: nextTimeline,
    messages: nextTimeline.filter(isMessageTimelineItem).map(item => item.data),
    conversationId: normalizedConversationId,
  };
};

export default {
  clearLedgerChatTimelineCache,
  loadLedgerChatTimeline,
  prependOptimisticLedgerChatMessage,
  readLedgerChatTimelineCache,
  writeLedgerChatTimelineCache,
};
