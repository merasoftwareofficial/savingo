import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter} from 'react-native';
import {performBackup} from '../services/backupService';
import {ensureDriveScopesSilent} from '../services/driveService';
import {BACKUP_RESTORE_PENDING_KEY} from '../services/startupCoordinator';
import {getBackupProfileGateState} from './profileSetupGate';

const BACKUP_ENABLED_KEY = 'backup.enabled';
const DEFAULT_DEBOUNCE_MS = 30 * 1000;
export const AUTO_BACKUP_STATUS_EVENT = 'backup:autoStatus';

let queuedPayload = null;
let timer = null;
let running = false;
let suspended = false;

const emitAutoStatus = active => {
  DeviceEventEmitter.emit(AUTO_BACKUP_STATUS_EVENT, Boolean(active));
};

export const isAutoBackupEnabled = async () => {
  const value = await AsyncStorage.getItem(BACKUP_ENABLED_KEY);
  if (value === null) {
    return true;
  }
  return value === 'true';
};

export const setAutoBackupEnabled = async enabled => {
  await AsyncStorage.setItem(BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
};

const runBackup = async () => {
  if (running || !queuedPayload || suspended) {
    return;
  }
  running = true;
  const payload = queuedPayload;
  queuedPayload = null;
  emitAutoStatus(true);
  try {
    const gate = await getBackupProfileGateState();
    if (!gate.ready) {
      return;
    }
    await ensureDriveScopesSilent();
    await performBackup({...payload, source: 'auto'});
  } catch (error) {
    console.error('Auto-backup failed:', error);
  } finally {
    running = false;
    emitAutoStatus(false);
  }
};

export const queueBackup = async (payload, debounceMs = DEFAULT_DEBOUNCE_MS) => {
  if (suspended) {
    return;
  }
  const enabled = await isAutoBackupEnabled();
  if (!enabled) {
    return;
  }
  queuedPayload = payload;
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    runBackup();
  }, debounceMs);
};

export const flushBackupQueue = async () => {
  if (suspended) {
    return;
  }
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await runBackup();
};

export const queueBackupFromStorage = async (
  debounceMs = DEFAULT_DEBOUNCE_MS,
) => {
  const gate = await getBackupProfileGateState();
  if (!gate.ready) {
    return;
  }
  const restorePending = await AsyncStorage.getItem(BACKUP_RESTORE_PENDING_KEY);
  if (restorePending === 'true') {
    return;
  }
  const firebaseUid = await AsyncStorage.getItem('firebaseUid');
  const accountEmail = await AsyncStorage.getItem('backup.accountEmail');
  const includeReceipts = await AsyncStorage.getItem('backup.includeReceipts');
  if (!accountEmail) {
    return;
  }
  return queueBackup(
    {
      firebaseUid,
      accountEmail,
      includeReceipts: includeReceipts !== 'false',
    },
    debounceMs
  );
};

export const suspendBackupQueue = ({cancelQueued = true} = {}) => {
  suspended = true;
  if (cancelQueued) {
    queuedPayload = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
};

export const resumeBackupQueue = () => {
  suspended = false;
};

export const isBackupQueueRunning = () => running;

export const waitForBackupQueueIdle = async (timeoutMs = 30000) => {
  const startedAt = Date.now();
  while (running) {
    if (Date.now() - startedAt >= timeoutMs) {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return true;
};
