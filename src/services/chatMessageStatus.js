export const getChatMessageStatus = value => {
  const status = String(value || 'pending').toLowerCase();
  if (status === 'failed') return {icon: 'alert-circle-outline', label: 'Failed. Tap to retry', failed: true};
  if (status === 'read') return {icon: 'checkmark-done', label: 'Read', read: true};
  if (status === 'delivered') return {icon: 'checkmark-done', label: 'Delivered'};
  if (['sent', 'accepted', 'pushed'].includes(status)) return {icon: 'checkmark', label: 'Sent'};
  return {icon: 'time-outline', label: status === 'queued' ? 'Waiting for connection' : 'Sending'};
};

// Outgoing-message indicator shared by the chat bubble and the contact list:
// sending = clock, sent = empty circle, delivered = dotted circle (blue), read = open eye (green).
export const getChatStatusIndicator = (value, mutedColor) => {
  const status = getChatMessageStatus(value);
  if (status.failed) return {status, tone: 0, icon: status.icon, color: '#EF4444'};
  if (status.read) return {status, tone: 2, icon: 'eye-outline', color: '#16A34A'};
  if (status.icon === 'checkmark-done') return {status, tone: 1, icon: 'radio-button-on', color: '#3B82F6'};
  if (status.icon === 'checkmark') return {status, tone: 0, icon: 'ellipse-outline', color: mutedColor};
  return {status, tone: 0, icon: status.icon, color: mutedColor};
};
