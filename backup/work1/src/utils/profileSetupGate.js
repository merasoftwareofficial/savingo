import {isBackupEligibleUser} from './profileReadiness';
import {readCachedSessionUser} from '../services/sessionService';

const USERNAME_REQUIRED_MESSAGE =
  'Backup & Restore requires a username. Please finish profile setup to continue.';
const COMPLETE_SETUP_MESSAGE = 'Complete profile setup to use backup and restore';

export const normalizeUserForGate = user => {
  if (!user || typeof user !== 'object') {
    return {};
  }
  return user;
};

export const isProfileReadyForBackup = user => {
  const normalized = normalizeUserForGate(user);
  return isBackupEligibleUser(normalized);
};

export const getBackupBlockMessage = user => {
  const normalized = normalizeUserForGate(user);
  const username = String(normalized?.username || '').trim();
  if (!username) {
    return USERNAME_REQUIRED_MESSAGE;
  }
  return COMPLETE_SETUP_MESSAGE;
};

export const getStoredUserForGate = async () => {
  return readCachedSessionUser();
};

export const getBackupProfileGateState = async fallbackUser => {
  const fallback = normalizeUserForGate(fallbackUser);
  const stored = await getStoredUserForGate();
  const user = Object.keys(stored).length > 0 ? stored : fallback;
  const ready = isProfileReadyForBackup(user);
  return {
    ready,
    user,
    message: ready ? '' : getBackupBlockMessage(user),
  };
};

export const BACKUP_GATE_MESSAGES = {
  USERNAME_REQUIRED_MESSAGE,
  COMPLETE_SETUP_MESSAGE,
};
