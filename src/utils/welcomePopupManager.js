import AsyncStorage from '@react-native-async-storage/async-storage';

// Decides which first-run popup the home tabs show:
// - 'intro'   : 3-slide app intro, once, on a new install's first start.
// - 'devNote' : "A note from the developer" (review request), once, 7+ days
//               after the first start.
// Users who saw the old welcome popup get neither again.

const LEGACY_SESSION_COUNT_KEY = 'welcome.sessionCount.v1';
const LEGACY_DISMISSED_KEY = 'welcome.permanentlyDismissed.v1';
const INTRO_SEEN_KEY = 'welcome.introSeen.v1';
const DEV_NOTE_SHOWN_KEY = 'welcome.devNoteShown.v1';
const FIRST_OPEN_AT_KEY = 'welcome.firstOpenAt.v1';

export const WELCOME_KIND_INTRO = 'intro';
export const WELCOME_KIND_DEV_NOTE = 'devNote';
export const DEV_NOTE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Call once when the home tabs mount.
 * Returns {kind: 'intro' | 'devNote' | null}.
 */
export async function initWelcomePopup(now = Date.now()) {
  try {
    const pairs = await AsyncStorage.multiGet([
      LEGACY_SESSION_COUNT_KEY,
      LEGACY_DISMISSED_KEY,
      INTRO_SEEN_KEY,
      DEV_NOTE_SHOWN_KEY,
      FIRST_OPEN_AT_KEY,
    ]);
    const values = Object.fromEntries(pairs);
    const legacyCount = parseInt(values[LEGACY_SESSION_COUNT_KEY] || '0', 10) || 0;
    const isLegacyUser = legacyCount >= 1 || values[LEGACY_DISMISSED_KEY] === 'true';
    const introSeen = values[INTRO_SEEN_KEY] === 'true';
    const devNoteShown = values[DEV_NOTE_SHOWN_KEY] === 'true';

    if (isLegacyUser && (!introSeen || !devNoteShown)) {
      await AsyncStorage.multiSet([
        [INTRO_SEEN_KEY, 'true'],
        [DEV_NOTE_SHOWN_KEY, 'true'],
      ]);
      return {kind: null};
    }

    let firstOpenAt = Number(values[FIRST_OPEN_AT_KEY]) || 0;
    if (!firstOpenAt) {
      firstOpenAt = now;
      await AsyncStorage.setItem(FIRST_OPEN_AT_KEY, String(firstOpenAt));
    }

    if (!introSeen) {
      return {kind: WELCOME_KIND_INTRO};
    }
    if (!devNoteShown && now - firstOpenAt >= DEV_NOTE_DELAY_MS) {
      return {kind: WELCOME_KIND_DEV_NOTE};
    }
    return {kind: null};
  } catch {
    return {kind: null};
  }
}

/** Call when the intro is closed (Start or Skip). */
export async function markIntroSeen() {
  try {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, 'true');
  } catch {}
}

/** Call when the developer note is shown, so it appears only once. */
export async function markDevNoteShown() {
  try {
    await AsyncStorage.setItem(DEV_NOTE_SHOWN_KEY, 'true');
  } catch {}
}
