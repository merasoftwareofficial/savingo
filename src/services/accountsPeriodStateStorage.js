import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'accountsPeriodState';
const DEFAULT_SCOPE = 'allAccounts';

const normalizeNullableNumber = value => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const DEFAULT_ACCOUNTS_PERIOD_STATE = {
  quickPeriod: null,
  selectedMonth: null,
  selectedYear: null,
  customStartDate: null,
  customEndDate: null,
};

export const buildAccountsPeriodStateKey = ({
  scope = DEFAULT_SCOPE,
  accountId = null,
} = {}) => {
  const normalizedScope = String(scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE;
  const normalizedAccountId =
    accountId === null || accountId === undefined || String(accountId).trim() === ''
      ? ''
      : `:${String(accountId).trim()}`;

  return `${STORAGE_PREFIX}:${normalizedScope}${normalizedAccountId}`;
};

export const normalizeAccountsPeriodState = (state = {}) => {
  const quickPeriod =
    typeof state?.quickPeriod === 'string' && state.quickPeriod.trim()
      ? state.quickPeriod.trim()
      : null;

  return {
    ...DEFAULT_ACCOUNTS_PERIOD_STATE,
    quickPeriod,
    selectedMonth: normalizeNullableNumber(state?.selectedMonth),
    selectedYear: normalizeNullableNumber(state?.selectedYear),
    customStartDate: normalizeNullableNumber(state?.customStartDate),
    customEndDate: normalizeNullableNumber(state?.customEndDate),
  };
};

export const loadAccountsPeriodState = async ({
  scope = DEFAULT_SCOPE,
  accountId = null,
} = {}) => {
  const storageKey = buildAccountsPeriodStateKey({scope, accountId});

  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return normalizeAccountsPeriodState(parsed);
  } catch {
    console.warn('Failed to load accounts period state, clearing invalid cache entry');
    await AsyncStorage.removeItem(storageKey);
    return null;
  }
};

export const saveAccountsPeriodState = async ({
  scope = DEFAULT_SCOPE,
  accountId = null,
  state = DEFAULT_ACCOUNTS_PERIOD_STATE,
} = {}) => {
  const storageKey = buildAccountsPeriodStateKey({scope, accountId});
  const normalizedState = normalizeAccountsPeriodState(state);
  await AsyncStorage.setItem(storageKey, JSON.stringify(normalizedState));
  return normalizedState;
};

export const clearAccountsPeriodState = async ({
  scope = DEFAULT_SCOPE,
  accountId = null,
} = {}) => {
  const storageKey = buildAccountsPeriodStateKey({scope, accountId});
  await AsyncStorage.removeItem(storageKey);
};
