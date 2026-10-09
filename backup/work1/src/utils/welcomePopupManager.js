import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_COUNT_KEY = 'welcome.sessionCount.v1';
const PERMANENTLY_DISMISSED_KEY = 'welcome.permanentlyDismissed.v1';
const MAX_SESSIONS = 2;

// Which tab screen to show popup on, per session number
const SESSION_TARGET = {
  1: 'Dashboard',
  2: 'Ledger',
};

// In-memory flag — reset on each JS bundle load (i.e. each app session)
let _shownThisSession = false;

/**
 * Call once at app start (e.g. in MainTabNavigator mount).
 * Increments session counter and returns whether/where to show the popup.
 *
 * Returns:
 *   { shouldShow: false }                        — never show
 *   { shouldShow: true, targetTab: 'Dashboard' } — show on this tab
 */
export async function initWelcomePopup() {
  try {
    const dismissed = await AsyncStorage.getItem(PERMANENTLY_DISMISSED_KEY);
    if (dismissed === 'true') {
      return {shouldShow: false};
    }

    const countStr = await AsyncStorage.getItem(SESSION_COUNT_KEY);
    const prevCount = parseInt(countStr || '0', 10);

    if (prevCount >= MAX_SESSIONS) {
      return {shouldShow: false};
    }

    const newCount = prevCount + 1;
    await AsyncStorage.setItem(SESSION_COUNT_KEY, String(newCount));

    return {
      shouldShow: true,
      targetTab: SESSION_TARGET[newCount] || 'Dashboard',
    };
  } catch {
    return {shouldShow: false};
  }
}

/** Call when user taps the Play Store button — popup never shows again. */
export async function markPermanentlyDismissed() {
  try {
    await AsyncStorage.setItem(PERMANENTLY_DISMISSED_KEY, 'true');
  } catch {}
}

/** Call right before showing popup so it doesn't show twice in same session. */
export function markShownThisSession() {
  _shownThisSession = true;
}

/** Returns true if popup was already shown this session. */
export function hasShownThisSession() {
  return _shownThisSession;
}
