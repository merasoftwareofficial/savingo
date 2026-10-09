import {useCallback, useEffect} from 'react';
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
      orderNeutralUpdate: true,
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

    if (
      cachedIdentity?.userId &&
      normalizeInstallState(cachedIdentity?.appInstallState) ===
        INSTALL_STATE_UNINSTALLED
    ) {
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
      const unavailableUserId = String(
        cachedIdentity.firebaseUid || cachedIdentity.userId || '',
      ).trim();

      // Sticky unavailable state: apply immediately, then verify in background flow.
      const unavailableIdentity = buildIdentityPayload({
        appUser: null,
        userId: unavailableUserId,
        firebaseUid: unavailableUserId,
        appInstallState: 'uninstalled',
        conversationId: cachedConversationId || null,
      });
      applyIdentityPayload(unavailableIdentity);
      await saveCachedChatIdentity({
        ...cachedIdentity,
        userId: unavailableUserId,
        firebaseUid: unavailableUserId,
        appInstallState: 'uninstalled',
        conversationId: cachedConversationId || null,
      });
      logLedgerIdentityDiag('UNINSTALLED_APPLIED', {
        contactRecordId: String(contactRecordId || ''),
        userId: unavailableUserId,
        conversationId: cachedConversationId || null,
      });
      perfLog('mapContact:cache-hydrated', {
        source: cachedConversationId
          ? 'cache-unavailable-with-conversation'
          : 'cache-unavailable',
        conversationId: cachedConversationId || null,
      });

      const lookupPhones = getContactLookupPhones();
      let matched = null;
      if (lookupPhones.length > 0) {
        const usersMap = await batchSearchUsers(lookupPhones);
        const usersByPhone = buildUsersByPhoneMap(
          Array.isArray(usersMap) ? usersMap : Object.values(usersMap || {}),
        );
        matched = pickMatchedUserForPhones(usersByPhone, lookupPhones);
        logLedgerIdentityDiag('UNINSTALLED_VERIFY_RESULT', {
          contactRecordId: String(contactRecordId || ''),
          lookupPhones,
          matchedPhone: String(matched?.matchedPhone || '').trim(),
          matchedUid: String(
            matched?.user?.firebaseUid || matched?.user?.userId || '',
          ).trim(),
          matchedInstallState: String(
            matched?.user?.appInstallState || '',
          ).trim().toLowerCase(),
        });
      }

      if (matched?.user && isUserInstalled(matched.user)) {
        const restoredUser = matched.user;
        cacheUserData(restoredUser);
        const restoredUid = String(
          restoredUser.firebaseUid || restoredUser.userId || '',
        ).trim();
        if (restoredUid) {
          const loadedCurrentUserId = await AsyncStorage.getItem('firebaseUid');
          const convId =
            cachedConversationId ||
            (loadedCurrentUserId
              ? await createConversation(
                  restoredUid,
                  restoredUser,
                  loadedCurrentUserId,
                )
              : null);
          const restoredIdentity = buildIdentityPayload({
            appUser: restoredUser,
            userId: restoredUid,
            firebaseUid: restoredUid,
            appInstallState: normalizeInstallState(restoredUser.appInstallState),
            conversationId: String(convId || '').trim() || null,
          }, {allowInstalledRecovery: true});
          applyIdentityPayload(restoredIdentity);
          await saveCachedChatIdentity({
            userId: restoredUid,
            firebaseUid: restoredUid,
            displayName:
              restoredUser.displayName ||
              contact?.displayName ||
              contact?.savedName ||
              'Contact',
            appInstallState: normalizeInstallState(restoredUser.appInstallState),
            conversationId: String(convId || '').trim() || null,
          });
          logLedgerIdentityDiag('UNINSTALLED_RESTORED', {
            contactRecordId: String(contactRecordId || ''),
            restoredUid: restoredUid,
            conversationId: String(convId || '').trim() || null,
          });
          emitInstalledContactRecovery(restoredUser);
          perfLog('mapContact:end', {
            source: 'cache-unavailable-restored',
            durationMs: Date.now() - mapStartedAt,
            conversationId: String(convId || '').trim() || null,
          });
          return;
        }
      }

      perfLog('mapContact:end', {
        source: 'cache-unavailable-terminal',
        durationMs: Date.now() - mapStartedAt,
        conversationId: cachedConversationId || null,
      });
      logLedgerIdentityDiag('UNINSTALLED_TERMINAL', {
        contactRecordId: String(contactRecordId || ''),
        userId: unavailableUserId,
        conversationId: cachedConversationId || null,
      });
      return;
    }

    if (cachedIdentity?.userId && isUserInstalled(cachedIdentity)) {
      logLedgerIdentityDiag('CACHE_INSTALLED_PATH', {
        contactRecordId: String(contactRecordId || ''),
        cachedUid: String(cachedIdentity?.userId || '').trim(),
        cachedConversationId,
      });
      const cachedUserUid = String(cachedIdentity.userId || '').trim();
      const cachedUserPhoto = cachedUserUid
        ? (getCachedUser(cachedUserUid)?.photo_url || '')
        : '';
      const cachedUser = {
        userId: cachedIdentity.userId,
        firebaseUid: cachedIdentity.firebaseUid || cachedIdentity.userId,
        displayName:
          cachedIdentity.displayName ||
          contact?.displayName ||
          contact?.savedName ||
          'Contact',
        appInstallState: normalizeInstallState(cachedIdentity.appInstallState),
        ...(cachedUserPhoto ? {photoURL: cachedUserPhoto} : {}),
      };
      const cachedInstalledIdentity = buildIdentityPayload({
        appUser: cachedUser,
        userId: String(cachedUser.userId || '').trim(),
        firebaseUid: String(cachedUser.firebaseUid || '').trim(),
        appInstallState: normalizeInstallState(cachedUser.appInstallState),
        conversationId: cachedConversationId || null,
      });
      applyIdentityPayload(cachedInstalledIdentity);

      if (cachedConversationId) {
        setConversationId(cachedConversationId);
        await saveCachedChatIdentity({
          ...cachedIdentity,
          conversationId: cachedConversationId,
        });
        perfLog('mapContact:end', {
          source: 'cache-with-conversation',
          durationMs: Date.now() - mapStartedAt,
          conversationId: cachedConversationId,
        });
        return;
      }

      const loadedCurrentUserId = await AsyncStorage.getItem('firebaseUid');
      if (loadedCurrentUserId) {
        const convId = await createConversation(
          cachedUser.firebaseUid || cachedUser.userId,
          cachedUser,
          loadedCurrentUserId,
        );
        const cachedConversationIdentity = buildIdentityPayload({
          appUser: cachedUser,
          userId: String(cachedUser.userId || '').trim(),
          firebaseUid: String(cachedUser.firebaseUid || '').trim(),
          appInstallState: normalizeInstallState(cachedUser.appInstallState),
          conversationId: convId,
        });
        applyIdentityPayload(cachedConversationIdentity);
        await saveCachedChatIdentity({
          ...cachedIdentity,
          conversationId: convId,
        });
      } else {
        await loadUnifiedTimeline(null);
      }
      perfLog('mapContact:end', {
        source: 'cache-no-conversation',
        durationMs: Date.now() - mapStartedAt,
      });
      return;
    }

    const resolved = resolveAppUserFromContact();
    if (resolved) {
      logLedgerIdentityDiag('CONTACT_RESOLVED_PATH', {
        contactRecordId: String(contactRecordId || ''),
        resolvedUid: String(resolved?.firebaseUid || resolved?.userId || '').trim(),
        resolvedInstallState: String(
          resolved?.appInstallState || '',
        ).trim().toLowerCase(),
      });
      const resolvedIdentity = buildIdentityPayload({
        appUser: resolved,
        userId: String(resolved.userId || resolved.firebaseUid || '').trim(),
        firebaseUid: String(resolved.firebaseUid || resolved.userId || '').trim(),
        appInstallState: normalizeInstallState(resolved.appInstallState),
        conversationId: null,
      });
      applyIdentityPayload(resolvedIdentity);
      await saveCachedChatIdentity({
        userId: resolved.userId || resolved.firebaseUid || '',
        firebaseUid: resolved.firebaseUid || resolved.userId || '',
        displayName:
          resolved.displayName || contact?.displayName || contact?.savedName || 'Contact',
        appInstallState: normalizeInstallState(resolved.appInstallState),
        conversationId: preferredConversationId || null,
      });
      if (preferredConversationId) {
        const preferredConversationIdentity = buildIdentityPayload({
          appUser: resolved,
          userId: String(resolved.userId || resolved.firebaseUid || '').trim(),
          firebaseUid: String(resolved.firebaseUid || resolved.userId || '').trim(),
          appInstallState: normalizeInstallState(resolved.appInstallState),
          conversationId: preferredConversationId,
        });
        applyIdentityPayload(preferredConversationIdentity);
        perfLog('mapContact:end', {
          source: 'resolved-contact-seeded-conversation',
          durationMs: Date.now() - mapStartedAt,
          conversationId: preferredConversationId,
        });
        return;
      }
      const loadedCurrentUserId = await AsyncStorage.getItem('firebaseUid');
      if (loadedCurrentUserId) {
        const convId = await createConversation(
          resolved.firebaseUid || resolved.userId,
          resolved,
          loadedCurrentUserId,
        );
        const resolvedConversationIdentity = buildIdentityPayload({
          appUser: resolved,
          userId: String(resolved.userId || resolved.firebaseUid || '').trim(),
          firebaseUid: String(resolved.firebaseUid || resolved.userId || '').trim(),
          appInstallState: normalizeInstallState(resolved.appInstallState),
          conversationId: convId,
        });
        applyIdentityPayload(resolvedConversationIdentity);
        await saveCachedChatIdentity({
          userId: resolved.userId || resolved.firebaseUid || '',
          firebaseUid: resolved.firebaseUid || resolved.userId || '',
          displayName:
            resolved.displayName || contact?.displayName || contact?.savedName || 'Contact',
          appInstallState: normalizeInstallState(resolved.appInstallState),
          conversationId: convId,
        });
      }
      emitInstalledContactRecovery(resolved);
      perfLog('mapContact:end', {
        source: 'resolved-contact',
        durationMs: Date.now() - mapStartedAt,
      });
      return;
    }

    try {
      setLoadingChat(true);
      const phoneNumber = getContactPhone();
      if (!phoneNumber || phoneNumber === 'No phone number') {
        setAppUser(null);
        setIsAppUser(false);
        perfLog('mapContact:end', {
          source: 'no-phone',
          durationMs: Date.now() - mapStartedAt,
        });
        return;
      }

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        setAppUser(null);
        setIsAppUser(false);
        perfLog('mapContact:end', {
          source: 'normalize-failed',
          durationMs: Date.now() - mapStartedAt,
        });
        return;
      }

      const lookupPhones = getContactLookupPhones();
      const usersMap = await batchSearchUsers(lookupPhones);
      const usersByPhone = buildUsersByPhoneMap(
        Array.isArray(usersMap) ? usersMap : Object.values(usersMap || {}),
      );
      const matched = pickMatchedUserForPhones(usersByPhone, lookupPhones);
      const user = matched?.user || null;
      logLedgerIdentityDiag('FALLBACK_LOOKUP_RESULT', {
        contactRecordId: String(contactRecordId || ''),
        lookupPhones,
        matchedPhone: String(matched?.matchedPhone || '').trim(),
        matchedUid: String(user?.firebaseUid || user?.userId || '').trim(),
        matchedInstallState: String(user?.appInstallState || '').trim().toLowerCase(),
      });

      if (user && isUserInstalled(user)) {
        cacheUserData(user);
        const fallbackIdentity = buildIdentityPayload({
          appUser: user,
          userId: String(user.userId || user.firebaseUid || '').trim(),
          firebaseUid: String(user.firebaseUid || user.userId || '').trim(),
          appInstallState: normalizeInstallState(user.appInstallState),
          conversationId: null,
        }, {allowInstalledRecovery: true});
        applyIdentityPayload(fallbackIdentity);
        await saveCachedChatIdentity({
          userId: user.userId || user.firebaseUid || '',
          firebaseUid: user.firebaseUid || user.userId || '',
          displayName:
            user.displayName || contact?.displayName || contact?.savedName || 'Contact',
          appInstallState: normalizeInstallState(user.appInstallState),
          conversationId: null,
        });

        const loadedCurrentUserId = await AsyncStorage.getItem('firebaseUid');
        const convId = await createConversation(
          user.firebaseUid || user.userId,
          user,
          loadedCurrentUserId,
        );
        const fallbackConversationIdentity = buildIdentityPayload({
          appUser: user,
          userId: String(user.userId || user.firebaseUid || '').trim(),
          firebaseUid: String(user.firebaseUid || user.userId || '').trim(),
          appInstallState: normalizeInstallState(user.appInstallState),
          conversationId: convId,
        }, {allowInstalledRecovery: true});
        applyIdentityPayload(fallbackConversationIdentity);
        await saveCachedChatIdentity({
          userId: user.userId || user.firebaseUid || '',
          firebaseUid: user.firebaseUid || user.userId || '',
          displayName:
            user.displayName || contact?.displayName || contact?.savedName || 'Contact',
          appInstallState: normalizeInstallState(user.appInstallState),
          conversationId: convId,
        });
        emitInstalledContactRecovery(user);
      } else {
        setAppUser(null);
        setIsAppUser(false);
        const unresolvedUserId = String(
          user?.firebaseUid || user?.userId || '',
        ).trim();
        const unresolvedInstallState = String(
          user?.appInstallState || 'uninstalled',
        )
          .trim()
          .toLowerCase();
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
    loadUnifiedTimeline,
    normalizePhoneNumber,
    perfLog,
    perfTraceId,
    resolveAppUserFromContact,
    routeInitialConversationId,
    saveCachedChatIdentity,
    setAppUser,
    setConversationId,
    setIsAppUser,
    setLoadingChat,
    emitInstalledContactRecovery,
    getContactLookupPhones,
    applyIdentityPayload,
    buildIdentityPayload,
  ]);

  const resolvePeerUserIdForSync = useCallback(async () => {
    const cachedIdentity = await loadCachedChatIdentity();

    const tryResolveByPhones = async () => {
      const lookupPhones = getContactLookupPhones();
      if (!lookupPhones.length) {
        return '';
      }
      const usersMap = await batchSearchUsers(lookupPhones);
      const usersByPhone = buildUsersByPhoneMap(
        Array.isArray(usersMap) ? usersMap : Object.values(usersMap || {}),
      );
      const matched = pickMatchedUserForPhones(usersByPhone, lookupPhones);
      const user = matched?.user || null;
      if (!user || !isUserInstalled(user)) {
        return '';
      }
      cacheUserData(user);
      const syncIdentity = buildIdentityPayload({
        appUser: user,
        userId: String(user.userId || user.firebaseUid || '').trim(),
        firebaseUid: String(user.firebaseUid || user.userId || '').trim(),
        appInstallState: normalizeInstallState(user.appInstallState),
        conversationId: routeInitialConversationId || null,
      }, {allowInstalledRecovery: true});
      applyIdentityPayload(syncIdentity);
      await saveCachedChatIdentity({
        userId: user.userId || user.firebaseUid || '',
        firebaseUid: user.firebaseUid || user.userId || '',
        displayName:
          user.displayName || contact?.displayName || contact?.savedName || 'Contact',
        appInstallState: normalizeInstallState(user.appInstallState),
        conversationId: routeInitialConversationId || null,
      });
      return String(user.firebaseUid || user.userId || '').trim();
    };

    if (cachedIdentity?.userId && isExplicitlyUninstalled(cachedIdentity)) {
      const restoredPeerId = await tryResolveByPhones();
      if (restoredPeerId) {
        return restoredPeerId;
      }
      setAppUser(null);
      setIsAppUser(false);
      return '';
    }
    let resolvedPeerUserId =
      (isUserInstalled(appUser) ? appUser?.firebaseUid || appUser?.userId : '') ||
      (isUserInstalled(cachedIdentity) ? cachedIdentity?.firebaseUid || cachedIdentity?.userId : '') ||
      (isUserInstalled(contact) ? contact?.userId || contact?.firebaseUid : '') ||
      '';

    if (!resolvedPeerUserId) {
      resolvedPeerUserId = await tryResolveByPhones();
    }

    return String(resolvedPeerUserId || '').trim();
  }, [
    appUser,
    contact,
    loadCachedChatIdentity,
    routeInitialConversationId,
    saveCachedChatIdentity,
    setAppUser,
    setIsAppUser,
    applyIdentityPayload,
    buildIdentityPayload,
    getContactLookupPhones,
  ]);

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
