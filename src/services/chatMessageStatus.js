export const getChatMessageStatus = value => {
  const status = String(value || 'pending').toLowerCase();
  if (status === 'failed') return {icon: 'alert-circle-outline', label: 'Failed. Tap to retry', failed: true};
  if (status === 'read') return {icon: 'checkmark-done', label: 'Read', read: true};
  if (status === 'delivered') return {icon: 'checkmark-done', label: 'Delivered'};
  if (['sent', 'accepted', 'pushed'].includes(status)) return {icon: 'checkmark', label: 'Sent'};
  return {icon: 'time-outline', label: status === 'queued' ? 'Waiting for connection' : 'Sending'};
};
