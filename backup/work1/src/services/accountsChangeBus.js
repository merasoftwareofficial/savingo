import {DeviceEventEmitter} from 'react-native';

const ACCOUNTS_CHANGED_EVENT = 'accounts:changed';

const normalizeString = value => String(value || '').trim();

const normalizeAccountIds = accountIds => {
  if (!Array.isArray(accountIds)) {
    return [];
  }
  return accountIds
    .map(id => normalizeString(id))
    .filter(Boolean);
};

const normalizeChangeTypes = changeTypes => {
  if (!Array.isArray(changeTypes)) {
    return [];
  }
  return changeTypes
    .map(type => normalizeString(type))
    .filter(Boolean);
};

export const createAccountsChangePayload = ({
  reason = '',
  accountIds = [],
  changeTypes = [],
  source = '',
  timestamp = Date.now(),
} = {}) => ({
  reason: normalizeString(reason),
  accountIds: normalizeAccountIds(accountIds),
  changeTypes: normalizeChangeTypes(changeTypes),
  source: normalizeString(source),
  timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
});

export const publishAccountsChanged = payload => {
  const normalizedPayload = createAccountsChangePayload(payload);
  DeviceEventEmitter.emit(ACCOUNTS_CHANGED_EVENT, normalizedPayload);
  return normalizedPayload;
};

export const subscribeToAccountsChanged = listener => {
  if (typeof listener !== 'function') {
    throw new TypeError('subscribeToAccountsChanged requires a listener function.');
  }
  return DeviceEventEmitter.addListener(ACCOUNTS_CHANGED_EVENT, payload => {
    listener(createAccountsChangePayload(payload));
  });
};

export const getAccountsChangedEventName = () => ACCOUNTS_CHANGED_EVENT;

export default {
  ACCOUNTS_CHANGED_EVENT,
  createAccountsChangePayload,
  publishAccountsChanged,
  subscribeToAccountsChanged,
  getAccountsChangedEventName,
};
