import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  Platform,
  Modal,
  TextInput,
  Animated,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'; // For push-pin icon
import AsyncStorage from '@react-native-async-storage/async-storage';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useToast} from '../hooks/useToast';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {
  getAllContactBalances,
  getLedgerStatistics,
  deleteContactAndTransactions,
  setContactName,
  getContactName,
  deleteContactName,
  getLatestTransactionDateByContact,
  getLatestTransactionByContact,
} from '../services/ledgerDatabase';
import {
  createConversation,
  getMessages,
  deleteConversationCascade,
  deleteConversationsByOtherUserId,
  getUnreadCountForOtherUserId,
  getCachedUser,
  getLatestMessagePerUser,
} from '../services/chatDatabase';
import {ensureLedgerFeatureDatabasesReady} from '../services/dbLifecycleManager';
import TapEffect from '../components/ui/TapEffect';
import SetupRequirePopup from '../components/setuprequirepopup';
import LedgerSummaryHeader from '../ui/LedgerSummaryHeader';
import LedgerContactRow from '../ui/LedgerContactRow';
import {useChatStore} from '../context/ChatStore';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {createPerfTimer, perfLog, perfNow} from '../utils/perfLogger';
import {readCachedSessionUser} from '../services/sessionService';
import {getLedgerNetOutstandingLabel} from '../utils/ledgerBalanceLabel';
import {
  deriveIsAppUser,
  derivePeerUserId,
  mergeInstallState,
  normalizeInstallState,
  normalizeLedgerContactIdentity,
} from '../services/ledgerChatIdentityService';
import {resolveInitialContactIdentity} from '../services/ledgerContactBootstrapService';

const CONTACTS_STORAGE_KEY = 'ledgerContacts';
const PINNED_CONTACT_IDS_STORAGE_KEY = 'pinnedLedgerContactIds';
const LEDGER_CHAT_CACHE_PREFIX = 'ledgerChatCache:';
const PLACEHOLDER_CONTACT_NAMES = new Set([
  'contact',
  'app user',
  'unknown contact',
  'unnamed contact',
  'user',
]);
const logLedgerScreenDiag = (stage, payload = {}) => {
  if (!__DEV__) {
    return;
  }
  console.log(`[LEDGER_SCREEN_DIAG][${stage}]`, payload);
};
const formatRelativeTime = ts => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
};

const LedgerScreen = ({navigation}) => {
  const {colors, isDark} = useTheme();
  const {showAlert} = useAppAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const themedAlert = useCallback(
    (title, message, actions) => {
      const safeActions =
        Array.isArray(actions) && actions.length
          ? actions.map(action => ({
              text: String(action?.text || 'OK'),
              style: action?.style || 'default',
              onPress: action?.onPress,
            }))
          : [{text: 'OK'}];
      showAlert({
        title: String(title || ''),
        message: String(message || ''),
        actions: safeActions,
      });
    },
    [showAlert],
  );
  const screenMountedAtRef = useRef(perfNow());
  const {showToast} = useToast();
  const currencySymbol = useCurrencySymbol();
  const chatStoreState = useChatStore();
  const ledgerPerfLog = () => {};
  const logLedgerPerf = useCallback((event, payload = {}) => {
    perfLog('ledger-screen', event, payload);
  }, []);
  const [contacts, setContacts] = useState([]);
  const [contactsHydrated, setContactsHydrated] = useState(false);
  const [contactBalances, setContactBalances] = useState({});
  const [overallBalance, setOverallBalance] = useState({
    totalPaid: 0,
    totalGet: 0,
    netBalance: 0,
  });
  const [latestTransactionDates, setLatestTransactionDates] = useState({});
  const hasStartupBalancesRefreshRun = useRef(false);

  // For context menu
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [pinnedContactIds, setPinnedContactIds] = useState([]);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(300)).current;

  // For rename modal
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameContact, setRenameContact] = useState(null);
  const [originalContactName, setOriginalContactName] = useState('');
  const [showSetupRequiredPopup, setShowSetupRequiredPopup] = useState(false);
  const [setupPopupUser, setSetupPopupUser] = useState({});
  const [contactPhotoURLs, setContactPhotoURLs] = useState({});
  const [contactCachedNames, setContactCachedNames] = useState({});
  const [contactLastActivity, setContactLastActivity] = useState({});

  useEffect(() => {
    logLedgerPerf('screen-mounted');
    return () => {
      logLedgerPerf('screen-unmounted', {
        aliveMs: Math.max(0, perfNow() - screenMountedAtRef.current),
      });
    };
  }, [logLedgerPerf]);

  const normalizeValidContactName = useCallback((value) => {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    if (PLACEHOLDER_CONTACT_NAMES.has(raw.toLowerCase())) {
      return '';
    }
    return raw;
  }, []);

  const normalizeStoredContact = useCallback((contact = {}) => {
    const canonicalIdentity = normalizeLedgerContactIdentity(contact);
    const displayName = normalizeValidContactName(contact.displayName);
    const addedAt = Math.max(0, Number(contact.addedAt) || 0);
    const lastChatActivityAt = Math.max(0, Number(contact.lastChatActivityAt) || 0);

    return {
      ...contact,
      recordID: canonicalIdentity.recordID || String(contact.recordID || '').trim(),
      displayName,
      isAppUser: canonicalIdentity.isAppUser,
      userId: canonicalIdentity.userId,
      username: canonicalIdentity.username,
      appInstallState: canonicalIdentity.appInstallState,
      addedAt,
      lastChatActivityAt,
    };
  }, [normalizeValidContactName]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ledger:addContact', (contact) => {
      handleAddContact(contact);
    });
    return () => {
      sub.remove();
    };
  }, [handleAddContact]);


  useEffect(() => {
    const loadStoredData = async () => {
      const perf = createPerfTimer('ledger-screen', 'load-stored-data');
      try {
        ensureLedgerFeatureDatabasesReady();
        const stored = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
        let storedContacts = [];
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            storedContacts = parsed;
          }
        }
        const normalizedStoredContacts = storedContacts.map(contact =>
          normalizeStoredContact(contact),
        );

        // Fetch Names for reconciled contacts
        const contactsWithNames = await Promise.all(
          normalizedStoredContacts.map(async contact => {
            const savedNameRaw = await getContactName(contact.recordID);
            const savedName = normalizeValidContactName(savedNameRaw);
            if (savedName) {
              return {...contact, savedName};
            }
            const deviceName = normalizeValidContactName(getContactNameFromDevice(contact));
            if (deviceName) {
              await setContactName(contact.recordID, deviceName);
              return {...contact, savedName: deviceName};
            }
            if (savedNameRaw && !savedName) {
              await deleteContactName(contact.recordID);
            }
            return {...contact, savedName: null};
          }),
        );
        setContacts(contactsWithNames);
        const storedPinned = await AsyncStorage.getItem(PINNED_CONTACT_IDS_STORAGE_KEY);
        if (storedPinned) {
          const parsedPinned = JSON.parse(storedPinned);
          if (Array.isArray(parsedPinned)) {
            const reconciledIds = new Set(
              contactsWithNames.map(contact => String(contact.recordID)),
            );
            setPinnedContactIds(
              parsedPinned.filter(id => reconciledIds.has(String(id))),
            );
          } else {
            setPinnedContactIds([]);
          }
        }
        perf.end({
          contactsCount: contactsWithNames.length,
        });
      } catch (error) {
        console.error('Failed to load stored data:', error);
        perf.fail(error);
      } finally {
        setContactsHydrated(true);
      }
    };
    loadStoredData();
  }, [normalizeStoredContact, normalizeValidContactName]);




  const getContactDisplayName = useCallback(async (contact) => {
    const savedName = await getContactName(contact.recordID);
    if (savedName) {
        return savedName;
    }
    const fullName = [contact.givenName, contact.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || contact.displayName || 'Unnamed Contact';
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      const perf = createPerfTimer('ledger-screen', 'focus-load-balances');
      try {
        await loadBalances();
        perf.end();
      } catch (error) {
        perf.fail(error);
      }
    });
    return unsubscribe;
  }, [navigation, contacts, getContactDisplayName, chatStoreState.version]);

  const loadBalances = useCallback(async (contactsOverride) => {
    const perf = createPerfTimer('ledger-screen', 'load-balances');
    try {
      const baseContacts = contactsOverride || contacts;
      const balances = getAllContactBalances();
      setContactBalances(balances);
      const stats = getLedgerStatistics();
      setOverallBalance(stats);
      const latestDates = getLatestTransactionDateByContact();
      setLatestTransactionDates(latestDates);
    
      // Fetch Names for current contacts to ensure display names are updated
      const contactsWithUpdatedNames = await Promise.all(
        baseContacts.map(async (contact) => {
          const savedName = await getContactName(contact.recordID);
          return { ...contact, savedName: savedName || null };
        })
      );
      setContacts(current =>
        sortContactsByPinned(contactsWithUpdatedNames, pinnedContactIds, latestDates)
      );
      perf.end({
        contactsCount: contactsWithUpdatedNames.length,
        balancesCount: Object.keys(balances || {}).length,
      });
    } catch (error) {
      perf.fail(error);
      throw error;
    }
  }, [contacts, pinnedContactIds]); // Add contacts to dependencies

  useEffect(() => {
    if (!contactsHydrated) {
      return;
    }
    if (!navigation?.isFocused?.()) {
      return;
    }
    if (hasStartupBalancesRefreshRun.current) {
      return;
    }

    hasStartupBalancesRefreshRun.current = true;
    loadBalances(contacts).catch(error => {
      hasStartupBalancesRefreshRun.current = false;
      console.error('Failed to refresh startup ledger balances:', error);
    });
  }, [contactsHydrated, contacts, navigation, loadBalances]);


  useEffect(() => {
    const persistContacts = async () => {
      try {
        const payload = contacts.map(contact => {
          const phone = contact.phoneNumbers?.find(item =>
            String(item.number || '').trim()
          )?.number;
          return {
            recordID: contact.recordID,
            displayName: contact.displayName || '',
            givenName: contact.givenName || '',
            familyName: contact.familyName || '',
            phoneNumbers: phone ? [{number: phone}] : [],
            isAppUser:
              contact.isAppUser === true || Number(contact.isAppUser) === 1 ? 1 : 0,
            userId: String(contact.userId || '').trim(),
            username: String(contact.username || '').trim(),
            appInstallState: normalizeInstallState(contact.appInstallState),
            addedAt: Math.max(0, Number(contact.addedAt) || 0),
            lastChatActivityAt: Math.max(0, Number(contact.lastChatActivityAt) || 0),
            // Do not persist savedName, it's stored in DB
          };
        });
        await AsyncStorage.setItem(
          CONTACTS_STORAGE_KEY,
          JSON.stringify(payload)
        );
        queueBackupFromStorage();
      } catch (error) {
        console.error('Failed to store contacts:', error);
      }
    };
    if (contactsHydrated) {
      persistContacts();
    }
  }, [contacts, contactsHydrated]);

  useEffect(() => {
    // Persist pinned IDs
    const persistPinnedIds = async () => {
      try {
        await AsyncStorage.setItem(PINNED_CONTACT_IDS_STORAGE_KEY, JSON.stringify(pinnedContactIds));
        queueBackupFromStorage();
      } catch (error) {
        console.error('Failed to save pinned contact IDs:', error);
      }
    };
    if (contactsHydrated) { // Only persist once contacts are loaded to avoid overwriting initial state
      persistPinnedIds();
      // Also resort contacts whenever pinnedContactIds change
      setContacts(current =>
        sortContactsByPinned(current, pinnedContactIds, latestTransactionDates)
      );
    }
  }, [pinnedContactIds, contactsHydrated, latestTransactionDates]);




  const getContactNameFromDevice = contact => {
    const fullName = [contact.givenName, contact.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || contact.displayName || 'Unnamed Contact';
  };











  const handleAddContact = async contact => {
    logLedgerScreenDiag('ADD_CONTACT_EVENT', {
      incomingRecordId: String(contact?.recordID || '').trim(),
      incomingUserId: String(
        contact?.userId || contact?.firebaseUid || contact?.appUser?.firebaseUid || '',
      ).trim(),
      incomingInstallState: String(contact?.appInstallState || '').trim().toLowerCase(),
      incomingIsAppUser: Number(contact?.isAppUser || 0),
    });
    const canonicalIdentity = normalizeLedgerContactIdentity(contact);
    const rawIncomingUserId = canonicalIdentity.userId;
    const canonicalRecordId =
      canonicalIdentity.recordID || String(contact?.recordID || '').trim();
    const normalizedContact = {
      ...contact,
      recordID: canonicalRecordId || String(contact?.recordID || ''),
      userId: rawIncomingUserId,
      appInstallState: normalizeInstallState(contact?.appInstallState),
      orderNeutralUpdate: contact?.orderNeutralUpdate === true,
      isAppUser: canonicalIdentity.isAppUser,
    };

    const existingNameRaw = await getContactName(normalizedContact.recordID);
    const existingName = normalizeValidContactName(existingNameRaw);
    const incomingName = normalizeValidContactName(getContactNameFromDevice(normalizedContact));
    const displayName = existingName || incomingName || null;

    if (incomingName && (!existingName || (existingNameRaw && !existingName))) {
      await setContactName(normalizedContact.recordID, displayName);
    }

    const contactAddedAt = Math.max(0, Number(normalizedContact?.addedAt) || Date.now());
    const contactWithName = {
      ...normalizedContact,
      savedName: displayName || null,
      addedAt: contactAddedAt,
      lastChatActivityAt: Math.max(0, Number(normalizedContact?.lastChatActivityAt) || 0),
    };

    let nextContacts = null;
    let persistedContact = contactWithName;
    setContacts(prev => {
      const incomingId = String(normalizedContact.recordID);
      const incomingUserId = String(normalizedContact.userId || '').trim();
      const existingIndex = prev.findIndex(item => {
        const byRecord = String(item.recordID) === incomingId;
        if (byRecord) {
          return true;
        }
        if (!incomingUserId) {
          return false;
        }
        return String(item.userId || '').trim() === incomingUserId;
      });
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const existingAddedAt = Math.max(0, Number(existing?.addedAt) || 0);
        const incomingAddedAt = Math.max(0, Number(normalizedContact?.addedAt) || 0);
        const merged = {
          ...existing,
          ...normalizedContact,
          savedName: normalizeValidContactName(existing.savedName) || displayName || null,
          addedAt: normalizedContact.orderNeutralUpdate
            ? existingAddedAt || incomingAddedAt
            : Math.max(0, existingAddedAt, incomingAddedAt),
          lastChatActivityAt: Math.max(
            0,
            Number(existing?.lastChatActivityAt) || 0,
            Number(normalizedContact?.lastChatActivityAt) || 0,
          ),
          userId: String(existing.userId || normalizedContact.userId || '').trim(),
          username: String(existing.username || normalizedContact.username || '').trim(),
          appInstallState: mergeInstallState({
            previousState: existing.appInstallState,
            nextState: normalizedContact.appInstallState,
            allowInstalledRecovery: normalizedContact.orderNeutralUpdate !== true,
          }),
        };
        const mergedIdentity = normalizeLedgerContactIdentity(merged, {
          previousInstallState: existing.appInstallState,
          allowInstalledRecovery: normalizedContact.orderNeutralUpdate !== true,
        });
        merged.isAppUser = mergedIdentity.isAppUser;
        merged.userId = mergedIdentity.userId;
        merged.appInstallState = mergedIdentity.appInstallState;
        persistedContact = merged;
        logLedgerScreenDiag('MERGE_EXISTING', {
          recordId: String(merged?.recordID || '').trim(),
          userId: String(merged?.userId || '').trim(),
          appInstallState: String(merged?.appInstallState || '').trim().toLowerCase(),
          isAppUser: Number(merged?.isAppUser || 0),
        });
        const next = [...prev];
        next[existingIndex] = merged;
        const sorted = sortContactsByPinned(next, pinnedContactIds, latestTransactionDates);
        nextContacts = sorted;
        return sorted;
      }
      persistedContact = contactWithName;
      logLedgerScreenDiag('MERGE_NEW', {
        recordId: String(contactWithName?.recordID || '').trim(),
        userId: String(contactWithName?.userId || '').trim(),
        appInstallState: String(contactWithName?.appInstallState || '').trim().toLowerCase(),
        isAppUser: Number(contactWithName?.isAppUser || 0),
      });
      const next = [...prev, contactWithName];
      const sorted = sortContactsByPinned(next, pinnedContactIds, latestTransactionDates);
      nextContacts = sorted;
      return sorted;
    });

    // Persist immediately so contact survives refresh
    try {
      const phone = normalizedContact.phoneNumbers?.find(item =>
        String(item.number || '').trim()
      )?.number;
      const payload = {
        recordID: persistedContact.recordID,
        displayName: normalizeValidContactName(persistedContact.displayName),
        givenName: persistedContact.givenName || '',
        familyName: persistedContact.familyName || '',
        phoneNumbers: phone ? [{number: phone}] : [],
        isAppUser:
          persistedContact.isAppUser === true || Number(persistedContact.isAppUser) === 1
            ? 1
            : 0,
        userId: String(persistedContact.userId || '').trim(),
        username: String(persistedContact.username || '').trim(),
        appInstallState: normalizeInstallState(persistedContact.appInstallState),
        addedAt: Math.max(0, Number(persistedContact?.addedAt) || 0),
        lastChatActivityAt: Math.max(0, Number(persistedContact?.lastChatActivityAt) || 0),
      };
      const existingRaw = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const nextStored = Array.isArray(existing)
        ? existing
            .filter(item => {
              if (String(item.recordID) === String(normalizedContact.recordID)) {
                return false;
              }
              if (String(normalizedContact.userId || '').trim()) {
                return (
                  String(item.userId || '').trim() !== String(normalizedContact.userId || '').trim()
                );
              }
              return true;
            })
            .concat(payload)
        : [payload];
      await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(nextStored));
      queueBackupFromStorage();
      logLedgerScreenDiag('PERSISTED_CONTACT', {
        recordId: String(payload?.recordID || '').trim(),
        userId: String(payload?.userId || '').trim(),
        appInstallState: String(payload?.appInstallState || '').trim().toLowerCase(),
        isAppUser: Number(payload?.isAppUser || 0),
      });
    } catch (error) {
      console.error('Failed to persist added contact:', error);
    }

    await loadBalances(nextContacts || contacts);
    if (!normalizedContact?.silent) {
      showToast('Contact added successfully', 'success');
    }
  };

  useEffect(() => {
    const photoMap = {};
    const nameMap = {};
    contacts.forEach(c => {
      const isApp =
        deriveIsAppUser({
          userId: c.userId || c.firebaseUid,
          appInstallState: c.appInstallState,
        }) === 1;
      const installed = normalizeInstallState(c.appInstallState) === 'installed';
      if (isApp && installed && c.userId) {
        const cached = getCachedUser(c.userId);
        if (cached?.photo_url) {
          photoMap[c.recordID] = cached.photo_url;
        }
        if (cached?.display_name) {
          nameMap[c.recordID] = cached.display_name;
        }
      }
    });
    setContactPhotoURLs(photoMap);
    setContactCachedNames(nameMap);

    // Load last activity (chat msg + ledger entry) per contact
    try {
      const chatMap = getLatestMessagePerUser();   // { userId: { text, timestamp } }
      const ledgerMap = getLatestTransactionByContact(); // { recordId: { amount, type, note, timestamp } }
      const activityMap = {};
      contacts.forEach(c => {
        const chatEntry = c.userId ? chatMap[c.userId] : null;
        const ledgerEntry = ledgerMap[c.recordID];
        const chatTs = chatEntry?.timestamp || 0;
        const ledgerTs = ledgerEntry?.timestamp || 0;
        if (!chatEntry && !ledgerEntry) return;
        if (chatEntry && ledgerEntry) {
          // Dono hain — jo latest ho woh dikhao
          if (chatTs >= ledgerTs) {
            activityMap[c.recordID] = { kind: 'chat', text: chatEntry.text, timestamp: chatTs };
          } else {
            activityMap[c.recordID] = { kind: 'ledger', ...ledgerEntry };
          }
        } else if (chatEntry) {
          activityMap[c.recordID] = { kind: 'chat', text: chatEntry.text, timestamp: chatTs };
        } else if (ledgerEntry) {
          activityMap[c.recordID] = { kind: 'ledger', ...ledgerEntry };
        }
      });
      setContactLastActivity(activityMap);
    } catch (_) {}
  }, [contacts]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ledger:chatActivity', payload => {
      const activityAt = Math.max(0, Number(payload?.timestamp) || Date.now());
      const eventRecordId = String(payload?.contactRecordId || '').trim();
      const eventUserId = String(payload?.userId || '').trim();
      if (!eventRecordId && !eventUserId) {
        return;
      }

      setContacts(prev => {
        if (!Array.isArray(prev) || prev.length === 0) {
          return prev;
        }

        const idx = prev.findIndex(item => {
          if (eventRecordId && String(item?.recordID || '') === eventRecordId) {
            return true;
          }
          if (eventUserId && String(item?.userId || '').trim() === eventUserId) {
            return true;
          }
          return false;
        });

        if (idx < 0) {
          return prev;
        }

        const current = prev[idx];
        const nextChatAt = Math.max(0, Number(current?.lastChatActivityAt) || 0, activityAt);
        if (nextChatAt === Number(current?.lastChatActivityAt || 0)) {
          return prev;
        }

        const next = [...prev];
        next[idx] = {
          ...current,
          lastChatActivityAt: nextChatAt,
          addedAt: Math.max(0, Number(current?.addedAt) || 0),
        };

        return sortContactsByPinned(next, pinnedContactIds, latestTransactionDates);
      });
    });

    return () => {
      sub.remove();
    };
  }, [pinnedContactIds, latestTransactionDates]);

  const formatCurrency = amount => {
    return `${currencySymbol}${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const formatSignedBalance = amount => {
    if (amount < 0) {
      return `- ${formatCurrency(amount)}`;
    }
    return formatCurrency(amount);
  };

  const netOutstandingLabel = getLedgerNetOutstandingLabel(overallBalance.netBalance);

  const getPeerUserIdFromContact = contact => {
    return derivePeerUserId(contact);
  };

  const preloadContactChatIdentity = async contact => {
    try {
      const peerUserId = getPeerUserIdFromContact(contact);
      if (!peerUserId) {
        return;
      }
      const currentUserId = await AsyncStorage.getItem('firebaseUid');
      if (!currentUserId) {
        return;
      }

      const userPayload = {
        userId: peerUserId,
        firebaseUid: peerUserId,
        displayName: contact.displayName || contact.savedName || 'Contact',
      };
      const convId = createConversation(peerUserId, userPayload, currentUserId);
      // Warm local chat read so detail screen can render timeline immediately.
      getMessages(convId, 50, 0);

      const cachePayload = JSON.stringify({
        userId: peerUserId,
        firebaseUid: peerUserId,
        displayName: userPayload.displayName,
        conversationId: convId,
      });
      const cacheKeys = [String(contact.recordID || '').trim(), `app_${peerUserId}`]
        .filter(Boolean)
        .map(recordId => `${LEDGER_CHAT_CACHE_PREFIX}${recordId}`);
      if (cacheKeys.length) {
        await AsyncStorage.multiSet(cacheKeys.map(key => [key, cachePayload]));
      }
    } catch (error) {
      console.error('Failed to preload chat identity for contact:', error);
    }
  };

  const deleteContactChatData = async contact => {
    try {
      const peerUserId = getPeerUserIdFromContact(contact);
      const deletedConversationIds = new Set();

      if (peerUserId) {
        const byPeer = deleteConversationsByOtherUserId(peerUserId);
        (byPeer?.deletedConversations || []).forEach(id => deletedConversationIds.add(String(id)));
      }

      const recordId = String(contact?.recordID || '').trim();
      const cacheKeysToDelete = [];
      if (recordId) {
        const cacheKey = `${LEDGER_CHAT_CACHE_PREFIX}${recordId}`;
        cacheKeysToDelete.push(cacheKey);
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            const cacheConvId = String(cached?.conversationId || '').trim();
            if (cacheConvId) {
              deletedConversationIds.add(cacheConvId);
            }
            const cacheUserId = String(cached?.userId || cached?.firebaseUid || '').trim();
            if (cacheUserId) {
              cacheKeysToDelete.push(`${LEDGER_CHAT_CACHE_PREFIX}app_${cacheUserId}`);
            }
          } catch {
            // Ignore malformed cache entry.
          }
        }
      }
      if (peerUserId) {
        cacheKeysToDelete.push(`${LEDGER_CHAT_CACHE_PREFIX}app_${peerUserId}`);
      }

      deletedConversationIds.forEach(convId => {
        deleteConversationCascade(convId);
      });

      if (cacheKeysToDelete.length) {
        await AsyncStorage.multiRemove(Array.from(new Set(cacheKeysToDelete)));
      }
    } catch (error) {
      console.error('Failed to delete chat data for contact:', error);
      throw error;
    }
  };

  const getActivityTimestampForContact = (contact, latestDates = {}) => {
    const recordId = String(contact?.recordID || '');
    const transactionAt = Math.max(0, Number(latestDates?.[recordId]) || 0);
    const chatAt = Math.max(0, Number(contact?.lastChatActivityAt) || 0);
    const addedAt = Math.max(0, Number(contact?.addedAt) || 0);
    return Math.max(transactionAt, chatAt, addedAt);
  };

  // Helper function for sorting contacts by pinned status
  const sortContactsByPinned = (contactsList, pinnedIds, latestDates = {}) => {
    if (!contactsList || contactsList.length === 0) {
      return [];
    }
    const pinnedOrder = new Map();
    pinnedIds.forEach((id, index) => {
      pinnedOrder.set(id, index);
    });

    const pinned = contactsList.filter(contact => pinnedOrder.has(contact.recordID));
    const unpinned = contactsList.filter(contact => !pinnedOrder.has(contact.recordID));

    pinned.sort((a, b) => pinnedOrder.get(a.recordID) - pinnedOrder.get(b.recordID));
    // Sort unpinned contacts by most recent activity (chat/transaction/new-add), newest first.
    unpinned.sort((a, b) => {
        const dateA = getActivityTimestampForContact(a, latestDates);
        const dateB = getActivityTimestampForContact(b, latestDates);
        if (dateB !== dateA) {
          return dateB - dateA;
        }
        const nameA = String(a?.savedName || a?.displayName || '').toLowerCase();
        const nameB = String(b?.savedName || b?.displayName || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return [...pinned, ...unpinned];
  };

  const openContextMenu = async (contact) => {
    setSelectedContact(contact);
    setOriginalContactName(await getContactDisplayName(contact)); // Store original name for context menu header
    setContextMenuVisible(true);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(contentTranslateY, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeContextMenu = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setContextMenuVisible(false);
      setSelectedContact(null);
      setOriginalContactName('');
    });
  };

  const handleDeleteContact = () => {
    if (!selectedContact) {
      return;
    }
    themedAlert(
      'Delete Contact',
      `Are you sure you want to delete ${selectedContact.savedName || getContactNameFromDevice(selectedContact)} and all its transactions? This action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove from pinned list if present
              setPinnedContactIds(prev => prev.filter(id => id !== selectedContact.recordID));
              // Delete from database
              await deleteContactAndTransactions(selectedContact.recordID);
              await deleteContactChatData(selectedContact);
              // Remove from local contacts state
              const nextContacts = contacts.filter(
                c => c.recordID !== selectedContact.recordID
              );
              setContacts(nextContacts);
              await loadBalances(nextContacts); // Refresh balances and stats, await it
              closeContextMenu();
              showToast('Contact, transactions, and chat deleted.', 'success');
            } catch (error) {
              console.error('Failed to delete contact:', error);
              themedAlert('Error', 'Failed to delete contact, transactions, and chat.');
            }
          },
        },
      ]
    );
  };

  const openRenameModal = async () => {
    if (!selectedContact) {
      return;
    }
    setRenameContact(selectedContact);
    const currentName = await getContactName(selectedContact.recordID);
    setNewName(currentName || getContactNameFromDevice(selectedContact));
    setRenameModalVisible(true);
    closeContextMenu(); // Close context menu when rename modal opens
  };

  const closeRenameModal = () => {
    setRenameModalVisible(false);
    setNewName('');
    setRenameContact(null);
  };

  const handleSaveName = async () => {
    if (!renameContact || !newName.trim()) {
      themedAlert('Invalid Name', 'Name cannot be empty.');
      return;
    }
    try {
      await setContactName(renameContact.recordID, newName.trim());
      // Update the savedName in the local contacts state
      setContacts(prev => prev.map(c => 
        c.recordID === renameContact.recordID ? { ...c, savedName: newName.trim() } : c
      ));
      await loadBalances(); // Refresh balances and stats
      closeRenameModal();
      themedAlert('Success', 'Contact renamed successfully.');
    } catch (error) {
      console.error('Failed to save name:', error);
      themedAlert('Error', 'Failed to save name.');
    }
  };

  const togglePinContact = () => {
    if (!selectedContact) {
      return;
    }
    const isPinned = pinnedContactIds.includes(selectedContact.recordID);
    setPinnedContactIds(prev => {
      if (isPinned) {
        return prev.filter(id => id !== selectedContact.recordID);
      } else {
        return [selectedContact.recordID, ...prev];
      }
    });
    closeContextMenu();
  };


  const renderContact = ({item, index}) => {
    const unreadCount = getUnreadCountForOtherUserId(item?.userId);
    const balance = contactBalances[item.recordID] || {netBalance: 0};

    return (
      <LedgerContactRow
        item={item}
        isLast={index === contacts.length - 1}
        styles={styles}
        colors={colors}
        photoUri={contactPhotoURLs[item.recordID]}
        cachedApiName={String(contactCachedNames[item.recordID] || '').trim()}
        lastActivity={contactLastActivity[item.recordID]}
        unreadCount={unreadCount}
        balance={balance}
        isPinned={pinnedContactIds.includes(item.recordID)}
        formatCurrency={formatCurrency}
        formatRelativeTime={formatRelativeTime}
        onPress={async () => {
          preloadContactChatIdentity(item).catch(preloadError => {
            console.error(
              'Failed to preload contact chat identity before navigation:',
              preloadError,
            );
          });
          const tapAt = Date.now();
          const perfTraceId = `${String(item?.recordID || 'unknown')}:${tapAt}`;
          ledgerPerfLog('ledger-list:contact-tap', {
            contactId: String(item?.recordID || ''),
            perfTraceId,
            tapAt,
          });
          let navigationContact = item;
          try {
            const resolvedContact = await resolveInitialContactIdentity({
              contact: item,
              recordID: String(item?.recordID || '').trim(),
              userId: String(item?.userId || item?.firebaseUid || '').trim(),
            });
            if (resolvedContact && typeof resolvedContact === 'object') {
              navigationContact = resolvedContact;
            }
          } catch (identityError) {
            console.error('Failed to bootstrap ledger contact before navigation:', identityError);
          }
          navigation.navigate('LedgerContactDetail', {
            contact: navigationContact,
            perfTraceId,
            tapAt,
          });
          ledgerPerfLog('ledger-list:navigate-called', {
            contactId: String(item?.recordID || ''),
            perfTraceId,
            calledAt: Date.now(),
          });
        }}
        onLongPress={() => openContextMenu(item)}
      />
    );
  };

  const getLatestLocalUser = async () => {
    try {
      const parsed = await readCachedSessionUser();
      if (Object.keys(parsed || {}).length === 0) {
        return {};
      }
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.error('Failed to read user for ledger add-contact gate:', error);
      return {};
    }
  };

  const isProfileReadyForAddContact = userData => {
    const username = String(userData?.username || '').trim();
    const phone = String(userData?.phoneNumber || userData?.mobile || '').trim();
    const country = String(userData?.country || '').trim();
    return Boolean(username) && Boolean(phone) && Boolean(country);
  };

  const handleAddContactFabPress = async () => {
    const userData = await getLatestLocalUser();
    if (isProfileReadyForAddContact(userData)) {
      navigation.navigate('LedgerAddContact');
      return;
    }
    setSetupPopupUser(userData);
    setShowSetupRequiredPopup(true);
  };

  const handleOpenProfileSetupFromPopup = () => {
    setShowSetupRequiredPopup(false);
    navigation.navigate('ProfileSetup', {
      user: setupPopupUser || {},
    });
  };

  const renderLedgerListHeader = useCallback(
    () => (
      <View style={styles.listHeaderSection}>
        <Text style={styles.sectionTitle}>Contacts</Text>
      </View>
    ),
    [styles],
  );

  const renderLedgerListEmpty = useCallback(() => {
    if (!contactsHydrated) {
      return (
        <View style={styles.listEmptySection}>
          <View style={styles.loadingContainer}>
            {[0, 1, 2].map(item => (
              <View
                key={`ledger-loading-${item}`}
                style={[
                  styles.loadingRow,
                  item === 2 ? styles.loadingRowLast : null,
                ]}>
                <View style={styles.loadingAvatar} />
                <View style={styles.loadingContent}>
                  <View style={styles.loadingLinePrimary} />
                  <View style={styles.loadingLineSecondary} />
                </View>
              </View>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.listEmptySection}>
        <View style={styles.emptyContainer}>
          <Icon name="people-outline" size={48} color={colors.text.light} />
          <Text style={styles.emptyText}>No contacts in ledger</Text>
          <Text style={styles.emptySubtext}>Tap the add button to get started</Text>
        </View>
      </View>
    );
  }, [contactsHydrated, colors.text.light, styles]);

  return (
    <View style={styles.container}>
      <LedgerSummaryHeader
        styles={styles}
        isDark={isDark}
        overallBalance={overallBalance}
        formatCurrency={formatCurrency}
        formatSignedBalance={formatSignedBalance}
        netOutstandingLabel={netOutstandingLabel}
      />
      
      <View style={styles.listArea}>
        <FlatList
          style={styles.contactsListWrapper}
          contentContainerStyle={styles.contactsListContentContainer}
          data={contactsHydrated ? contacts : []}
          keyExtractor={item => String(item.recordID)}
          renderItem={renderContact}
          extraData={[contactPhotoURLs, contactCachedNames, contactLastActivity]}
          ListHeaderComponent={renderLedgerListHeader}
          ListEmptyComponent={renderLedgerListEmpty}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      </View>


      <TapEffect
        onPress={handleAddContactFabPress}
        style={styles.fab}>
        <Icon name="person-add" size={22} color={colors.white} />
      </TapEffect>

      <SetupRequirePopup
        visible={showSetupRequiredPopup}
        title="Complete your basic details"
        description="You must complete your profile setup to use ledger system"
        primaryText="Update Profile Setup"
        secondaryText="Remind me later"
        navigation={navigation}
        user={setupPopupUser}
        targetScreen="ProfileSetup"
        onPrimaryPress={handleOpenProfileSetupFromPopup}
        onSecondaryPress={() => setShowSetupRequiredPopup(false)}
        onClose={() => setShowSetupRequiredPopup(false)}
      />

      {/* Context Menu Modal */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="none"
        onRequestClose={closeContextMenu}>
        <Animated.View
          style={[
            styles.contextMenuOverlay,
            {opacity: overlayOpacity},
          ]}>
          <TouchableOpacity
            style={styles.contextMenuOverlayTouchable}
            activeOpacity={1}
            onPress={closeContextMenu}
          />
          <Animated.View
            style={[
              styles.contextMenuContainer,
              {transform: [{translateY: contentTranslateY}]},
            ]}>
            <View style={styles.contextMenuHeader}>
              <Text style={styles.contextMenuTitle}>
                {originalContactName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={togglePinContact}>
              <MaterialIcon
                name="push-pin"
                size={22}
                color={colors.text.primary}
              />
              <Text style={styles.contextMenuItemText}>
                {pinnedContactIds.includes(selectedContact?.recordID)
                  ? 'Unpin from Top'
                  : 'Pin to Top'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={openRenameModal}>
              <Icon name="create-outline" size={22} color={colors.text.primary} />
              <Text style={styles.contextMenuItemText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={handleDeleteContact}>
              <Icon name="trash-outline" size={22} color="#EF4444" />
              <Text style={[styles.contextMenuItemText, {color: '#EF4444'}]}>
                Delete
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contextMenuItem, styles.contextMenuItemCancel]}
              onPress={closeContextMenu}>
              <Icon name="close" size={22} color={colors.text.secondary} />
              <Text style={styles.contextMenuItemTextCancel}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Rename Contact Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRenameModal}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeRenameModal}
          />
          <View style={styles.renameModalContainer}>
            <Text style={styles.renameModalTitle}>Rename Contact</Text>
            <Text style={styles.renameModalLabel}>Name</Text>
            <TextInput
              style={styles.renameModalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter new name"
              placeholderTextColor={colors.text.light}
              autoFocus
            />
            <View style={styles.renameModalButtons}>
              <TouchableOpacity
                style={[styles.renameModalButton, styles.renameModalCancelButton]}
                onPress={closeRenameModal}>
                <Text style={styles.renameModalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameModalButton, styles.renameModalSaveButton]}
                onPress={handleSaveName}>
                <Text style={styles.renameModalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createCardBase = colors => ({
  backgroundColor: colors.card,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.border,
  elevation: 1,
  shadowColor: colors.shadow,
  shadowOffset: {width: 0, height: 1},
  shadowOpacity: 0.05,
  shadowRadius: 2,
});

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBlock: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    elevation: 2,
  },
  headerRow: {
    height: 0,
    marginBottom: 0,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  metricLabelRow: {
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: fontWeight.bold,
  },
  metricLabelDark: {
    color: colors.text.secondary,
  },
  metricValue: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
  },
  metricPositive: {
    color: '#10B981',
  },
  metricNegative: {
    color: '#EF4444',
  },
  listArea: {
    flex: 1,
    padding: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
  },
  listHeaderSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 8,
  },
  listEmptySection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  contactsListWrapper: {
    ...createCardBase(colors),
    flex: 1,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  contactsListContentContainer: {
    paddingBottom: spacing.xl + 88,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  contactItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastContactItem: {
    borderBottomWidth: 0,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 2,
  },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactAvatarAppUser: {
    backgroundColor: colors.success,
  },
  contactAvatarPhoto: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  contactAvatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  contactAvatarText: {
    color: colors.white,
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
  },
  pinnedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.primary, // Or any distinct color for pinned
    borderRadius: 8,
    padding: 2,
  },
  contactDetails: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: 4,
  },
  contactNameNoMargin: {
    marginBottom: 1,
  },
  contactPhone: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  balanceInfo: {
    alignItems: 'flex-end',
  },
  chatUnreadBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    minWidth: 20,
    paddingHorizontal: 5,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  chatUnreadBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    marginBottom: 4,
  },
  balanceText: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
  },
  usernameInline: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.text.secondary,
    marginBottom: 4,
    textTransform: 'capitalize',
    opacity: 0.6,
  },
  lastActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  lastActivityText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
    marginTop: 2,
  },
  lastActivityTime: {
    fontSize: 11,
    color: colors.text.secondary,
    opacity: 0.7,
  },
  balance_positive: {
    color: '#10B981',
  },
  balance_negative: {
    color: '#EF4444',
  },
  balance_neutral: {
    color: colors.text.secondary,
  },
  loadingContainer: {
    ...createCardBase(colors),
    overflow: 'hidden',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  loadingRowLast: {
    borderBottomWidth: 0,
  },
  loadingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  loadingContent: {
    flex: 1,
    gap: 8,
  },
  loadingLinePrimary: {
    width: '62%',
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
  },
  loadingLineSecondary: {
    width: '40%',
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
  },
  emptyContainer: {
    ...createCardBase(colors),
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  fabPressed: {
    transform: [{scale: 0.98}],
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(15, 118, 110, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  // Context Menu Styles (from Dashboard)
  contextMenuOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  contextMenuOverlayTouchable: {
    flex: 1,
  },
  contextMenuContainer: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.lg,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  contextMenuHeader: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contextMenuTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 12,
  },
  contextMenuItemText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
  contextMenuItemCancel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  contextMenuItemTextCancel: {
    fontSize: fontSize.regular,
    color: colors.text.secondary,
    fontWeight: fontWeight.medium,
  },

  // Rename Modal Styles
  renameModalContainer: {
    backgroundColor: colors.modal,
    borderRadius: 12,
    padding: spacing.lg,
    margin: spacing.md,
    alignSelf: 'center',
    width: '90%',
    maxWidth: 400,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  renameModalTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  renameModalLabel: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  renameModalInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 8,
    fontSize: fontSize.regular,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  renameModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  renameModalButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameModalCancelButton: {
    backgroundColor: colors.surfaceMuted,
  },
  renameModalSaveButton: {
    backgroundColor: colors.primary,
  },
  renameModalButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  // Overriding button text color for cancel
  renameModalCancelButton: {
    backgroundColor: colors.surfaceMuted,
  },
  renameModalButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  renameModalCancelButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },

  // Modal contact picker styles - prefixed to avoid conflicts
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay, // Darken background for all modals
    justifyContent: 'flex-end', // Align contact picker modal to bottom
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default LedgerScreen;





