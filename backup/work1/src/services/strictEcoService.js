import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter} from 'react-native';
import {showAppAlert} from '../context/AppAlertBridge';
import {getAllAccounts} from './accountsDatabase';
import {calculateAccountBalance} from './transactionsDatabase';

const STRICT_ECO_ENABLED_KEY = 'app.strictEco.enabled';
const STRICT_ECO_OFF_HAS_TXN_KEY = 'app.strictEco.offHasTxn';
const STRICT_ECO_CURRENT_OFF_SESSION_ID_KEY = 'app.strictEco.currentOffSessionId';

export const STRICT_ECO_CHANGED_EVENT = 'strictEco:changed';

let strictEcoEnabledCache = null;
let strictEcoOffHasTxnCache = null;
let strictEcoCurrentOffSessionIdCache;
let strictEcoLegacyMigrationPromise = null;

const parseStoredBoolean = (value, fallback) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value === 'true';
};

const emitStrictEcoChanged = (enabled, offHasTxn) => {
  if (__DEV__) {
    console.log('[STRICT_ECO][EMIT_CHANGED]', {
      enabled: Boolean(enabled),
      offHasTxn: Boolean(offHasTxn),
      currentOffSessionId: strictEcoCurrentOffSessionIdCache || null,
    });
  }
  DeviceEventEmitter.emit(STRICT_ECO_CHANGED_EVENT, {
    enabled: Boolean(enabled),
    offHasTxn: Boolean(offHasTxn),
    currentOffSessionId: strictEcoCurrentOffSessionIdCache || null,
  });
};

const parseStoredSessionId = value => {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveStrictEcoEnabled = async () => {
  if (typeof strictEcoEnabledCache === 'boolean') {
    return strictEcoEnabledCache;
  }
  const stored = await AsyncStorage.getItem(STRICT_ECO_ENABLED_KEY);
  const value = parseStoredBoolean(stored, true);
  strictEcoEnabledCache = value;
  return value;
};

const resolveStrictEcoOffHasTxn = async () => {
  if (typeof strictEcoOffHasTxnCache === 'boolean') {
    return strictEcoOffHasTxnCache;
  }
  const stored = await AsyncStorage.getItem(STRICT_ECO_OFF_HAS_TXN_KEY);
  const value = parseStoredBoolean(stored, false);
  strictEcoOffHasTxnCache = value;
  return value;
};

const resolveStrictEcoCurrentOffSessionId = async () => {
  if (strictEcoCurrentOffSessionIdCache !== undefined) {
    return strictEcoCurrentOffSessionIdCache;
  }
  const stored = await AsyncStorage.getItem(STRICT_ECO_CURRENT_OFF_SESSION_ID_KEY);
  const value = parseStoredSessionId(stored);
  strictEcoCurrentOffSessionIdCache = value;
  return value;
};

export const getStrictEcoEnabled = async () => {
  try {
    return await resolveStrictEcoEnabled();
  } catch (error) {
    console.error('Failed to read strict eco enabled state:', error);
    return true;
  }
};

export const getStrictEcoOffHasTxn = async () => {
  try {
    return await resolveStrictEcoOffHasTxn();
  } catch (error) {
    console.error('Failed to read strict eco transaction state:', error);
    return false;
  }
};

export const getStrictEcoCurrentOffSessionId = async () => {
  try {
    return await resolveStrictEcoCurrentOffSessionId();
  } catch (error) {
    console.error('Failed to read strict eco session state:', error);
    return null;
  }
};

export const getStrictEcoSnapshot = async () => {
  await ensureLegacyStrictEcoOffSessionMigration();
  const [enabled, offHasTxn, currentOffSessionId] = await Promise.all([
    getStrictEcoEnabled(),
    getStrictEcoOffHasTxn(),
    getStrictEcoCurrentOffSessionId(),
  ]);
  if (__DEV__) {
    console.log('[STRICT_ECO][SNAPSHOT]', {
      enabled,
      offHasTxn,
      currentOffSessionId,
    });
  }
  return {enabled, offHasTxn, currentOffSessionId};
};

export const ensureLegacyStrictEcoOffSessionMigration = async () => {
  if (strictEcoLegacyMigrationPromise) {
    return strictEcoLegacyMigrationPromise;
  }

  strictEcoLegacyMigrationPromise = (async () => {
    const [enabled, offHasTxn, currentOffSessionId] = await Promise.all([
      getStrictEcoEnabled(),
      getStrictEcoOffHasTxn(),
      getStrictEcoCurrentOffSessionId(),
    ]);

    if (enabled || !offHasTxn || currentOffSessionId) {
      if (__DEV__) {
        console.log('[STRICT_ECO][LEGACY_MIGRATION_SKIP]', {
          enabled,
          offHasTxn,
          currentOffSessionId,
        });
      }
      return {
        migrated: false,
        reason: 'not_required',
        currentOffSessionId: currentOffSessionId || null,
      };
    }

    const legacyOffSessionId = `legacy_off_${Date.now()}`;
    try {
      const {
        assignLegacyOffSessionToActiveTransactions,
      } = require('./transactionsDatabase');
      const result =
        typeof assignLegacyOffSessionToActiveTransactions === 'function'
          ? assignLegacyOffSessionToActiveTransactions(legacyOffSessionId)
          : null;

      if (!result?.success || Number(result?.taggedCount) <= 0) {
        if (__DEV__) {
          console.log('[STRICT_ECO][LEGACY_MIGRATION_NO_ROWS]', {
            legacyOffSessionId,
            result,
          });
        }
        return {
          migrated: false,
          reason: 'no_rows',
          currentOffSessionId: null,
        };
      }

      await AsyncStorage.setItem(
        STRICT_ECO_CURRENT_OFF_SESSION_ID_KEY,
        legacyOffSessionId
      );
      strictEcoCurrentOffSessionIdCache = legacyOffSessionId;
      emitStrictEcoChanged(false, true);

      if (__DEV__) {
        console.log('[STRICT_ECO][LEGACY_MIGRATION_DONE]', {
          legacyOffSessionId,
          taggedCount: result.taggedCount,
        });
      }
      return {
        migrated: true,
        reason: 'done',
        currentOffSessionId: legacyOffSessionId,
      };
    } catch (error) {
      console.error('Failed to migrate legacy strict eco OFF session:', error);
      return {
        migrated: false,
        reason: 'error',
        currentOffSessionId: null,
      };
    }
  })();

  try {
    return await strictEcoLegacyMigrationPromise;
  } finally {
    strictEcoLegacyMigrationPromise = null;
  }
};

export const setStrictEcoEnabled = async enabledValue => {
  const enabled = Boolean(enabledValue);
  const nextCurrentOffSessionId = enabled
    ? null
    : await getStrictEcoCurrentOffSessionId();
  const nextOffHasTxn = enabled
    ? false
    : Boolean(nextCurrentOffSessionId) || (await getStrictEcoOffHasTxn());
  try {
    await AsyncStorage.multiSet([
      [STRICT_ECO_ENABLED_KEY, enabled ? 'true' : 'false'],
      [STRICT_ECO_OFF_HAS_TXN_KEY, nextOffHasTxn ? 'true' : 'false'],
      [
        STRICT_ECO_CURRENT_OFF_SESSION_ID_KEY,
        nextCurrentOffSessionId || '',
      ],
    ]);
    strictEcoEnabledCache = enabled;
    strictEcoOffHasTxnCache = nextOffHasTxn;
    strictEcoCurrentOffSessionIdCache = nextCurrentOffSessionId;
    emitStrictEcoChanged(enabled, nextOffHasTxn);
  } catch (error) {
    console.error('Failed to set strict eco enabled state:', error);
    throw error;
  }
  return {
    enabled,
    offHasTxn: nextOffHasTxn,
    currentOffSessionId: nextCurrentOffSessionId,
  };
};

export const markStrictEcoOffTransactionDone = async () => {
  const enabled = await getStrictEcoEnabled();
  if (__DEV__) {
    console.log('[STRICT_ECO][MARK_OFF_TXN_START]', {
      enabled,
    });
  }
  if (enabled) {
    return {enabled: true, offHasTxn: false, currentOffSessionId: null};
  }
  const currentOffSessionId = await getStrictEcoCurrentOffSessionId();
  if (__DEV__) {
    console.log('[STRICT_ECO][MARK_OFF_TXN_CURRENT_SESSION]', {
      currentOffSessionId,
    });
  }
  if (currentOffSessionId) {
    if (!(await getStrictEcoOffHasTxn())) {
      try {
        await AsyncStorage.setItem(STRICT_ECO_OFF_HAS_TXN_KEY, 'true');
        strictEcoOffHasTxnCache = true;
        emitStrictEcoChanged(false, true);
      } catch (error) {
        console.error('Failed to sync strict eco OFF transaction state:', error);
      }
    }
    return {enabled: false, offHasTxn: true, currentOffSessionId};
  }
  const nextCurrentOffSessionId = `off_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  if (__DEV__) {
    console.log('[STRICT_ECO][MARK_OFF_TXN_CREATE_SESSION]', {
      nextCurrentOffSessionId,
    });
  }
  try {
    await AsyncStorage.multiSet([
      [STRICT_ECO_OFF_HAS_TXN_KEY, 'true'],
      [STRICT_ECO_CURRENT_OFF_SESSION_ID_KEY, nextCurrentOffSessionId],
    ]);
    strictEcoOffHasTxnCache = true;
    strictEcoCurrentOffSessionIdCache = nextCurrentOffSessionId;
    emitStrictEcoChanged(false, true);
  } catch (error) {
    console.error('Failed to mark strict eco OFF transaction:', error);
    throw error;
  }
  return {
    enabled: false,
    offHasTxn: true,
    currentOffSessionId: nextCurrentOffSessionId,
  };
};

const confirmOffModeFirstTransaction = (title, message) =>
  new Promise(resolve => {
    let settled = false;
    const settle = value => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    showAppAlert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => settle(false),
        },
        {
          text: 'Proceed',
          onPress: () => settle(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => settle(false),
      }
    );
  });

export const ensureOffModeFirstTransactionConsent = async (
  options = {}
) => {
  await ensureLegacyStrictEcoOffSessionMigration();
  const enabled = await getStrictEcoEnabled();
  if (__DEV__) {
    console.log('[STRICT_ECO][CONSENT_START]', {
      enabled,
    });
  }
  if (enabled) {
    return true;
  }
  const currentOffSessionId = await getStrictEcoCurrentOffSessionId();
  if (__DEV__) {
    console.log('[STRICT_ECO][CONSENT_SESSION_STATE]', {
      currentOffSessionId,
    });
  }
  if (currentOffSessionId) {
    return true;
  }
  const offHasTxn = await getStrictEcoOffHasTxn();
  if (__DEV__ && offHasTxn) {
    console.log('[STRICT_ECO][CONSENT_LEGACY_OFF_HAS_TXN_WITHOUT_SESSION]', {
      offHasTxn,
      currentOffSessionId,
    });
  }
  const proceed = await confirmOffModeFirstTransaction(
    options.title || 'Free Flow Mode',
    options.message ||
      'If you create a transaction while Strict Eco is OFF, you must later settle balances to zero or delete entries from the current Eco OFF session before enabling Strict Eco again.'
  );
  if (!proceed) {
    if (__DEV__) {
      console.log('[STRICT_ECO][CONSENT_CANCELLED]');
    }
    return false;
  }
  if (__DEV__) {
    console.log('[STRICT_ECO][CONSENT_PROCEEDED]');
  }
  return true;
};

export const resolveStrictEcoOffSessionIdForCreate = async () => {
  await ensureLegacyStrictEcoOffSessionMigration();
  const enabled = await getStrictEcoEnabled();
  if (__DEV__) {
    console.log('[STRICT_ECO][RESOLVE_SESSION_FOR_CREATE_START]', {
      enabled,
    });
  }
  if (enabled) {
    return null;
  }
  const sessionState = await markStrictEcoOffTransactionDone();
  if (__DEV__) {
    console.log('[STRICT_ECO][RESOLVE_SESSION_FOR_CREATE_RESULT]', sessionState);
  }
  return sessionState.currentOffSessionId || null;
};

export const getUnsettledStrictEcoAccounts = (epsilon = 0.000001) => {
  const threshold = Math.max(0, Number(epsilon) || 0);
  const eligibleTypes = new Set(['earning', 'expenses']);
  const accounts = getAllAccounts().filter(account =>
    eligibleTypes.has(String(account?.account_type || ''))
  );
  return accounts
    .map(account => {
      const balance = Number(calculateAccountBalance(account.id)) || 0;
      return {
        id: account.id,
        accountName: account.account_name || 'Account',
        accountType: account.account_type || '',
        balance,
      };
    })
    .filter(item => Math.abs(item.balance) > threshold);
};
