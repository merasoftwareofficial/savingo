import {useCallback, useEffect, useRef} from 'react';
import {DeviceEventEmitter} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {batchSearchUsers} from '../services/userProfileService';
import {createConversation, getCachedUser, cacheUserData} from '../services/chatDatabase';
import {sendMessageToUser} from '../services/messagingService';
import {
  derivePeerUserId,
  deriveIsAppUser,
  isInstalledAppUser,
  mergeInstallState,
  normalizeInstallState,
  INSTALL_STATE_INSTALLED,
  INSTALL_STATE_UNINSTALLED,
} from '../services/ledgerChatIdentityService';
import {
  normalizePhoneForLookup as normalizePhoneForRecognition,
  buildUsersByPhoneMap,
  pickMatchedUserForPhones,
} from '../services/appUserRecognition';

const isUserInstalled = isInstalledAppUser;

const resolveInstallPresence = installState => {
  const normalized = normalizeInstallState(installState);
  if (normalized === INSTALL_STATE_INSTALLED) {
    return true;
  }
  if (normalized === INSTALL_STATE_UNINSTALLED) {
    return false;
  }
  return null;
};
const isExplicitlyUninstalled = value =>
  normalizeInstallState(value?.appInstallState || value) ===
  INSTALL_STATE_UNINSTALLED;
const logLedgerIdentityDiag = (stage, payload = {}) => {
  if (!__DEV__) {
    return;
  }
  console.log(`[LEDGER_IDENTITY_DIAG][${stage}]`, payload);
};

const useLedgerChatController = ({
  contact,
  routeInitialConversationId,
  perfTraceId,
  contactRecordId,
  chatCachePrefix,
  readContactIdentityCache,
  currentUserId,
  setCurrentUserId,
  appUser,
  setAppUser,
  setIsAppUser,
  setConversationId,
  setLoadingChat,
  messageText,
  setMessageText,
  setSendingMessage,
  setUnifiedTimeline,
  chatInputRef,
  showToast,
  loadUnifiedTimeline,
  writeContactIdentityCache,
  getContactPhone,
  normalizePhoneNumber,
  perfLog,
}) => {
  const peerUserIdRef = useRef('');

  const getChatCacheKey = useCallback(() => {
    if (!contact?.recordID) {
      return null;
    }
    return `${chatCachePrefix}${contact.recordID}`;
  }, [chatCachePrefix, contact?.recordID]);

  const buildIdentityPayload = useCallback((payload = {}, options = {}) => {
    const previousIdentity =
      readContactIdentityCache && contactRecordId
        ? readContactIdentityCache(contactRecordId)
        : null;
    const nextUserId = String(
      payload?.userId || payload?.firebaseUid || derivePeerUserId(payload?.appUser) || '',
    ).trim();
    const mergedInstallState = mergeInstallState({
      previousState: previousIdentity?.appInstallState,
      nextState: payload?.appInstallState,
      allowInstalledRecovery: options.allowInstalledRecovery === true,
    });
    const nextIsInstalled = deriveIsAppUser({
      userId: nextUserId,
      firebaseUid: nextUserId,
      appInstallState: mergedInstallState,
    }) === 1;
    const installPresence = resolveInstallPresence(mergedInstallState);
    const nextIsAppUser =
      installPresence === true
        ? true
        : installPresence === false
        ? false
        : nextIsInstalled
        ? true
        : null;

    return {
      ...payload,
      appUser: nextIsAppUser ? payload?.appUser || null : null,
      isAppUser: nextIsAppUser,
      userId: nextUserId,
      firebaseUid: nextUserId,
      appInstallState: mergedInstallState,
      conversationId: String(payload?.conversationId || '').trim() || null,
    };
  }, [contactRecordId, readContactIdentityCache]);

  const applyIdentityPayload = useCallback(payload => {
    if (!contactRecordId) {
      return payload;
    }
    writeContactIdentityCache(contactRecordId, payload);
    setAppUser(payload?.appUser || null);
    const resolvedState =
      payload?.isAppUser === true
        ? true
        : payload?.isAppUser === false
        ? false
        : resolveInstallPresence(payload?.appInstallState);
    setIsAppUser(resolvedState);
    if (payload?.conversationId) {
      setConversationId(payload.conversationId);
    }
    return payload;
  }, [contactRecordId, setAppUser, setConversationId, setIsAppUser, writeContactIdentityCache]);

  const emitInstalledContactRecovery = useCallback(user => {
    if (!user || !isUserInstalled(user)) {
      return;
    }

    // Same state already DB mein hai toh emit skip karo
    const currentState = normalizeInstallState(contact?.appInstallState);
    if (currentState === INSTALL_STATE_INSTALLED) {
      return;
    }

    DeviceEventEmitter.emit('ledger:addContact', {
      ...contact,
      recordID: String(contact?.recordID || '').trim(),
      userId: derivePeerUserId(user || contact),
      username: String(user?.username || contact?.username || '').trim(),
      appUser: user,
      isAppUser: deriveIsAppUser({
        userId: derivePeerUserId(user || contact),
        appInstallState: normalizeInstallState(user?.appInstallState),
      }),
      appInstallState: normalizeInstallState(user?.appInstallState),
      silent: true,
    });
  }, [contact]);

  const loadCachedChatIdentity = useCallback(async () => {
    const cacheKey = getChatCacheKey();
    if (!cacheKey) {
      return null;
    }
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Failed to load chat cache:', error);
      return null;
    }
  }, [getChatCacheKey]);

  const saveCachedChatIdentity = useCallback(async payload => {
    const cacheKey = getChatCacheKey();
    if (!cacheKey || !payload) {
      return;
    }
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to save chat cache:', error);
    }
  }, [getChatCacheKey]);

  const resolveAppUserFromContact = useCallback(() => {
    const contactUser = contact?.appUser || null;
    const contactUserId = derivePeerUserId(contact);
    const contactIsAppUser =
      contact?.isAppUser === true || Number(contact?.isAppUser) === 1;

    if (contactUser && isUserInstalled(contactUser)) {
      const existingPhoto = contactUser.photoURL || contactUser.photo_url || '';
      if (!existingPhoto && contactUserId) {
        const sqlPhoto = getCachedUser(contactUserId)?.photo_url || '';
        return sqlPhoto ? {...contactUser, photoURL: sqlPhoto} : contactUser;
      }
      return contactUser;
    }
    if (contactIsAppUser || contactUserId) {
      if (!isUserInstalled(contact)) {
        return null;
      }
      const sqlPhoto = contactUserId
        ? (getCachedUser(contactUserId)?.photo_url || '')
        : '';
      return {
        userId: contactUserId,
        firebaseUid: contactUserId,
        displayName: contact?.displayName || contact?.savedName || 'Contact',
        appInstallState: normalizeInstallState(contact?.appInstallState),
        ...(sqlPhoto ? {photoURL: sqlPhoto} : {}),
      };
    }
    return null;
  }, [contact]);

  const getContactLookupPhones = useCallback(() => {
    const phoneNumber = getContactPhone();
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const normalizedByRecognition = normalizePhoneForRecognition(phoneNumber);
    const candidates = [
      phoneNumber,
      normalizedPhone,
      normalizedByRecognition,
      normalizedPhone ? `+91${normalizedPhone}` : '',
      normalizedByRecognition ? `+91${normalizedByRecognition}` : '',
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    return [...new Set(candidates)];
  }, [getContactPhone, normalizePhoneNumber]);

  const buildHydratedIdentityState = useCallback(() => {
    const cachedIdentity = readContactIdentityCache
      ? readContactIdentityCache(contactRecordId)
      : null;
    const cachedUserId = String(
      cachedIdentity?.firebaseUid || cachedIdentity?.userId || '',
    ).trim();
    const cachedInstallState = normalizeInstallState(
      cachedIdentity?.appInstallState,
    );
    const contactInstallState = normalizeInstallState(contact?.appInstallState);

    if (cachedInstallState === INSTALL_STATE_UNINSTALLED) {
      return {
        appUser: null,
        isAppUser: false,
      };
    }

    if (
      cachedIdentity &&
      isUserInstalled(cachedIdentity) &&
      (cachedIdentity?.appUser || cachedUserId)
    ) {
      const cachedSqlPhoto = cachedUserId
        ? (getCachedUser(cachedUserId)?.photo_url || '')
        : '';
      const cachedAppUser = cachedIdentity?.appUser
        ? {
            ...cachedIdentity.appUser,
            ...(cachedSqlPhoto &&
            !cachedIdentity.appUser?.photoURL &&
            !cachedIdentity.appUser?.photo_url
              ? {photoURL: cachedSqlPhoto}
              : {}),
          }
        : {
            userId: cachedUserId,
            firebaseUid: cachedUserId,
            displayName:
              cachedIdentity?.displayName ||
              contact?.displayName ||
              contact?.savedName ||
              'Contact',
            appInstallState: normalizeInstallState(cachedIdentity?.appInstallState),
            ...(cachedSqlPhoto ? {photoURL: cachedSqlPhoto} : {}),
          };

      return {
        appUser: cachedAppUser,
        isAppUser: resolveInstallPresence(cachedAppUser?.appInstallState),
      };
    }

    const resolvedAppUser = resolveAppUserFromContact();
    if (resolvedAppUser) {
      return {
        appUser: resolvedAppUser,
        isAppUser: resolveInstallPresence(resolvedAppUser?.appInstallState),
      };
    }

    if (contactInstallState === INSTALL_STATE_UNINSTALLED) {
      return {
        appUser: null,
        isAppUser: false,
      };
    }

    return {
      appUser: null,
      isAppUser: null,
    };
  }, [contact, contactRecordId, readContactIdentityCache, resolveAppUserFromContact]);

  useEffect(() => {
    if (!contactRecordId) {
      return;
    }

    const nextIdentityState = buildHydratedIdentityState();
    setAppUser(nextIdentityState.appUser || null);
    setIsAppUser(nextIdentityState.isAppUser);
  }, [
    buildHydratedIdentityState,
    contactRecordId,
    setAppUser,
    setIsAppUser,
  ]);

  useEffect(() => {
    if (!contactRecordId) {
      return;
    }

    const preferredConversationId = String(routeInitialConversationId || '').trim();
    setConversationId(prev => {
      const previousConversationId = String(prev || '').trim();
      const nextConversationId = preferredConversationId || null;
      if (previousConversationId === String(nextConversationId || '').trim()) {
        return prev;
      }
      return nextConversationId;
    });
  }, [contactRecordId, routeInitialConversationId, setConversationId]);

  const mapContactToAppUser = useCallback(async () => {
    const mapStartedAt = Date.now();
    const preferredConversationId = String(routeInitialConversationId || '').trim();
    perfLog('mapContact:start', {
      contactId: String(contact?.recordID || ''),
      perfTraceId: perfTraceId || null,
    });

    const cachedIdentity = await loadCachedChatIdentity();
    const cachedConversationId = String(
      cachedIdentity?.conversationId || preferredConversationId || '',
    ).trim();
    logLedgerIdentityDiag('MAP_START', {
      contactRecordId: String(contactRecordId || ''),
      contactUserId: String(contact?.userId || contact?.firebaseUid || '').trim(),
      contactInstallState: String(contact?.appInstallState || '').trim().toLowerCase(),
      cachedUserId: String(
        cachedIdentity?.firebaseUid || cachedIdentity?.userId || '',
      ).trim(),
      cachedInstallState: String(cachedIdentity?.appInstallState || '')
        .trim()
        .toLowerCase(),
      cachedConversationId,
    });

    if (cachedIdentity?.userId && isExplicitlyUninstalled(cachedIdentity)) {
      logLedgerIdentityDiag('UNINSTALLED_CACHED_STATE', {
        contactRecordId: String(contactRecordId || ''),
        userId: String(
          cachedIdentity.firebaseUid || cachedIdentity.userId || '',
        ).trim(),
        conversationId: cachedConversationId || null,
      });
      perfLog('mapContact:cache-hydrated', {
        source: cachedConversationId
          ? 'cache-unavailable-with-conversation'
          : 'cache-unavailable',
        conversationId: cachedConversationId || null,
      });
    }

    if (cachedIdentity?.userId && isUserInstalled(cachedIdentity)) {
      logLedgerIdentityDiag('CACHE_INSTALLED_STATE', {
        contactRecordId: String(contactRecordId || ''),
        cachedUid: String(cachedIdentity?.userId || '').trim(),
        cachedConversationId,
      });
    }

    const resolved = resolveAppUserFromContact();
    if (resolved) {
      logLedgerIdentityDiag('CONTACT_RESOLVED_STATE', {
        contactRecordId: String(contactRecordId || ''),
        resolvedUid: String(resolved?.firebaseUid || resolved?.userId || '').trim(),
        resolvedInstallState: String(
          resolved?.appInstallState || '',
        ).trim().toLowerCase(),
      });
    }

    try {
      setLoadingChat(true);
      const phoneNumber = getContactPhone();
      let user = null;
      let hasPhoneIdentity = false;

      // Try phone-based lookup if phone exists
      if (phoneNumber && phoneNumber !== 'No phone number') {
        hasPhoneIdentity = true;
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        if (normalizedPhone) {
          const lookupPhones = getContactLookupPhones();
          const usersMap = await batchSearchUsers(lookupPhones);
          const usersByPhone = buildUsersByPhoneMap(
            Array.isArray(usersMap) ? usersMap : Object.values(usersMap || {}),
          );
          const matched = pickMatchedUserForPhones(usersByPhone, lookupPhones);
          user = matched?.user || null;
          logLedgerIdentityDiag('PHONE_LOOKUP_RESULT', {
            contactRecordId: String(contactRecordId || ''),
            lookupPhones,
            matchedPhone: String(matched?.matchedPhone || '').trim(),
            matchedUid: String(user?.firebaseUid || user?.userId || '').trim(),
            matchedInstallState: String(user?.appInstallState || '').trim().toLowerCase(),
          });
        } else {
          logLedgerIdentityDiag('PHONE_NORMALIZE_FAILED', {
            contactRecordId: String(contactRecordId || ''),
            phoneNumber,
          });
        }
      }

      // If phone lookup failed, fallback to contact object's cached userId
      if (!user) {
        const contactUserId = String(contact?.userId || contact?.firebaseUid || '').trim();

        if (contactUserId) {
          logLedgerIdentityDiag('CONTACT_IDENTITY_FALLBACK', {
            contactRecordId: String(contactRecordId || ''),
            contactUserId,
            hasPhoneIdentity,
          });
          // Use contact's cached identity (from previous interactions)
          // Force INSTALLED state since userId existence proves they're app user
          user = {
            userId: contactUserId,
            firebaseUid: contactUserId,
            displayName: contact?.displayName || contact?.savedName || 'Contact',
            appInstallState: INSTALL_STATE_INSTALLED,
            photoURL: contact?.photoURL || contact?.photo_url || '',
          };
        }
      }

      // Process resolved user identity
      if (user && isUserInstalled(user)) {
        cacheUserData(user);
        const resolvedUserId = String(
          user.userId || user.firebaseUid || '',
        ).trim();
        // Cache peer ID for transaction submissions
        peerUserIdRef.current = resolvedUserId;
        const loadedCurrentUserId = await AsyncStorage.getItem('firebaseUid');
        const convId =
          cachedConversationId ||
          preferredConversationId ||
          (loadedCurrentUserId
            ? await createConversation(
                user.firebaseUid || user.userId,
                user,
                loadedCurrentUserId,
              )
            : null);
        const fallbackIdentity = buildIdentityPayload({
          appUser: user,
          userId: resolvedUserId,
          firebaseUid: resolvedUserId,
          appInstallState: normalizeInstallState(user.appInstallState),
          conversationId: String(convId || '').trim() || null,
        }, {allowInstalledRecovery: true});
        applyIdentityPayload(fallbackIdentity);
        await saveCachedChatIdentity({
          userId: resolvedUserId,
          firebaseUid: resolvedUserId,
          displayName:
            user.displayName || contact?.displayName || contact?.savedName || 'Contact',
          appInstallState: normalizeInstallState(user.appInstallState),
          conversationId: String(convId || '').trim() || null,
        });
        emitInstalledContactRecovery(user);
        perfLog('mapContact:end', {
          source: hasPhoneIdentity ? 'phone-lookup' : 'contact-fallback',
          durationMs: Date.now() - mapStartedAt,
        });
      } else {
        setAppUser(null);
        setIsAppUser(false);
        const unresolvedUserId = String(
          user?.firebaseUid || user?.userId || '',
        ).trim();
        // Cache peer ID for non-app users
        peerUserIdRef.current = unresolvedUserId;
        const unresolvedInstallState = String(
          user?.appInstallState || 'uninstalled',
        )
          .trim()
          .toLowerCase();
        // DB mein bhi uninstalled persist karo agar contact ka current state different hai
        const currentContactInstallState = normalizeInstallState(contact?.appInstallState);
        if (currentContactInstallState !== INSTALL_STATE_UNINSTALLED) {
          DeviceEventEmitter.emit('ledger:addContact', {
            ...contact,
            recordID: String(contact?.recordID || '').trim(),
            userId: unresolvedUserId || derivePeerUserId(contact),
            appInstallState: INSTALL_STATE_UNINSTALLED,
            isAppUser: 0,
            silent: true,
          });
        }
        if (unresolvedUserId) {
          const unresolvedIdentity = buildIdentityPayload({
            appUser: null,
            userId: unresolvedUserId,
            firebaseUid: unresolvedUserId,
            appInstallState: unresolvedInstallState,
            conversationId: cachedConversationId || null,
          });
          applyIdentityPayload(unresolvedIdentity);
          await saveCachedChatIdentity({
            userId: unresolvedUserId,
            firebaseUid: unresolvedUserId,
            displayName: contact?.displayName || contact?.savedName || 'Contact',
            appInstallState: normalizeInstallState(unresolvedInstallState),
            conversationId: cachedConversationId || null,
          });
        }
        perfLog('mapContact:end', {
          source: 'non-app-user',
          durationMs: Date.now() - mapStartedAt,
        });
      }
    } catch (error) {
      console.error('Failed to map contact to user:', error);
      setAppUser(null);
      setIsAppUser(false);
    } finally {
      setLoadingChat(false);
    }
  }, [
    contact,
    contactRecordId,
    getContactPhone,
    loadCachedChatIdentity,
    normalizePhoneNumber,
    perfLog,
    perfTraceId,
    resolveAppUserFromContact,
    routeInitialConversationId,
    saveCachedChatIdentity,
    setAppUser,
    setIsAppUser,
    setLoadingChat,
    emitInstalledContactRecovery,
    getContactLookupPhones,
    applyIdentityPayload,
    buildIdentityPayload,
  ]);

  // Returns cached peer ID (resolved during mapContactToAppUser)
  const resolvePeerUserIdForSync = useCallback(async () => {
    return peerUserIdRef.current;
  }, []);

  const handleSendMessage = useCallback(async ({conversationId}) => {
    perfLog('chat:send-press', {
      hasText: Boolean(messageText.trim()),
      hasConversationId: Boolean(conversationId),
      hasAppUser: Boolean(appUser),
    });
    if (
      !messageText.trim() ||
      !conversationId ||
      !appUser ||
      !isUserInstalled(appUser)
    ) {
      if (appUser && !isUserInstalled(appUser)) {
        setAppUser(null);
        setIsAppUser(false);
        showToast('This user is no longer available on the app', 'error');
      }
      return;
    }

    chatInputRef.current?.focus();
    setSendingMessage(true);
    const now = Date.now();
    const messageId = `msg_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const messageValue = messageText.trim();

    const optimisticMessage = {
      id: `msg-${messageId}`,
      type: 'message',
      timestamp: now,
      data: {
        message_id: messageId,
        message_text: messageValue,
        sender_id: currentUserId || '',
        receiver_id: appUser.firebaseUid || appUser.userId,
        delivery_status: 'sending',
        is_read: 0,
        timestamp: now,
      },
    };

    console.log('[BUBBLE_TRACE] T1 optimistic-add', {t: Date.now(), msgId: messageId, prevCount: 'pending'});
    setUnifiedTimeline(prev => {
      console.log('[BUBBLE_TRACE] T2 setUnifiedTimeline-called', {t: Date.now(), prevCount: prev?.length ?? 0});
      return [optimisticMessage, ...(prev || [])];
    });
    setMessageText('');
    console.log('[BUBBLE_TRACE] T4 before-sendMessageToUser', {t: Date.now()});

    try {
      await sendMessageToUser(appUser.firebaseUid || appUser.userId, {
        conversationId,
        messageId,
        contactRecordId: String(contact?.recordID || ''),
        messageText: messageValue,
        messageType: 'text',
        timestamp: now,
        receiverPhoneCandidates: (() => {
          const phone = getContactPhone();
          const normalized = normalizePhoneNumber(phone);
          if (!normalized) {
            return [phone].filter(Boolean);
          }
          return [phone, normalized, `+91${normalized}`].filter(Boolean);
        })(),
      });
      console.log('[BUBBLE_TRACE] T5 sendMessageToUser-done', {t: Date.now()});
      await loadUnifiedTimeline(conversationId);
      console.log('[BUBBLE_TRACE] T6 loadUnifiedTimeline-done (success)', {t: Date.now()});
    } catch (error) {
      console.error('Failed to send message:', error);
      if (error?.code === 'RECEIVER_UNAVAILABLE') {
        const unavailableContact = {
          ...contact,
          recordID: String(contact?.recordID || '').trim(),
          userId: String(appUser?.firebaseUid || appUser?.userId || contact?.userId || '').trim(),
          isAppUser: 0,
          appInstallState: 'uninstalled',
          silent: true,
        };
        const unavailableIdentity = buildIdentityPayload({
          appUser: null,
          userId: unavailableContact.userId,
          firebaseUid: unavailableContact.userId,
          appInstallState: 'uninstalled',
          conversationId: String(conversationId || '').trim() || null,
        });
        applyIdentityPayload(unavailableIdentity);
        await saveCachedChatIdentity({
          userId: unavailableContact.userId,
          firebaseUid: unavailableContact.userId,
          displayName: contact?.displayName || contact?.savedName || 'Contact',
          appInstallState: 'uninstalled',
          conversationId: String(conversationId || '').trim() || null,
        });
        DeviceEventEmitter.emit('ledger:addContact', unavailableContact);
        showToast('This user is no longer available on the app', 'error');
      } else {
        showToast('Failed to send message', 'error');
      }
      await loadUnifiedTimeline(conversationId);
    } finally {
      setSendingMessage(false);
    }
  }, [
    appUser,
    chatInputRef,
    contact,
    currentUserId,
    getContactPhone,
    loadUnifiedTimeline,
    messageText,
    normalizePhoneNumber,
    perfLog,
    saveCachedChatIdentity,
    setMessageText,
    setAppUser,
    setIsAppUser,
    setSendingMessage,
    setUnifiedTimeline,
    showToast,
    applyIdentityPayload,
    buildIdentityPayload,
  ]);

  useEffect(() => {
    const loadCurrentUserId = async () => {
      try {
        const uid = await AsyncStorage.getItem('firebaseUid');
        setCurrentUserId(uid);
      } catch (error) {
        console.error('Failed to load current user ID:', error);
      }
    };
    loadCurrentUserId();
  }, [setCurrentUserId]);

  return {
    handleSendMessage,
    loadCachedChatIdentity,
    mapContactToAppUser,
    resolvePeerUserIdForSync,
    saveCachedChatIdentity,
  };
};

export default useLedgerChatController;
