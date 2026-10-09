const GENERIC_CONTACT_NAMES = new Set([
  'contact',
  'app user',
  'user',
  'unknown contact',
  'unnamed contact',
  'universal contact',
]);

export const normalizeText = value => String(value || '').trim();

export const INSTALL_STATE_INSTALLED = 'installed';
export const INSTALL_STATE_UNINSTALLED = 'uninstalled';
export const INSTALL_STATE_UNKNOWN = 'unknown';

const KNOWN_INSTALL_STATES = new Set([
  INSTALL_STATE_INSTALLED,
  INSTALL_STATE_UNINSTALLED,
  INSTALL_STATE_UNKNOWN,
]);

export const normalizeInstallState = (
  value,
  {defaultState = INSTALL_STATE_UNKNOWN} = {},
) => {
  const normalized = normalizeText(value).toLowerCase();
  if (KNOWN_INSTALL_STATES.has(normalized)) {
    return normalized;
  }
  return KNOWN_INSTALL_STATES.has(defaultState)
    ? defaultState
    : INSTALL_STATE_UNKNOWN;
};

export const isInstalledAppUser = value =>
  normalizeInstallState(value?.appInstallState || value) ===
  INSTALL_STATE_INSTALLED;

export const deriveIsAppUser = value => {
  const userId = derivePeerUserId(value);
  const appInstallState = normalizeInstallState(value?.appInstallState || value);
  return userId && appInstallState === INSTALL_STATE_INSTALLED ? 1 : 0;
};

export const mergeInstallState = ({
  previousState,
  nextState,
  allowInstalledRecovery = false,
} = {}) => {
  const prev = normalizeInstallState(previousState);
  const next = normalizeInstallState(nextState);

  if (prev === INSTALL_STATE_UNINSTALLED) {
    if (next === INSTALL_STATE_INSTALLED) {
      return allowInstalledRecovery ? next : prev;
    }
    if (next === INSTALL_STATE_UNKNOWN) {
      return prev;
    }
  }

  if (next !== INSTALL_STATE_UNKNOWN) {
    return next;
  }

  return prev !== INSTALL_STATE_UNKNOWN ? prev : INSTALL_STATE_UNKNOWN;
};

export const normalizeValidDisplayName = value => {
  const name = normalizeText(value);
  if (!name) {
    return '';
  }
  return GENERIC_CONTACT_NAMES.has(name.toLowerCase()) ? '' : name;
};

export const derivePeerUserId = value => {
  const explicit = normalizeText(value?.userId || value?.firebaseUid);
  if (explicit) {
    return explicit;
  }
  const recordId = normalizeText(value?.recordID);
  if (recordId.startsWith('app_')) {
    return normalizeText(recordId.slice(4));
  }
  return '';
};

export const deriveCanonicalRecordId = value => {
  const peerUserId = derivePeerUserId(value);
  if (peerUserId) {
    return `app_${peerUserId}`;
  }
  return normalizeText(value?.recordID);
};

export const normalizeLedgerContactIdentity = (value = {}, options = {}) => {
  const userId = derivePeerUserId(value);
  const recordID = deriveCanonicalRecordId({
    ...value,
    userId,
    firebaseUid: userId || value?.firebaseUid,
  });
  const appInstallState = mergeInstallState({
    previousState: options.previousInstallState,
    nextState: value?.appInstallState,
    allowInstalledRecovery: options.allowInstalledRecovery === true,
  });
  const isAppUser = deriveIsAppUser({
    userId,
    firebaseUid: userId,
    appInstallState,
  });

  return {
    recordID,
    userId,
    firebaseUid: userId || normalizeText(value?.firebaseUid),
    username: normalizeText(value?.username),
    appInstallState,
    isAppUser,
  };
};

export const normalizePhoneNumbers = value => {
  if (Array.isArray(value)) {
    return value
      .map(item => {
        const number = normalizeText(item?.number || item);
        return number ? {number} : null;
      })
      .filter(Boolean);
  }

  const number = normalizeText(value);
  return number ? [{number}] : [];
};

export const resolveLedgerChatDisplayName = (...candidates) => {
  for (const candidate of candidates) {
    const value = normalizeValidDisplayName(candidate);
    if (value) {
      return value;
    }
  }
  return 'Contact';
};

export const normalizeLedgerChatContact = (contact = {}, options = {}) => {
  const canonicalIdentity = normalizeLedgerContactIdentity({
    ...contact,
    userId: normalizeText(options.userIdOverride) || contact?.userId,
    recordID: normalizeText(options.recordIdOverride) || contact?.recordID,
    appInstallState: normalizeText(options.appInstallStateOverride)
      ? options.appInstallStateOverride
      : contact?.appInstallState,
    username: normalizeText(options.usernameOverride) || contact?.username,
  }, {
    previousInstallState: contact?.appInstallState,
    allowInstalledRecovery: options.allowInstalledRecovery === true,
  });
  const peerUserId = canonicalIdentity.userId;
  const recordID = canonicalIdentity.recordID;
  const displayName = normalizeValidDisplayName(
    options.displayNameOverride,
  );
  const username = canonicalIdentity.username;
  const appInstallState = canonicalIdentity.appInstallState;
  const phoneNumbers = normalizePhoneNumbers(
    options.phoneNumbersOverride || contact?.phoneNumbers || contact?.phoneNumber,
  );
  const addedAt = Math.max(0, Number(contact?.addedAt) || 0);
  const lastChatActivityAt = Math.max(
    0,
    Number(contact?.lastChatActivityAt) || 0,
  );
  const appUser =
    contact?.appUser && typeof contact.appUser === 'object'
      ? {
          ...contact.appUser,
          userId: peerUserId || normalizeText(contact.appUser?.userId),
          firebaseUid:
            peerUserId || normalizeText(contact.appUser?.firebaseUid),
          appInstallState: normalizeInstallState(
            contact.appUser?.appInstallState || appInstallState,
          ),
        }
      : null;

  return {
    ...contact,
    ...(displayName ? {displayName} : {}),
    recordID,
    userId: peerUserId,
    firebaseUid: peerUserId || normalizeText(contact?.firebaseUid),
    username,
    phoneNumbers,
    appInstallState,
    isAppUser: canonicalIdentity.isAppUser,
    ...(appUser ? {appUser} : {}),
    addedAt,
    lastChatActivityAt,
  };
};

export const createLedgerChatCachePayload = ({
  contact,
  appUser = null,
  conversationId = null,
} = {}) => {
  const normalizedContact = normalizeLedgerChatContact(contact, {
    appInstallStateOverride:
      appUser?.appInstallState || contact?.appInstallState,
    displayNameOverride: resolveLedgerChatDisplayName(
      appUser?.displayName,
      contact?.displayName,
      contact?.savedName,
    ),
    allowInstalledRecovery: isInstalledAppUser(appUser?.appInstallState),
  });
  const resolvedUserId = derivePeerUserId(appUser || normalizedContact);

  return {
    userId: resolvedUserId,
    firebaseUid: resolvedUserId,
    displayName: resolveLedgerChatDisplayName(
      appUser?.displayName,
      normalizedContact?.displayName,
      normalizedContact?.savedName,
    ),
    username: normalizeText(appUser?.username || normalizedContact?.username),
    appInstallState: normalizeInstallState(
      appUser?.appInstallState || normalizedContact?.appInstallState,
    ),
    conversationId: normalizeText(conversationId) || null,
  };
};

export const buildLedgerChatContactFromUser = user => {
  const normalizedUserId = derivePeerUserId(user);
  return normalizeLedgerChatContact(
    {
      recordID: normalizedUserId ? `app_${normalizedUserId}` : '',
      displayName: resolveLedgerChatDisplayName(
        user?.displayName,
        user?.username,
        'App User',
      ),
      givenName: '',
      familyName: '',
      phoneNumbers: normalizePhoneNumbers(user?.phoneNumber),
      isAppUser: 1,
      userId: normalizedUserId,
      firebaseUid: normalizedUserId,
      username: normalizeText(user?.username),
      photoURL: normalizeText(user?.photoURL),
      appInstallState: normalizeInstallState(user?.appInstallState),
      appUser: normalizedUserId
        ? {
            ...user,
            userId: normalizedUserId,
            firebaseUid: normalizedUserId,
            appInstallState: normalizeInstallState(user?.appInstallState),
          }
        : null,
    },
    {
      displayNameOverride: resolveLedgerChatDisplayName(
        user?.displayName,
        user?.username,
        'App User',
      ),
    },
  );
};
