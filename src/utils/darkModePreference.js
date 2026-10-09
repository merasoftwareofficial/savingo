import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'app.colorScheme.v1';
const VALID = ['light', 'dark', 'system'];
const DEFAULT = 'system';

const normalize = value => (VALID.includes(value) ? value : DEFAULT);

export async function readColorSchemePreference() {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return normalize(stored);
  } catch {
    return DEFAULT;
  }
}

export async function writeColorSchemePreference(value) {
  const normalized = normalize(value);
  try {
    await AsyncStorage.setItem(KEY, normalized);
  } catch {}
  return normalized;
}
