import {getCachedUser, getLatestMessagePerUser, getUnreadCountForOtherUserId} from './chatDatabase';
import {getLatestTransactionByContact} from './ledgerDatabase';
import {derivePeerUserId, isInstalledAppUser, normalizeText} from './ledgerChatIdentityService';

const buildLastActivityForContact = (contact, chatMap, ledgerMap) => {
  const peerUserId = derivePeerUserId(contact);
  const recordId = normalizeText(contact?.recordID);
  const chatEntry = peerUserId ? chatMap[peerUserId] : null;
  const ledgerEntry = recordId ? ledgerMap[recordId] : null;
  const chatTs = Number(chatEntry?.timestamp || 0);
  const ledgerTs = Number(ledgerEntry?.timestamp || 0);

  if (!chatEntry && !ledgerEntry) {
    return null;
  }
  if (chatEntry && (!ledgerEntry || chatTs >= ledgerTs)) {
    return {
      kind: 'chat',
      text: normalizeText(chatEntry?.text),
      timestamp: chatTs,
    };
  }
  return {
    kind: 'ledger',
    amount: Number(ledgerEntry?.amount || 0),
    type: normalizeText(ledgerEntry?.type),
    note: normalizeText(ledgerEntry?.note),
    timestamp: ledgerTs,
  };
};

export const buildLedgerListState = (contacts = []) => {
  const list = Array.isArray(contacts) ? contacts : [];
  const chatMap = getLatestMessagePerUser();
  const ledgerMap = getLatestTransactionByContact();
  const photoMap = {};
  const nameMap = {};
  const unreadMap = {};
  const activityMap = {};

  list.forEach(contact => {
    const recordId = normalizeText(contact?.recordID);
    const peerUserId = derivePeerUserId(contact);
    const isInstalledAppContact =
      (contact?.isAppUser === true || Number(contact?.isAppUser) === 1) &&
      isInstalledAppUser(contact?.appInstallState);

    if (recordId) {
      activityMap[recordId] = buildLastActivityForContact(contact, chatMap, ledgerMap);
    }

    if (isInstalledAppContact && peerUserId) {
      const cached = getCachedUser(peerUserId);
      if (recordId && cached?.photo_url) {
        photoMap[recordId] = cached.photo_url;
      }
      if (recordId && cached?.display_name) {
        nameMap[recordId] = cached.display_name;
      }
      unreadMap[recordId] = Number(getUnreadCountForOtherUserId(peerUserId) || 0);
      return;
    }

    if (recordId) {
      unreadMap[recordId] = 0;
    }
  });

  return {
    photoMap,
    cachedNameMap: nameMap,
    unreadMap,
    activityMap,
  };
};

export default {
  buildLedgerListState,
};
