import {DeviceEventEmitter} from 'react-native';

export const BACKUP_RESTORED_EVENT = 'backup:restored';

export const publishBackupRestored = (payload = {}) => {
  const normalizedPayload = {
    source: String(payload?.source || 'backup-restore'),
    timestamp: Number.isFinite(payload?.timestamp) ? payload.timestamp : Date.now(),
  };
  DeviceEventEmitter.emit(BACKUP_RESTORED_EVENT, normalizedPayload);
  return normalizedPayload;
};

export const subscribeToBackupRestored = listener => {
  if (typeof listener !== 'function') {
    throw new TypeError('subscribeToBackupRestored requires a listener function.');
  }
  return DeviceEventEmitter.addListener(BACKUP_RESTORED_EVENT, listener);
};
