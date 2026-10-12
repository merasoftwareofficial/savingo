import {getMessagesPage} from './chatDatabase';
import {getLedgerTransactionsPage} from './ledgerDatabase';
import {compareChatTimelineItems} from './chatTimelineUpdates';

// Both stores use the same cursor and tie-breaker; an offset cannot skip rows
// when a newer message arrives while the user scrolls older history.
export const loadChatHistoryPage = ({contactRecordId, conversationId, limit = 50, before = null}) => {
  const size = Math.max(1, Math.floor(Number(limit) || 50));
  const messages = conversationId ? getMessagesPage(conversationId, size + 1, before) : [];
  const transactions = getLedgerTransactionsPage(contactRecordId, size + 1, before);
  const merged = [
    ...messages.map(data => ({id: `msg-${data.message_id}`, type: 'message', timestamp: Number(data.timestamp) || 0, data})),
    ...transactions.map(data => ({id: `txn-${data.id}`, type: 'transaction', timestamp: Number(data.transaction_date) || 0, data})),
  ].sort(compareChatTimelineItems);
  const items = merged.slice(0, size);
  const last = items[items.length - 1];
  return {items, hasMore: merged.length > size, cursor: last ? {timestamp: last.timestamp, id: last.id} : before};
};
