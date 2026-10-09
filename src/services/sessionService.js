import AsyncStorage from '@react-native-async-storage/async-storage';
import {getBootstrapUser} from './api';

const USER_STORAGE_KEY = 'user';
const FIREBASE_UID_STORAGE_KEY = 'firebaseUid';
const sessionUserListeners = new Set();
const PROFILE_STATES = {
  AUTH_CREATED: 'authCreated',
  PROFILE_PARTIAL: 'profilePartial',
  PROFILE_READY: 'profileReady',
};

const normalizeText = value => {
  const text = String(value ?? '').trim();
  return text || null;
};

const normalizePhoneForLookup = value => {
  if (!value) {
    return null;
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  if (digits.length < 8) {
    return null;
  }
  return digits;
};

const resolveFirebaseUid = rawUser =>
  normalizeText(rawUser?.firebaseUid) ||
  normalizeText(rawUser?.userId) ||
  normalizeText(rawUser?.id);

const resolvePhoneNumber = rawUser =>
  normalizeText(rawUser?.phoneNumber) || normalizeText(rawUser?.mobile);

const resolvePhoneNumberNormalized = (rawUser, phoneNumber) =>
  normalizeText(rawUser?.phoneNumberNormalized) ||
  normalizeText(rawUser?.mobileNormalized) ||
  normalizePhoneForLookup(phoneNumber);

const resolveProfileState = ({
  setupComplete,
  username,
  phoneNumber,
  profileState,
}) => {
  const explicitProfileState = normalizeText(profileState);
  if (
    explicitProfileState === PROFILE_STATES.AUTH_CREATED ||
    explicitProfileState === PROFILE_STATES.PROFILE_PARTIAL ||
    explicitProfileState === PROFILE_STATES.PROFILE_READY
  ) {
    return explicitProfileState;
  }

  if (setupComplete && username && phoneNumber) {
    return PROFILE_STATES.PROFILE_READY;
  }
  if (username || phoneNumber) {
    return PROFILE_STATES.PROFILE_PARTIAL;
  }
  return PROFILE_STATES.AUTH_CREATED;
};

const normalizeSessionUser = rawUser => {
  if (!rawUser || typeof rawUser !== 'object') {
    return {};
  }

  const firebaseUid = resolveFirebaseUid(rawUser);
  const displayName = normalizeText(rawUser?.displayName) || normalizeText(rawUser?.name);
  const username = normalizeText(rawUser?.username);
  const email = normalizeText(rawUser?.email);
  const phoneNumber = resolvePhoneNumber(rawUser);
  const phoneNumberNormalized = resolvePhoneNumberNormalized(rawUser, phoneNumber);
  const country = normalizeText(rawUser?.country);
  const setupComplete = rawUser?.setupComplete === true;
  const photoURL = normalizeText(rawUser?.photoURL || rawUser?.photo_url);
  const appInstallState = normalizeText(rawUser?.appInstallState) || 'installed';
  const phoneOwnershipState =
    normalizeText(rawUser?.phoneOwnershipState) ||
    (phoneNumberNormalized ? 'active' : 'released');
  const updatedAt = normalizeText(rawUser?.updatedAt);
  const profileState = resolveProfileState({
    setupComplete,
    username,
    phoneNumber,
    profileState: rawUser?.profileState,
  });

  // Keep unknown fields for backward compatibility, then override with canonical fields.
  return {
    ...rawUser,
    firebaseUid,
    userId: firebaseUid,
    displayName,
    username,
    email,
    phoneNumber,
    phoneNumberNormalized,
    country,
    setupComplete,
    profileState,
    photoURL,
    appInstallState,
    phoneOwnershipState,
    updatedAt,
    // Compatibility aliases (legacy readers still exist in app)
    mobile: phoneNumber,
    mobileNormalized: phoneNumberNormalized,
    name: displayName,
  };
};

export const isCanonicalSessionUser = user =>
  Boolean(normalizeText(user?.firebaseUid));

const notifySessionUserListeners = normalizedUser => {
  sessionUserListeners.forEach(listener => {
    try {
      listener(normalizedUser);
    } catch (error) {
      console.warn('[SESSION] listener failed:', error);
    }
  });
};

export const subscribeSessionUserUpdates = listener => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  sessionUserListeners.add(listener);
  return () => {
    sessionUserListeners.delete(listener);
  };
};

export const readCachedSessionUser = async () => {
  try {
    const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
    return raw ? normalizeSessionUser(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

export const writeCachedSessionUser = async user => {
  const normalized = normalizeSessionUser(user);
  await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
  const firebaseUid = String(normalized?.firebaseUid || '').trim();
  if (firebaseUid) {
    await AsyncStorage.setItem(FIREBASE_UID_STORAGE_KEY, firebaseUid);
  } else {
    await AsyncStorage.removeItem(FIREBASE_UID_STORAGE_KEY);
  }
  notifySessionUserListeners(normalized);
  return normalized;
};

export const refreshCanonicalSessionUser = async fallbackUser => {
  const normalizedFallback = normalizeSessionUser(fallbackUser);
  try {
    const response = await getBootstrapUser();
    if (response?.success && response?.user) {
      return await writeCachedSessionUser(response.user);
    }
  } catch (error) {
    console.warn('[SESSION] bootstrap refresh failed:', error);
  }

  // Prefer freshly resolved fallback user (e.g. successful login payload)
  // over stale cached state when bootstrap endpoint is unavailable.
  if (isCanonicalSessionUser(normalizedFallback)) {
    return normalizedFallback;
  }

  const cachedUser = await readCachedSessionUser();
  if (isCanonicalSessionUser(cachedUser)) {
    return cachedUser;
  }

  return normalizedFallback;
};

export const resolveCanonicalSessionUser = async fallbackUser =>
  writeCachedSessionUser(await refreshCanonicalSessionUser(fallbackUser));

export default {
  readCachedSessionUser,
  writeCachedSessionUser,
  subscribeSessionUserUpdates,
  refreshCanonicalSessionUser,
  resolveCanonicalSessionUser,
};
