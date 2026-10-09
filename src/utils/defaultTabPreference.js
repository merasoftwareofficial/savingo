import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_TAB_STORAGE_KEY = 'home_default_tab';
export const DEFAULT_TAB_DASHBOARD = 'Dashboard';
export const DEFAULT_TAB_ACCOUNTS = 'Accounts';
export const DEFAULT_TAB_LEDGER = 'Ledger';
export const DEFAULT_TAB_FALLBACK = DEFAULT_TAB_DASHBOARD;

const normalizeRawValue = value => String(value || '').trim().toLowerCase();

export const normalizeDefaultTab = value => {
  const normalized = normalizeRawValue(value);
  if (normalized === 'dashboard') {
    return DEFAULT_TAB_DASHBOARD;
  }
  if (normalized === 'accounts') {
    return DEFAULT_TAB_ACCOUNTS;
  }
  if (normalized === 'ledger') {
    return DEFAULT_TAB_LEDGER;
  }
  return DEFAULT_TAB_FALLBACK;
};

export const readDefaultTabPreference = async () => {
  try {
    const stored = await AsyncStorage.getItem(DEFAULT_TAB_STORAGE_KEY);
    return normalizeDefaultTab(stored);
  } catch (error) {
    console.error('Failed to read default tab preference:', error);
    return DEFAULT_TAB_FALLBACK;
  }
};

export const writeDefaultTabPreference = async value => {
  const normalized = normalizeDefaultTab(value);
  try {
    await AsyncStorage.setItem(DEFAULT_TAB_STORAGE_KEY, normalized);
  } catch (error) {
    console.error('Failed to save default tab preference:', error);
    throw error;
  }
  return normalized;
};
