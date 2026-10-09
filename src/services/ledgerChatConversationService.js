import {
  buildConversationId,
  createConversation,
  getConversation,
  updateConversation,
} from './chatDatabase';

const normalizeText = value => String(value || '').trim();

const normalizeConversationUserData = userData => ({
  userId: normalizeText(userData?.userId || userData?.firebaseUid),
  firebaseUid: normalizeText(userData?.firebaseUid || userData?.userId),
  username: normalizeText(userData?.username),
  displayName: normalizeText(userData?.displayName),
  phoneNumber: normalizeText(userData?.phoneNumber),
  photoURL: normalizeText(userData?.photoURL || userData?.photo_url),
});

export const isConversationIdOwnedByUsers = (
  conversationId,
  currentUserId,
  peerUserId,
) => {
  const expectedConversationId = buildConversationId(currentUserId, peerUserId);
  return Boolean(
    expectedConversationId &&
      normalizeText(conversationId) === normalizeText(expectedConversationId),
  );
};

export const resolveLedgerConversationId = ({
  preferredConversationId = '',
  currentUserId,
  peerUserId,
} = {}) => {
  if (
    isConversationIdOwnedByUsers(
      preferredConversationId,
      currentUserId,
      peerUserId,
    )
  ) {
    return normalizeText(preferredConversationId);
  }
  return buildConversationId(currentUserId, peerUserId);
};

export const ensureLedgerConversation = ({
  currentUserId,
  peerUserId,
  userData = {},
  preferredConversationId = '',
} = {}) => {
  const resolvedPeerUserId = normalizeText(peerUserId);
  const resolvedCurrentUserId = normalizeText(currentUserId);
  const resolvedConversationId = resolveLedgerConversationId({
    preferredConversationId,
    currentUserId: resolvedCurrentUserId,
    peerUserId: resolvedPeerUserId,
  });

  if (!resolvedCurrentUserId || !resolvedPeerUserId || !resolvedConversationId) {
    return null;
  }

  const existing = getConversation(resolvedConversationId);
  const normalizedUserData = normalizeConversationUserData({
    ...userData,
    userId: resolvedPeerUserId,
    firebaseUid: resolvedPeerUserId,
  });
  const conversationId = createConversation(
    resolvedPeerUserId,
    normalizedUserData,
    resolvedCurrentUserId,
  );

  return {
    conversationId,
    existed: Boolean(existing),
    conversation: getConversation(conversationId),
  };
};

export const ensureConversationForUpdate = ({
  conversationId,
  currentUserId,
  peerUserId,
  userData = {},
  updates = null,
} = {}) => {
  const ensured = ensureLedgerConversation({
    currentUserId,
    peerUserId,
    userData,
    preferredConversationId: conversationId,
  });

  if (!ensured?.conversationId) {
    return {conversationId: '', conversation: null};
  }

  if (updates && Object.keys(updates).length > 0) {
    updateConversation(ensured.conversationId, updates);
  }

  return {
    conversationId: ensured.conversationId,
    conversation: getConversation(ensured.conversationId),
  };
};

export default {
  ensureConversationForUpdate,
  ensureLedgerConversation,
  isConversationIdOwnedByUsers,
  resolveLedgerConversationId,
};
