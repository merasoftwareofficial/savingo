import {useMemo} from 'react';

const normalizeText = value => String(value || '').trim();
const normalizeInstallState = value =>
  normalizeText(value).toLowerCase() || 'installed';
const isEmailLike = value => Boolean(value) && String(value).includes('@');
const isUsernameLike = value =>
  Boolean(value) &&
  !String(value).includes(' ') &&
  String(value) === String(value).toLowerCase() &&
  String(value).length > 5;

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

const getHeaderInitial = (contact, appUser, displayName) => {
  const structuredName = [contact?.givenName, contact?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const appUserDisplayName = normalizeText(appUser?.displayName);
  const initialSource =
    structuredName ||
    (!isEmailLike(contact?.savedName) &&
    !isUsernameLike(contact?.savedName) &&
    contact?.savedName) ||
    (!isEmailLike(contact?.displayName) &&
    !isUsernameLike(contact?.displayName) &&
    contact?.displayName) ||
    (!isEmailLike(appUserDisplayName) && appUserDisplayName) ||
    displayName ||
    '?';
  return (String(initialSource || '?').charAt(0) || '?').toUpperCase();
};

const countMessageStatuses = timeline => {
  const counts = {
    sending: 0,
    queued: 0,
    failed: 0,
  };
  (Array.isArray(timeline) ? timeline : []).forEach(item => {
    if (item?.type !== 'message') {
      return;
    }
    const status = normalizeText(item?.data?.delivery_status).toLowerCase();
    if (status === 'sending') {
      counts.sending += 1;
    } else if (status === 'queued') {
      counts.queued += 1;
    } else if (status === 'failed') {
      counts.failed += 1;
    }
  });
  return counts;
};

const useMainChatSystemState = ({
  contact,
  appUser,
  isAppUser,
  conversationId,
  messageText,
  sendingMessage,
  loadingChat,
  timelineLoading,
  hasLoadedTimeline,
  timelineForList,
  unifiedTimeline,
  headerPhone,
  isScreenFocused = false,
}) =>
  useMemo(() => {
    const resolvedInstallState = normalizeInstallState(
      appUser?.appInstallState || contact?.appInstallState,
    );
    const canChat = isAppUser === true && resolvedInstallState !== 'uninstalled';
    const canInvite = isAppUser === false || resolvedInstallState === 'uninstalled';
    const resolvedDisplayName = getContactDisplayName(contact, appUser);
    const resolvedConversationId = normalizeText(conversationId);
    const timelineItems = Array.isArray(timelineForList)
      ? timelineForList
      : Array.isArray(unifiedTimeline)
        ? unifiedTimeline
        : [];
    const timelineCount = timelineItems.length;
    const lastMessageTimestamp = timelineItems.reduce((latest, item) => {
      const timestamp = Number(item?.data?.timestamp || item?.timestamp || 0);
      return timestamp > latest ? timestamp : latest;
    }, 0);
    const statusCounts = countMessageStatuses(timelineItems);
    const shouldShowEmptyHistory =
      !timelineLoading &&
      timelineCount === 0 &&
      ((canChat && hasLoadedTimeline && !loadingChat && Boolean(resolvedConversationId)) ||
        (canInvite && hasLoadedTimeline && !loadingChat));
    const headerAvatarUri = normalizeText(
      contact?.thumbnailPath || appUser?.photoURL || appUser?.photo_url,
    );
    const photoEligible = canChat;
    const primaryPhotoSource = normalizeText(appUser?.photoURL || appUser?.photo_url)
      ? 'app-user-photo'
      : normalizeText(contact?.thumbnailPath)
        ? 'device-thumbnail'
        : 'none';

    return {
      contactIdentity: {
        recordId: normalizeText(contact?.recordID),
        userId: normalizeText(appUser?.userId || contact?.userId),
        firebaseUid: normalizeText(appUser?.firebaseUid || contact?.firebaseUid || contact?.userId),
        displayName: resolvedDisplayName,
        username: normalizeText(appUser?.username || contact?.username),
        phone: normalizeText(headerPhone),
        identityResolved: Boolean(
          normalizeText(contact?.recordID) || normalizeText(appUser?.userId || contact?.userId),
        ),
      },
      installState: {
        isAppUser: isAppUser === true,
        appInstallState: resolvedInstallState,
        canChat,
        canInvite,
      },
      profilePhotoState: {
        primaryPhotoSource,
        photoUrl: normalizeText(appUser?.photoURL || appUser?.photo_url),
        fallbackThumbnail: normalizeText(contact?.thumbnailPath),
        photoEligible,
        lastPhotoSyncAt: 0,
        headerAvatarUri,
        headerInitial: getHeaderInitial(contact, appUser, resolvedDisplayName),
      },
      conversationState: {
        conversationId: resolvedConversationId,
        isResolved: Boolean(resolvedConversationId),
        isOpen: Boolean(isScreenFocused && resolvedConversationId),
        lastMessageId: normalizeText(timelineItems?.[0]?.data?.message_id || timelineItems?.[0]?.id),
        lastMessageTimestamp,
      },
      composerState: {
        draftText: String(messageText || ''),
        canSend: Boolean(String(messageText || '').trim()) && canChat,
        isSending: Boolean(sendingMessage),
        sendBlockedReason: canChat ? '' : 'chat-unavailable',
      },
      messageFlowState: {
        timelineBase: timelineItems,
        timelineCount,
        hasLoadedTimeline: Boolean(hasLoadedTimeline),
        pendingOutboxCount: statusCounts.sending + statusCounts.queued,
      },
      messageStatusState: statusCounts,
      activeChatState: {
        isFocused: Boolean(isScreenFocused),
        isVisible: Boolean(isScreenFocused),
        shouldMarkRead: Boolean(isScreenFocused && canChat && resolvedConversationId),
        shouldSuppressNotification: Boolean(isScreenFocused && resolvedConversationId),
      },
      notificationState: {
        shouldShow: !isScreenFocused,
        shouldSuppress: Boolean(isScreenFocused && resolvedConversationId),
        shouldClear: Boolean(isScreenFocused && resolvedConversationId),
        openRoutingReady: Boolean(resolvedConversationId),
      },
      reconciliationState: {
        hydratedFromCache: Boolean(hasLoadedTimeline),
        resolvedFromStartup: Boolean(resolvedConversationId),
        resolvedFromRestore: false,
        needsRebuild: false,
      },
      renderState: {
        shouldShowComposer: canChat,
        shouldShowInviteBanner: canInvite,
        shouldShowEmptyHistory,
      },
    };
  }, [
    appUser,
    contact,
    conversationId,
    hasLoadedTimeline,
    headerPhone,
    isAppUser,
    isScreenFocused,
    loadingChat,
    messageText,
    sendingMessage,
    timelineForList,
    timelineLoading,
    unifiedTimeline,
  ]);

export default useMainChatSystemState;
