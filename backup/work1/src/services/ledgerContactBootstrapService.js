import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCachedUser} from './chatDatabase';
import {getContactName} from './ledgerDatabase';
import {ensureLedgerDatabaseReady} from './dbLifecycleManager';
import {
  INSTALL_STATE_INSTALLED,
  INSTALL_STATE_UNINSTALLED,
  normalizeInstallState,
  normalizeLedgerChatContact,
  resolveLedgerChatDisplayName,
  derivePeerUserId,
  mergeInstallState,
} from './ledgerChatIdentityService';

const LEDGER_CONTACTS_KEY = 'ledgerContacts';
const LEDGER_CHAT_CACHE_PREFIX = 'ledgerChatCache:';

const normalizeText = value => String(value || '').trim();

const readLedgerContacts = async () => {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readLedgerSavedName = recordID => {
  const normalizedRecordId = normalizeText(recordID);
  if (!normalizedRecordId) {
    return '';
  }
  try {
    ensureLedgerDatabaseReady();
    return normalizeText(getContactName(normalizedRecordId));
  } catch {
    return '';
  }
};

const readChatIdentityCache = async ({recordID, userId} = {}) => {
  const keys = [
    normalizeText(recordID),
    normalizeText(userId) ? `app_${normalizeText(userId)}` : '',
    normalizeText(userId),
  ]
    .filter(Boolean)
    .map(key => `${LEDGER_CHAT_CACHE_PREFIX}${key}`);

  if (!keys.length) {
    return null;
  }

  try {
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [, raw] of pairs) {
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        // Ignore malformed cache payloads.
      }
    }
  } catch {
    return null;
  }
  return null;
};

const findMatchingLedgerContact = (contacts, {recordID, userId}) => {
  const list = Array.isArray(contacts) ? contacts : [];
  const normalizedRecordId = normalizeText(recordID);
  const normalizedUserId = normalizeText(userId);

  if (normalizedRecordId) {
    const byRecord = list.find(
      item => normalizeText(item?.recordID) === normalizedRecordId,
    );
    if (byRecord) {
      return byRecord;
    }
  }

  if (normalizedUserId) {
    const byUser = list.find(
      item =>
        normalizeText(item?.userId || item?.firebaseUid) === normalizedUserId,
    );
    if (byUser) {
      return byUser;
    }
  }

  return null;
};

const resolveStateFromInstallState = installState => {
  const normalized = normalizeInstallState(installState);
  if (normalized === INSTALL_STATE_INSTALLED) {
    return true;
  }
  if (normalized === INSTALL_STATE_UNINSTALLED) {
    return false;
  }
  return null;
};

const buildCanonicalOutput = ({
  contactHint,
  matchedContact,
  chatCacheIdentity,
  cachedUser,
  dbSavedName,
  senderName,
  resolvedRecordID,
  resolvedUserId,
  resolvedConversationId,
}) => {
  const mergedInstallState = [
    contactHint?.appInstallState,
    matchedContact?.appInstallState,
    chatCacheIdentity?.appInstallState,
  ].reduce(
    (current, next) =>
      mergeInstallState({
        previousState: current,
        nextState: next,
      }),
    'unknown',
  );

  const photoURL = normalizeText(
    contactHint?.photoURL ||
      contactHint?.photo_url ||
      contactHint?.thumbnailPath ||
      contactHint?.appUser?.photoURL ||
      contactHint?.appUser?.photo_url ||
      matchedContact?.photoURL ||
      matchedContact?.photo_url ||
      matchedContact?.thumbnailPath ||
      matchedContact?.appUser?.photoURL ||
      matchedContact?.appUser?.photo_url ||
      cachedUser?.photo_url ||
      '',
  );

  const deviceContactName = resolveLedgerChatDisplayName(
    matchedContact?.savedName,
    [matchedContact?.givenName, matchedContact?.familyName].filter(Boolean).join(' ').trim(),
    contactHint?.savedName,
    [contactHint?.givenName, contactHint?.familyName].filter(Boolean).join(' ').trim(),
  );
  const ledgerContactDisplayName = resolveLedgerChatDisplayName(matchedContact?.displayName);
  const cacheDisplayName = resolveLedgerChatDisplayName(chatCacheIdentity?.displayName);
  const payloadDisplayName = resolveLedgerChatDisplayName(contactHint?.displayName, senderName);
  const displayName = resolveLedgerChatDisplayName(
    dbSavedName,
    deviceContactName,
    ledgerContactDisplayName,
    cacheDisplayName,
    cachedUser?.display_name,
    payloadDisplayName,
  );

  const normalizedContact = normalizeLedgerChatContact({
    ...(matchedContact || {}),
    ...(contactHint || {}),
    recordID: resolvedRecordID,
    userId: resolvedUserId,
    firebaseUid: resolvedUserId,
    displayName,
    appInstallState: mergedInstallState,
    isAppUser: resolveStateFromInstallState(mergedInstallState) === true ? 1 : 0,
    photoURL,
    photo_url: photoURL,
    thumbnailPath: normalizeText(contactHint?.thumbnailPath || matchedContact?.thumbnailPath || ''),
    appUser:
      resolveStateFromInstallState(mergedInstallState) === true && resolvedUserId
        ? {
            userId: resolvedUserId,
            firebaseUid: resolvedUserId,
            displayName,
            photoURL,
            photo_url: photoURL,
            appInstallState: normalizeInstallState(mergedInstallState),
          }
        : null,
  });

  return {
    ...normalizedContact,
    savedName: normalizeText(dbSavedName || deviceContactName) || null,
    conversationId: normalizeText(resolvedConversationId) || null,
    photoURL,
    appInstallState: normalizeInstallState(mergedInstallState),
    isAppUser: resolveStateFromInstallState(mergedInstallState),
    updatedAt: Date.now(),
  };
};

export const resolveInitialContactIdentity = async ({
  contact = null,
  recordID = '',
  userId = '',
  senderName = '',
  conversationId = '',
} = {}) => {
  const contactHint = contact && typeof contact === 'object' ? contact : {};
  const hintedUserId = normalizeText(
    userId ||
      derivePeerUserId(contactHint) ||
      contactHint?.firebaseUid,
  );
  const hintedRecordID = normalizeText(
    recordID ||
      contactHint?.recordID ||
      (hintedUserId ? `app_${hintedUserId}` : ''),
  );

  const contacts = await readLedgerContacts();
  const matchedContact = findMatchingLedgerContact(contacts, {
    recordID: hintedRecordID,
    userId: hintedUserId,
  });

  const resolvedUserId = normalizeText(
    hintedUserId ||
      matchedContact?.userId ||
      matchedContact?.firebaseUid ||
      '',
  );
  const resolvedRecordID = normalizeText(
    hintedRecordID ||
      matchedContact?.recordID ||
      (resolvedUserId ? `app_${resolvedUserId}` : ''),
  );

  const chatCacheIdentity = await readChatIdentityCache({
    recordID: resolvedRecordID,
    userId: resolvedUserId,
  });
  const sqlCachedUser = resolvedUserId ? getCachedUser(resolvedUserId) : null;
  const resolvedConversationId = normalizeText(
    conversationId || chatCacheIdentity?.conversationId || '',
  );
  const dbSavedName = readLedgerSavedName(resolvedRecordID);

  return buildCanonicalOutput({
    contactHint,
    matchedContact,
    chatCacheIdentity,
    cachedUser: sqlCachedUser,
    dbSavedName,
    senderName,
    resolvedRecordID,
    resolvedUserId,
    resolvedConversationId,
  });
};

export const hydrateAndSyncContactIdentity = async params =>
  resolveInitialContactIdentity(params);

export default {
  resolveInitialContactIdentity,
  hydrateAndSyncContactIdentity,
};
