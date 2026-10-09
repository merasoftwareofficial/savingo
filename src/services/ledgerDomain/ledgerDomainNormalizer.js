const normalizeText = value => String(value || '').trim();

export const normalizeInstallState = value => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return 'installed';
  }
  return normalized === 'uninstalled' ? 'uninstalled' : 'installed';
};

export const normalizeBooleanFlag = value =>
  value === true || Number(value) === 1 ? 1 : 0;

export const normalizeRecordId = (input = {}) => {
  const explicitRecordId = normalizeText(input.recordID || input.recordId);
  const explicitUserId = normalizeText(input.userId || input.firebaseUid);

  if (explicitRecordId) {
    if (explicitRecordId.startsWith('app_')) {
      return explicitRecordId;
    }
    if (explicitUserId) {
      return `app_${explicitUserId}`;
    }
    return explicitRecordId;
  }

  if (explicitUserId) {
    return `app_${explicitUserId}`;
  }

  return '';
};

export const normalizeLedgerIdentity = (input = {}) => {
  const recordId = normalizeRecordId(input);
  const userId = normalizeText(input.userId || input.firebaseUid);
  const firebaseUid = normalizeText(input.firebaseUid || input.userId);

  return {
    recordId,
    userId,
    firebaseUid,
    displayName: normalizeText(input.displayName || input.savedName),
    username: normalizeText(input.username),
    appInstallState: normalizeInstallState(input.appInstallState),
    isAppUser: normalizeBooleanFlag(
      input.isAppUser || (recordId.startsWith('app_') && userId ? 1 : 0),
    ),
    photoURL: normalizeText(input.photoURL || input.photo_url),
    updatedAt: Math.max(0, Number(input.updatedAt) || Date.now()),
  };
};

export const normalizeLedgerContact = (input = {}) => {
  const identity = normalizeLedgerIdentity(input);
  const recordId = identity.recordId;

  return {
    recordID: recordId,
    displayName: normalizeText(input.displayName),
    givenName: normalizeText(input.givenName),
    familyName: normalizeText(input.familyName),
    savedName: normalizeText(input.savedName),
    phoneNumbers: Array.isArray(input.phoneNumbers) ? input.phoneNumbers : [],
    userId: identity.userId,
    firebaseUid: identity.firebaseUid,
    username: identity.username,
    appInstallState: identity.appInstallState,
    isAppUser: identity.isAppUser,
    addedAt: Math.max(0, Number(input.addedAt) || 0),
    lastChatActivityAt: Math.max(0, Number(input.lastChatActivityAt) || 0),
  };
};

export const normalizeTimelineItem = (input = {}) => ({
  id: normalizeText(input.id),
  type: normalizeText(input.type),
  timestamp: Math.max(0, Number(input.timestamp) || 0),
  data: input.data && typeof input.data === 'object' ? input.data : {},
});

export const normalizeTimelineState = (input = {}) => ({
  recordId: normalizeText(input.recordId || input.recordID),
  conversationId: normalizeText(input.conversationId) || null,
  hasLoaded: input.hasLoaded === true,
  updatedAt: Math.max(0, Number(input.updatedAt) || Date.now()),
  items: Array.isArray(input.items)
    ? input.items.map(normalizeTimelineItem)
    : [],
});

const normalizeBalance = value => {
  const input = value && typeof value === 'object' ? value : {};
  return {
    netBalance: Number(input.netBalance) || 0,
    totalPaid: Number(input.totalPaid) || 0,
    totalGet: Number(input.totalGet) || 0,
    transactionCount: Number(input.transactionCount) || 0,
  };
};

export const normalizeLedgerBaseState = (input = {}) => ({
  recordId: normalizeText(input.recordId || input.recordID),
  updatedAt: Math.max(0, Number(input.updatedAt) || Date.now()),
  transactions: Array.isArray(input.transactions)
    ? input.transactions.filter(item => item && typeof item === 'object')
    : [],
  balance: normalizeBalance(input.balance),
});

export default {
  normalizeLedgerBaseState,
  normalizeBooleanFlag,
  normalizeInstallState,
  normalizeLedgerContact,
  normalizeLedgerIdentity,
  normalizeRecordId,
  normalizeTimelineItem,
  normalizeTimelineState,
};
