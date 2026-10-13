import AsyncStorage from '@react-native-async-storage/async-storage';

// SSOT for "which tab opens when the app starts": preference, last-used tab,
// one-time migration to Automatic, tab-bar badge rule and the shortcut hint.

export const DEFAULT_TAB_STORAGE_KEY = 'home_default_tab';
export const LAST_USED_TAB_STORAGE_KEY = 'home_last_tab';
const AUTO_MIGRATED_KEY = 'home_default_tab.autoMigrated.v1';
const HINT_SEEN_KEY = 'home_default_tab.hintShown.v1';
const OPEN_DAYS_KEY = 'home_default_tab.openDays.v1';
const HINT_AFTER_OPEN_DAYS = 3;

export const DEFAULT_TAB_DASHBOARD = 'Dashboard';
export const DEFAULT_TAB_ACCOUNTS = 'Accounts';
export const DEFAULT_TAB_LEDGER = 'Ledger';
// Automatic = open the tab that was used last.
export const DEFAULT_TAB_AUTO = 'Auto';
// Preference used when nothing (or something invalid) is stored.
export const DEFAULT_TAB_FALLBACK = DEFAULT_TAB_AUTO;
// Tab opened in Automatic mode before any tab has been used (new user).
export const NEW_USER_TAB = DEFAULT_TAB_LEDGER;

export const DEFAULT_TAB_BADGE_AUTO = 'A';
export const DEFAULT_TAB_BADGE_FIXED = '✓';

export const DEFAULT_TAB_OPTIONS = [
  {label: 'Automatic', hint: 'Opens the tab you used last', value: DEFAULT_TAB_AUTO, icon: 'sparkles-outline'},
  {label: 'Dashboard', value: DEFAULT_TAB_DASHBOARD, icon: 'bar-chart-outline'},
  {label: 'Accounts', value: DEFAULT_TAB_ACCOUNTS, icon: 'wallet-outline'},
  {label: 'Ledger Talk', value: DEFAULT_TAB_LEDGER, icon: 'chatbox-ellipses-outline'},
];

const normalizeRawValue = value => String(value || '').trim().toLowerCase();

// Real tab route name, or '' when the value is not one of the startup tabs.
export const normalizeStartupTabName = value => {
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
  return '';
};

export const normalizeDefaultTab = value => {
  if (normalizeRawValue(value) === 'auto') {
    return DEFAULT_TAB_AUTO;
  }
  return normalizeStartupTabName(value) || DEFAULT_TAB_FALLBACK;
};

export const getDefaultTabLabel = value => {
  const normalized = normalizeDefaultTab(value);
  const option = DEFAULT_TAB_OPTIONS.find(item => item.value === normalized);
  return option ? option.label : normalized;
};

// One time per install: every existing user moves to Automatic. Their old tab is
// kept as the last-used tab, so the first start after the update looks the same.
const ensureAutoMigration = async () => {
  const migrated = await AsyncStorage.getItem(AUTO_MIGRATED_KEY);
  if (migrated === 'true') {
    return;
  }
  const pairs = await AsyncStorage.multiGet([
    DEFAULT_TAB_STORAGE_KEY,
    LAST_USED_TAB_STORAGE_KEY,
  ]);
  const previousTab = normalizeStartupTabName(pairs[0]?.[1]);
  const lastUsedTab = normalizeStartupTabName(pairs[1]?.[1]);
  const updates = [
    [DEFAULT_TAB_STORAGE_KEY, DEFAULT_TAB_AUTO],
    [AUTO_MIGRATED_KEY, 'true'],
  ];
  if (previousTab && !lastUsedTab) {
    updates.push([LAST_USED_TAB_STORAGE_KEY, previousTab]);
  }
  await AsyncStorage.multiSet(updates);
};

export const readDefaultTabPreference = async () => {
  try {
    await ensureAutoMigration();
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

export const readLastUsedTab = async () => {
  try {
    return normalizeStartupTabName(await AsyncStorage.getItem(LAST_USED_TAB_STORAGE_KEY));
  } catch (error) {
    console.error('Failed to read last used tab:', error);
    return '';
  }
};

export const recordLastUsedTab = async tabName => {
  const normalized = normalizeStartupTabName(tabName);
  if (!normalized) {
    return;
  }
  try {
    await AsyncStorage.setItem(LAST_USED_TAB_STORAGE_KEY, normalized);
  } catch (error) {
    console.error('Failed to save last used tab:', error);
  }
};

// Tab for a given preference: the fixed tab, or (Automatic) the last used tab.
export const resolveTabForPreference = (preference, lastUsedTab) => {
  const normalized = normalizeDefaultTab(preference);
  if (normalized !== DEFAULT_TAB_AUTO) {
    return normalized;
  }
  return normalizeStartupTabName(lastUsedTab) || NEW_USER_TAB;
};

// The tab route the app opens on start. Always a real tab route name.
export const resolveStartupTab = async () => {
  const preference = await readDefaultTabPreference();
  const lastUsedTab = await readLastUsedTab();
  return resolveTabForPreference(preference, lastUsedTab);
};

// Badge text for a tab: 'A' on the open tab in Automatic, '✓' on the fixed tab.
export const getDefaultTabBadge = (tabName, preference, activeTab) => {
  const tab = normalizeStartupTabName(tabName);
  if (!tab) {
    return undefined;
  }
  const normalized = normalizeDefaultTab(preference);
  if (normalized === DEFAULT_TAB_AUTO) {
    return tab === normalizeStartupTabName(activeTab) ? DEFAULT_TAB_BADGE_AUTO : undefined;
  }
  return tab === normalized ? DEFAULT_TAB_BADGE_FIXED : undefined;
};

const toLocalDayKey = date =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

// Counts distinct days the app was opened; true once the hint is due and unseen.
export const registerOpenDayAndCheckHint = async (now = new Date()) => {
  try {
    const pairs = await AsyncStorage.multiGet([HINT_SEEN_KEY, OPEN_DAYS_KEY]);
    if (pairs[0]?.[1] === 'true') {
      return false;
    }
    let state = {count: 0, lastDay: ''};
    try {
      const parsed = JSON.parse(pairs[1]?.[1] || 'null');
      if (parsed && typeof parsed === 'object') {
        state = {count: Number(parsed.count) || 0, lastDay: String(parsed.lastDay || '')};
      }
    } catch {
      // Corrupt counter: start again.
    }
    const today = toLocalDayKey(now);
    if (state.lastDay !== today) {
      state = {count: state.count + 1, lastDay: today};
      await AsyncStorage.setItem(OPEN_DAYS_KEY, JSON.stringify(state));
    }
    return state.count >= HINT_AFTER_OPEN_DAYS;
  } catch (error) {
    console.error('Failed to check default tab hint:', error);
    return false;
  }
};

export const markDefaultTabHintSeen = async () => {
  try {
    await AsyncStorage.setItem(HINT_SEEN_KEY, 'true');
  } catch (error) {
    console.error('Failed to save default tab hint state:', error);
  }
};
