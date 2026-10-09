import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_PHONE_CLAIM_KEY = 'pendingPhoneClaimNavigation';
const PENDING_PHONE_CLAIM_LAST_HANDLED_KEY =
  'pendingPhoneClaimNavigation:lastHandled';
const CLAIM_DEDUPE_WINDOW_MS = 6000;
const pendingPhoneClaimListeners = new Set();

const normalizeText = value => String(value || '').trim();

const normalizePendingPhoneClaimPayload = raw => {
  const claimId = normalizeText(raw?.claimId);
  if (!claimId) {
    return null;
  }

  return {
    type: normalizeText(raw?.type || 'phone_claim_request') || 'phone_claim_request',
    status: normalizeText(raw?.status),
    claimId,
    requesterId: normalizeText(raw?.requesterId),
    requesterName: normalizeText(raw?.requesterName),
    phoneNormalized: normalizeText(raw?.phoneNormalized),
    phoneLastFour: normalizeText(raw?.phoneLastFour),
    notificationId: normalizeText(raw?.notificationId),
    eventId: normalizeText(raw?.eventId),
    notifVersion: normalizeText(raw?.notifVersion || 'v1'),
    pressedAt: Number(raw?.pressedAt || Date.now()) || Date.now(),
  };
};

const buildPendingPhoneClaimSignature = payload => {
  const normalized = normalizePendingPhoneClaimPayload(payload);
  if (!normalized) {
    return '';
  }

  return [
    normalizeText(normalized.type),
    normalizeText(normalized.status),
    normalizeText(normalized.claimId),
    normalizeText(normalized.notificationId),
    normalizeText(normalized.eventId),
  ].join('|');
};

const notifyPendingPhoneClaimListeners = payload => {
  pendingPhoneClaimListeners.forEach(listener => {
    try {
      listener(payload);
    } catch (error) {
      console.error('[PHONE_CLAIM] pending listener failed:', error);
    }
  });
};

export const subscribeToPendingPhoneClaimUpdates = listener => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  pendingPhoneClaimListeners.add(listener);
  return () => {
    pendingPhoneClaimListeners.delete(listener);
  };
};

export const storePendingPhoneClaimNavigation = async rawPayload => {
  const payload = normalizePendingPhoneClaimPayload(rawPayload);
  if (!payload) {
    return null;
  }

  await AsyncStorage.setItem(PENDING_PHONE_CLAIM_KEY, JSON.stringify(payload));
  notifyPendingPhoneClaimListeners(payload);
  return payload;
};

const readPendingPhoneClaimNavigation = async () => {
  const raw = await AsyncStorage.getItem(PENDING_PHONE_CLAIM_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizePendingPhoneClaimPayload(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const clearPendingPhoneClaimNavigation = async () => {
  await AsyncStorage.removeItem(PENDING_PHONE_CLAIM_KEY);
};

const markPendingPhoneClaimHandled = async payload => {
  const signature = buildPendingPhoneClaimSignature(payload);
  if (!signature) {
    return;
  }

  await AsyncStorage.setItem(
    PENDING_PHONE_CLAIM_LAST_HANDLED_KEY,
    JSON.stringify({
      signature,
      handledAt: Date.now(),
    }),
  );
};

const wasPendingPhoneClaimHandledRecently = async (
  payload,
  windowMs = CLAIM_DEDUPE_WINDOW_MS,
) => {
  const signature = buildPendingPhoneClaimSignature(payload);
  if (!signature) {
    return false;
  }

  const raw = await AsyncStorage.getItem(PENDING_PHONE_CLAIM_LAST_HANDLED_KEY);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    const handledAt = Number(parsed?.handledAt || 0);
    return (
      normalizeText(parsed?.signature) === signature &&
      handledAt > 0 &&
      Date.now() - handledAt < windowMs
    );
  } catch {
    return false;
  }
};

export const consumePendingPhoneClaimNavigation = async ({
  launchSource = 'unknown',
  authState = {authenticated: false},
} = {}) => {
  if (!authState?.authenticated) {
    return null;
  }

  const pending = await readPendingPhoneClaimNavigation();
  if (!pending) {
    return null;
  }

  if (await wasPendingPhoneClaimHandledRecently(pending)) {
    await clearPendingPhoneClaimNavigation();
    return null;
  }

  if (__DEV__) {
    console.log('[PHONE_CLAIM] pending event consumed', {
      launchSource,
      type: pending.type,
      status: pending.status || null,
      claimId: pending.claimId,
      eventId: pending.eventId || null,
    });
  }

  await markPendingPhoneClaimHandled(pending);
  await clearPendingPhoneClaimNavigation();
  return pending;
};
