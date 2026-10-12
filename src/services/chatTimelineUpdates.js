const sameRow = (left, right) => {
  const keys = Object.keys(left || {});
  return keys.length === Object.keys(right || {}).length && keys.every(key => left[key] === right[key]);
};

export const compareChatTimelineItems = (left, right) =>
  Number(right.timestamp || 0) - Number(left.timestamp || 0) ||
  (left.id === right.id ? 0 : left.id < right.id ? 1 : -1);

export const sameChatTimeline = (left, right) => left?.length === right?.length &&
  left.every((item, index) => item.id === right[index].id && item.type === right[index].type &&
    item.timestamp === right[index].timestamp && item.data === right[index].data);

const statusRank = status => ({sent: 1, accepted: 1, pushed: 1, delivered: 2, read: 3}[status] || 0);
export const reconcileChatTimeline = (previous = [], incoming = []) => {
  const byId = new Map(previous.map(item => [item.id, item]));
  const ids = new Set(incoming.map(item => item.id));
  const rows = incoming.map(item => {
    const prior = byId.get(item.id);
    if (item.type === 'message' && prior &&
      statusRank(prior.data?.delivery_status) > statusRank(item.data?.delivery_status)) {
      return {...item, data: {...item.data, delivery_status: prior.data.delivery_status}};
    }
    return prior && sameRow(prior.data, item.data) && prior.timestamp === item.timestamp ? prior : item;
  });
  previous.forEach(item => {
    if (!ids.has(item.id) && item.data?.local_only) rows.push(item);
  });
  rows.sort(compareChatTimelineItems);
  return sameChatTimeline(previous, rows) ? previous : rows;
};

export const upsertChatTimelineMessage = (timeline = [], message, {insertMissing = true} = {}) => {
  if (!message?.message_id) return timeline;
  const id = `msg-${message.message_id}`;
  const index = timeline.findIndex(item => item.id === id);
  if (Number(message.is_deleted) === 1) return index < 0 ? timeline : timeline.filter(item => item.id !== id);
  if (index < 0 && !insertMissing) return timeline;
  const data = {...message, local_only: false};
  if (index >= 0 && sameRow(timeline[index].data, data)) return timeline;
  const item = {id, type: 'message', timestamp: message.timestamp, data};
  const next = [...timeline];
  if (index >= 0) next[index] = item;
  else next.push(item);
  return next.sort(compareChatTimelineItems);
};

export const appendChatHistoryPage = (current = [], older = []) => {
  const ids = new Set(current.map(item => item.id));
  const additions = older.filter(item => !ids.has(item.id));
  return additions.length ? [...current, ...additions].sort(compareChatTimelineItems) : current;
};
