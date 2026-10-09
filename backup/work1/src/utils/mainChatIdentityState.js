const normalizeText = value => String(value || '').trim();

export const normalizeChatInstallState = value =>
  normalizeText(value).toLowerCase() || 'installed';

export const isChatInstallAvailable = value =>
  normalizeChatInstallState(value) !== 'uninstalled';

export const normalizeChatAppUserState = value => {
  if (value === true || Number(value) === 1) {
    return true;
  }
  if (value === false || Number(value) === 0) {
    return false;
  }
  return null;
};

const getContactDisplayName = (contact, appUser) => {
  if (contact?.savedName) {
    return String(contact.savedName).trim();
  }
  const fullName = [contact?.givenName, contact?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return fullName || contact?.displayName || appUser?.displayName || 'Unknown Contact';
};

export const getChatContactUserId = contact =>
  normalizeText(
    contact?.userId ||
      contact?.firebaseUid ||
      contact?.appUser?.firebaseUid ||
      contact?.appUser?.userId,
  );

export const getChatContactInstallState = contact =>
  normalizeChatInstallState(
    contact?.appInstallState || contact?.appUser?.appInstallState || 'installed',
  );

export const getChatContactAppUserState = contact => {
  const explicit = normalizeChatAppUserState(contact?.isAppUser);
  const installState = getChatContactInstallState(contact);
  if (installState === 'uninstalled') {
    return false;
  }
  if (explicit !== null) {
    return explicit;
  }
  return Boolean(
    normalizeText(contact?.appUser?.firebaseUid || contact?.appUser?.userId),
  );
};

export const normalizeChatContactIdentity = contact => {
  const userId = getChatContactUserId(contact);
  const appInstallState = getChatContactInstallState(contact);
  const isAppUser = getChatContactAppUserState(contact) ? 1 : 0;
  return {
    ...contact,
    userId,
    appInstallState,
    isAppUser,
  };
};

export const canChatWithContactIdentity = contact =>
  getChatContactAppUserState(contact) === true &&
  isChatInstallAvailable(getChatContactInstallState(contact));

export const buildMainChatIdentityState = ({
  contact,
  appUser,
  isAppUser,
  headerPhone,
} = {}) => {
  const resolvedInstallState = normalizeChatInstallState(
    appUser?.appInstallState || contact?.appInstallState,
  );
  const normalizedIsAppUser = normalizeChatAppUserState(isAppUser);
  const canChat =
    normalizedIsAppUser === true && isChatInstallAvailable(resolvedInstallState);
  const canInvite =
    normalizedIsAppUser === false || resolvedInstallState === 'uninstalled';
  const resolvedDisplayName = getContactDisplayName(contact, appUser);

  return {
    contactIdentity: {
      recordId: normalizeText(contact?.recordID),
      userId: normalizeText(appUser?.userId || contact?.userId),
      firebaseUid: normalizeText(
        appUser?.firebaseUid || contact?.firebaseUid || contact?.userId,
      ),
      displayName: resolvedDisplayName,
      username: normalizeText(appUser?.username || contact?.username),
      phone: normalizeText(headerPhone),
      identityResolved: Boolean(
        normalizeText(contact?.recordID) ||
          normalizeText(appUser?.userId || contact?.userId),
      ),
    },
    installState: {
      isAppUser: normalizedIsAppUser,
      appInstallState: resolvedInstallState,
      canChat,
      canInvite,
    },
  };
};
