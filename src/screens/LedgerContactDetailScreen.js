import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Animated,
  Keyboard,
  ActivityIndicator,
  DeviceEventEmitter,
  AppState,
  BackHandler,
  InteractionManager,
  Dimensions,
  Easing,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import {AvoidSoftInput} from 'react-native-avoid-softinput';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import DropdownPopup from '../components/ui/popups/DropdownPopup';
import TapEffect from '../components/ui/TapEffect';
import ChatComposer from '../components/ledger/ChatComposer';
import LedgerMessageBubble from '../components/ledger/LedgerMessageBubble';
import {
  deletedUiStyles,
  getDeletedIconColor,
  getDeletedTapEffectProps,
  withDeletedStyle,
  renderDeletedBadge,
  renderDeletedNote,
} from '../components/ui/deleteui';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import {useToast} from '../hooks/useToast';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import TexturedSurface from '../components/TexturedSurface';
import EditRemarkModalSheet from '../components/EditRemarkModalSheet';
import EditAmountModal from '../components/ui/editamount';
import LedgerBottomActions from '../components/ledger/LedgerBottomActions';
import LedgerConversationTimeline from '../components/ledger/LedgerConversationTimeline';
import LedgerContactHeader from '../components/ledger/LedgerContactHeader';
import LedgerMetricsBar from '../components/ledger/LedgerMetricsBar';
import LedgerSelectionToolbar from '../components/ledger/LedgerSelectionToolbar';
import {
  updateLedgerTransactionAmount,
  updateLedgerTransactionNote,
  deleteTransaction,
  getTransactionById as getLedgerTransactionById,
} from '../services/ledgerDatabase';
import {
  getMessageById,
  updateConversation,
  deleteMessagesHard,
  getLatestConversationMessage,
} from '../services/chatDatabase';
import {ensureLedgerDetailDatabasesReady} from '../services/dbLifecycleManager';
import {
  sendDeliveryReceipt,
  syncPendingMessagesForConversation,
  subscribeToIncomingMessages,
} from '../services/messagingService';
import {
  handleConversationSeen,
  resolveDirectBackBehavior,
} from '../services/chatSystem';
import {useChatStore, chatStore} from '../context/ChatStore';
import {upsertChatTimelineMessage, sameChatTimeline, reconcileChatTimeline, appendChatHistoryPage} from '../services/chatTimelineUpdates';
import {loadChatHistoryPage} from '../services/chatHistoryPage';
import useChatComposerLayout from '../hooks/useChatComposerLayout';
import useLedgerChatController from '../hooks/useLedgerChatController';
import {isInstalledAppUser} from '../services/ledgerChatIdentityService';
import useLedgerSelectionMode from '../hooks/useLedgerSelectionMode';
import useLedgerTransactionsController from '../hooks/useLedgerTransactionsController';
import useDraftLedgerContact from '../hooks/useDraftLedgerContact';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';

const INVITE_MESSAGE = `Hey! I've been using Savingo to track expenses, manage credit records and chat for acknowledgements — all in one app. You should try it too!

Download: https://play.google.com/store/apps/details?id=com.jasmeet.accountapp`;
import {
  buildLedgerCreateEvent,
  sendLedgerEvent,
  removeQueuedLedgerEventsForContact,
} from '../services/ledgerSyncService';
import {
  dispatchLedgerDomainAction,
  selectLedgerContactBase,
  selectLedgerContactTimeline,
  subscribeLedgerDomainState,
} from '../services/ledgerDomain';
import {LEDGER_ACTION_TYPES} from '../services/ledgerDomain/ledgerDomainContract';
import useLedgerConversationFocus from '../hooks/useLedgerConversationFocus';

const LEDGER_CHAT_CACHE_PREFIX = 'ledgerChatCache:';
const LEDGER_SYNC_ALL_ENTRIES_PREFIX = 'ledgerSyncAllEntries:';
const DEVICE_CONTACTS_CACHE_KEY = 'ledgerDeviceContacts';
const CONTACT_CACHE_TTL_MS = 20000;
const CONTACT_IDENTITY_CACHE_TTL_MS = Number.POSITIVE_INFINITY;
const PENDING_SYNC_RECENT_WINDOW_MS = 2 * 60 * 1000;
const PENDING_SYNC_MAX_BATCH = 20;
const CONTACT_BASE_CACHE_MAX_ENTRIES = 15;
const CONTACT_TIMELINE_CACHE_MAX_ENTRIES = 8;
const CONTACT_IDENTITY_CACHE_MAX_ENTRIES = 15;
const CONTACT_TIMELINE_CACHE_MAX_ITEMS = 80;
const CONTACT_BASE_CACHE = new Map();
const CONTACT_TIMELINE_CACHE = new Map();
const CONTACT_IDENTITY_CACHE = new Map();

const getContactCacheKey = contactRecordId => String(contactRecordId || '').trim();

const pruneBoundedCache = (cache, maxEntries) => {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
};

const removeStaleContactCacheEntries = (
  cache,
  maxAgeMs = CONTACT_CACHE_TTL_MS,
) => {
  if (!Number.isFinite(maxAgeMs)) {
    return;
  }
  const now = Date.now();
  Array.from(cache.entries()).forEach(([key, value]) => {
    const updatedAt = Number(value?.updatedAt || 0);
    if (!updatedAt || now - updatedAt >= maxAgeMs) {
      cache.delete(key);
    }
  });
};

const readBoundedContactCache = (
  cache,
  contactRecordId,
  options = {},
) => {
  removeStaleContactCacheEntries(cache, options.maxAgeMs);
  const key = getContactCacheKey(contactRecordId);
  if (!key) {
    return null;
  }
  const value = cache.get(key) || null;
  if (!value) {
    return null;
  }
  cache.delete(key);
  cache.set(key, value);
  return value;
};

const writeBoundedContactCache = (
  cache,
  contactRecordId,
  value,
  maxEntries,
  options = {},
) => {
  removeStaleContactCacheEntries(cache, options.maxAgeMs);
  const key = getContactCacheKey(contactRecordId);
  if (!key) {
    return;
  }
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, {
    ...value,
    updatedAt: Date.now(),
  });
  pruneBoundedCache(cache, maxEntries);
};

const deleteContactCaches = contactRecordId => {
  const key = getContactCacheKey(contactRecordId);
  if (!key) {
    return;
  }
  CONTACT_BASE_CACHE.delete(key);
  CONTACT_TIMELINE_CACHE.delete(key);
  CONTACT_IDENTITY_CACHE.delete(key);
};

const readContactBaseCache = contactRecordId => {
  return readBoundedContactCache(CONTACT_BASE_CACHE, contactRecordId, {
    maxAgeMs: CONTACT_CACHE_TTL_MS,
  });
};

const writeContactBaseCache = (contactRecordId, transactions, balance) => {
  writeBoundedContactCache(
    CONTACT_BASE_CACHE,
    contactRecordId,
    {
    transactions: Array.isArray(transactions) ? transactions : [],
    balance: balance || {
      netBalance: 0,
      totalPaid: 0,
      totalGet: 0,
      transactionCount: 0,
    },
    },
    CONTACT_BASE_CACHE_MAX_ENTRIES,
  );
};

const readContactTimelineCache = contactRecordId => {
  return readBoundedContactCache(CONTACT_TIMELINE_CACHE, contactRecordId, {
    maxAgeMs: CONTACT_CACHE_TTL_MS,
  });
};

const writeContactTimelineCache = (contactRecordId, timeline, conversationId = null) => {
  const nextTimeline = Array.isArray(timeline)
    ? timeline.slice(0, CONTACT_TIMELINE_CACHE_MAX_ITEMS)
    : [];
  writeBoundedContactCache(
    CONTACT_TIMELINE_CACHE,
    contactRecordId,
    {
    timeline: nextTimeline,
    conversationId: String(conversationId || '').trim() || null,
    },
    CONTACT_TIMELINE_CACHE_MAX_ENTRIES,
  );
};

const readContactIdentityCache = contactRecordId => {
  return readBoundedContactCache(CONTACT_IDENTITY_CACHE, contactRecordId, {
    maxAgeMs: CONTACT_IDENTITY_CACHE_TTL_MS,
  });
};

const writeContactIdentityCache = (contactRecordId, identity) => {
  if (!identity) {
    return;
  }
  writeBoundedContactCache(
    CONTACT_IDENTITY_CACHE,
    contactRecordId,
    identity,
    CONTACT_IDENTITY_CACHE_MAX_ENTRIES,
    {
      maxAgeMs: CONTACT_IDENTITY_CACHE_TTL_MS,
    },
  );
};

const hexToRgba = (hexColor, alpha = 1) => {
  const hex = String(hexColor || '').replace('#', '');
  if (hex.length !== 6) {
    return `rgba(79, 142, 247, ${alpha})`;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const LedgerContactDetailScreen = ({route, navigation}) => {
  const {colors, isDark} = useTheme();
  const {showAlert} = useAppAlert();
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
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const {
    contact,
    perfTraceId,
    tapAt,
    openMode,
    returnTo,
    fallbackRoute,
    isDraftContact,
  } = route.params || {};
  const contactRecordId = String(contact?.recordID || '').trim();
  const {emitContactUpdate, persistDraftContactOnce} = useDraftLedgerContact({
    contact,
    isDraftContact,
  });
  const {showToast} = useToast();
  const currencySymbol = useCurrencySymbol();
  const insets = useSafeAreaInsets();

  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState({
    netBalance: 0,
    totalPaid: 0,
    totalGet: 0,
    transactionCount: 0,
  });
  const [transactionModalVisible, setTransactionModalVisible] = useState(false);
  const [transactionType, setTransactionType] = useState('paid'); // 'paid' or 'get'
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editAmountVisible, setEditAmountVisible] = useState(false);
  const [editRemarkVisible, setEditRemarkVisible] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [syncingSelectedEntry, setSyncingSelectedEntry] = useState(false);
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const [syncAllEntriesEnabled, setSyncAllEntriesEnabled] = useState(true);
  const [menuAnchor, setMenuAnchor] = useState({x: 0, y: 0, width: 36, height: 36});

  // Chat-related states
  const [appUser, setAppUser] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [isAppUser, setIsAppUser] = useState(() => {
    const s = String(contact?.appInstallState || '').trim().toLowerCase();
    if (s === 'installed') {
      return true;
    }
    if (s === 'uninstalled') {
      return false;
    }
    return null;
  });
  const [unifiedTimeline, setUnifiedTimeline] = useState([]);
  const chatDraftRef = useRef('');
  const historyPageRef = useRef(null);
  const timelineRowsRef = useRef(unifiedTimeline);
  timelineRowsRef.current = unifiedTimeline;
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [hasLoadedTimeline, setHasLoadedTimeline] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [headerPhone, setHeaderPhone] = useState('');
  const {width: screenWidth, height: screenHeight} = Dimensions.get('window');
  const chatStoreState = useChatStore();
  const conversationVersion = chatStoreState.conversationVersion?.[conversationId] || 0;

  // Animation values
  const modalSlideAnim = useRef(new Animated.Value(300)).current;
  const optionsOverlayOpacity = useRef(new Animated.Value(0)).current;
  const optionsContentTranslateY = useRef(new Animated.Value(300)).current;
  const headerMenuAnim = useRef(new Animated.Value(0)).current;
  const listRef = useRef(null);
  const amountInputRef = useRef(null);
  const noteInputRef = useRef(null);
  const chatInputRef = useRef(null);
  const perfSeqRef = useRef(0);
  const lastTimelineKeyRef = useRef('');
  const lastTimelineAtRef = useRef(0);
  const screenOpenAtRef = useRef(Date.now());
  const emptyVisibleRef = useRef(false);
  const firstDataVisibleRef = useRef(false);
  const firstHeaderLayoutAtRef = useRef(0);
  const lastHeaderHeightRef = useRef(0);
  const inputTapAtRef = useRef(0);
  const actionButtonsChangedAtRef = useRef(0);
  const processedAmountEntryResultRef = useRef('');
  const isScreenFocusedRef = useRef(true);
  const menuButtonRef = useRef(null);
  const lastPendingSyncAtRef = useRef(0);
  const dataLoadInFlightRef = useRef(false);
  const lastDataLoadAtRef = useRef(0);
  const lastConversationVersionLoadedRef = useRef(0);
  const menuWidth = 280;
  const menuLeft = Math.min(
    Math.max(spacing.md, menuAnchor.x + menuAnchor.width - menuWidth),
    Math.max(spacing.md, screenWidth - menuWidth - spacing.md),
  );
  const menuTop = Math.max(spacing.md, menuAnchor.y + menuAnchor.height + spacing.xs);
  const restoredTabBarStyle = useMemo(
    () => ({
      backgroundColor: 'transparent',
      borderTopWidth: 1,
      borderTopColor: '#5A7468',
      height: 60 + insets.bottom,
      paddingBottom: Math.max(8, insets.bottom),
      paddingTop: 8,
    }),
    [insets.bottom],
  );
  const perfLog = useCallback(() => {}, []);

  const applyTimelineState = useCallback((timeline, hasLoaded = true) => {
    setUnifiedTimeline(prev => reconcileChatTimeline(prev, Array.isArray(timeline) ? (historyPageRef.current ? timeline : timeline.slice(0, 50)) : []));
    setHasLoadedTimeline(Boolean(hasLoaded));
    setTimelineLoading(false);
  }, []);

  const publishedTimelineRef = useRef(null);
  useEffect(() => {
    if (!contactRecordId || !hasLoadedTimeline) return;
    publishedTimelineRef.current = unifiedTimeline;
    writeContactTimelineCache(contactRecordId, unifiedTimeline, conversationId);
    dispatchLedgerDomainAction({type: LEDGER_ACTION_TYPES.UPSERT_TIMELINE,
      payload: {timeline: {recordId: contactRecordId, conversationId,
        hasLoaded: true, updatedAt: Date.now(), items: unifiedTimeline}}});
  }, [contactRecordId, conversationId, hasLoadedTimeline, unifiedTimeline]);

  useEffect(() => subscribeToIncomingMessages(event => {
    if (!event?.messageId || !conversationId) return;
    const message = getMessageById(event.messageId);
    if (!message || message.conversation_id !== conversationId) return;
    setUnifiedTimeline(prev => upsertChatTimelineMessage(prev, message,
      {insertMissing: event.type === 'chat_message'}));
    lastConversationVersionLoadedRef.current =
      chatStore.getState().conversationVersion?.[conversationId] || 0;
  }), [conversationId]);

  const hydrateTimelineFromCache = useCallback(cachedTimeline => {
    if (cachedTimeline) {
      applyTimelineState(cachedTimeline.timeline || [], true);
      return true;
    }
    applyTimelineState([], false);
    return false;
  }, [applyTimelineState]);

  const {
    chatInputAvoidOffset,
    listKeyboardSpacerHeight,
    setShouldHideActionButtons,
    setSoftInputHeight,
    shouldHideActionButtons,
    softInputHeight,
    handleComposerLayout,
    handleInputBlur,
    handleInputFocus,
    handleInputTouchStart,
    handleSoftInputHeightChange,
    handleSoftInputHidden,
    handleSoftInputShown,
  } = useChatComposerLayout({
    isAppUser,
    insetsBottom: insets.bottom,
    screenHeight,
    chatInputRef,
    inputTapAtRef,
    actionButtonsChangedAtRef,
    perfLog,
  });

  const blinkLog = useCallback(() => {}, []);

  const scrollToLatest = useCallback((reason, delayMs = 0) => {
    const run = () => {
      listRef.current?.scrollToOffset?.({offset: 0, animated: false});
      perfLog('list:scroll-latest', {reason, delayMs});
    };
    if (delayMs > 0) {
      setTimeout(run, delayMs);
      return;
    }
    requestAnimationFrame(run);
  }, []);

  const normalizePhoneNumber = useCallback((phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length > 10) {
      return digits.slice(-10);
    }
    return digits.length >= 8 ? digits : '';
  }, []);

  const getContactPhone = useCallback(() => {
    const phone = contact?.phoneNumbers?.find(item =>
      String(item.number || '').trim()
    )?.number;
    return phone || 'No phone number';
  }, [contact?.phoneNumbers]);

  const handleDirectBackNavigation = useCallback(() => {
    const backBehavior = resolveDirectBackBehavior({
      openMode,
      returnTo,
      fallbackRoute,
      canGoBack: navigation.canGoBack(),
    });

    if (backBehavior.action === 'return_to' && backBehavior.target?.name) {
      navigation.replace(backBehavior.target.name, backBehavior.target.params || {});
      return true;
    }

    if (backBehavior.action === 'go_back') {
      navigation.goBack();
      return true;
    }

    if (backBehavior.target?.name) {
      navigation.reset({
        index: 0,
        routes: [
          {
            name: backBehavior.target.name,
            params: backBehavior.target.params || {},
          },
        ],
      });
      return true;
    }

    return false;
  }, [fallbackRoute, navigation, openMode, returnTo]);

  const markActiveConversationRead = useCallback(async reason => {
    if (!conversationId || isAppUser !== true || !isScreenFocusedRef.current || AppState.currentState !== 'active') {
      return;
    }

    try {
      const selfUserId =
        String(currentUserId || '').trim() ||
        String((await AsyncStorage.getItem('firebaseUid')) || '').trim();

      if (!selfUserId) {
        return;
      }

      // Focus can change while the identity read above is awaiting storage.
      if (!isScreenFocusedRef.current || AppState.currentState !== 'active') return;

      const result = await handleConversationSeen({
        conversationId,
        selfUserId,
        sendReadReceipt: sendDeliveryReceipt,
        receiptLimit: 100,
      });

      perfLog('conversation:mark-read', {
        reason,
        conversationId,
        unreadCount: Number(result?.unreadCount || 0),
      });
    } catch (error) {
      console.error('Failed to mark active conversation as read:', error);
    }
  }, [conversationId, currentUserId, isAppUser, perfLog]);

  const runPendingSync = async (reason = 'manual') => {
    try {
      if (!conversationId || isAppUser !== true) {
        return;
      }
      const now = Date.now();
      if (now - lastPendingSyncAtRef.current < 3000) {
        return;
      }
      lastPendingSyncAtRef.current = now;

      const latestTimelineTimestamp = (unifiedTimeline || [])
        .filter(item => item?.type === 'message')
        .reduce((maxTs, item) => {
          const ts = Number(item?.data?.timestamp || item?.timestamp || 0);
          return ts > maxTs ? ts : maxTs;
        }, 0);
      const latestDbTimestamp = Number(
        getLatestConversationMessage(conversationId)?.timestamp || 0,
      );
      const latestKnownTimestamp = Math.max(latestTimelineTimestamp, latestDbTimestamp);
      const effectiveSinceTimestamp =
        latestKnownTimestamp > 0
          ? latestKnownTimestamp
          : now - PENDING_SYNC_RECENT_WINDOW_MS;

      const result = await syncPendingMessagesForConversation({
        conversationId,
        sinceTimestamp: effectiveSinceTimestamp,
        limit: PENDING_SYNC_MAX_BATCH,
      });

      if ((result?.synced || 0) > 0) {
        perfLog('pending-sync:applied', {
          reason,
          synced: result.synced,
          sinceTimestamp: effectiveSinceTimestamp,
          conversationId,
        });
        if (isScreenFocusedRef.current) {
          await markActiveConversationRead(`${reason}-after-sync`);
        }
      }
    } catch (error) {
      console.error('Pending sync failed:', error);
    }
  };

  const handleScreenFocusSync = async () => {
    await markActiveConversationRead('screen-focus');
    await runPendingSync('screen-focus');
  };

  useLedgerConversationFocus({
    navigation,
    conversationId,
    contactRecordId,
    restoredTabBarStyle,
    isScreenFocusedRef,
    onScreenFocusSync: handleScreenFocusSync,
  });


  useEffect(() => {
    return () => {
      deleteContactCaches(contactRecordId);
    };
  }, [contactRecordId]);
  useEffect(() => {
    if (optionsVisible) {
      optionsOverlayOpacity.setValue(0);
      optionsContentTranslateY.setValue(300);
      Animated.parallel([
        Animated.timing(optionsOverlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(optionsContentTranslateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(optionsOverlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(optionsContentTranslateY, {
          toValue: 300,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [optionsVisible, optionsOverlayOpacity, optionsContentTranslateY]);

  const getSyncAllEntriesStorageKey = useCallback(() => {
    if (!contact?.recordID) {
      return null;
    }
    return `${LEDGER_SYNC_ALL_ENTRIES_PREFIX}${contact.recordID}`;
  }, [contact?.recordID]);

  const openHeaderMenu = () => {
    setHeaderMenuVisible(true);
    requestAnimationFrame(() => {
      headerMenuAnim.setValue(0);
      Animated.timing(headerMenuAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const closeHeaderMenu = () => {
    Animated.timing(headerMenuAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setHeaderMenuVisible(false);
    });
  };

  const handleHeaderMenuPress = () => {
    if (menuButtonRef.current?.measureInWindow) {
      menuButtonRef.current.measureInWindow((x, y, width, height) => {
        setMenuAnchor({x, y, width, height});
        openHeaderMenu();
      });
      return;
    }
    openHeaderMenu();
  };

  const handleHeaderLayout = useCallback(event => {
    const nextHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    const prevHeight = lastHeaderHeightRef.current;
    if (nextHeight === prevHeight) {
      return;
    }
    lastHeaderHeightRef.current = nextHeight;
    if (!firstHeaderLayoutAtRef.current) {
      firstHeaderLayoutAtRef.current = Date.now();
      blinkLog('header-layout-first', {
        contactId: contactRecordId,
        height: nextHeight,
        sinceMountMs: firstHeaderLayoutAtRef.current - screenOpenAtRef.current,
      });
      return;
    }
    blinkLog('header-layout-change', {
      contactId: contactRecordId,
      previousHeight: prevHeight,
      nextHeight,
      sinceMountMs: Date.now() - screenOpenAtRef.current,
    });
  }, [contactRecordId]);

  const persistSyncAllEntries = useCallback(
    async enabled => {
      const key = getSyncAllEntriesStorageKey();
      if (!key) {
        return;
      }
      try {
        await AsyncStorage.setItem(key, enabled ? '1' : '0');
      } catch (error) {
        console.error('Failed to save sync entries preference:', error);
      }
    },
    [getSyncAllEntriesStorageKey],
  );

  const toggleSyncAllEntries = useCallback(async () => {
    const next = !syncAllEntriesEnabled;
    setSyncAllEntriesEnabled(next);
    await persistSyncAllEntries(next);
    if (!next && contact?.recordID) {
      try {
        const removed = await removeQueuedLedgerEventsForContact(contact.recordID);
        console.log('[LEDGER_SYNC] Cleared queued events after disabling sync', {
          contactRecordId: contact.recordID,
          removed,
        });
      } catch (error) {
        console.error('Failed to clear queued ledger events for contact:', error);
      }
    }
  }, [syncAllEntriesEnabled, persistSyncAllEntries, contact?.recordID]);

  useEffect(() => {
    ensureLedgerDetailDatabasesReady();
    perfLog('trigger:mount -> init only');
    perfLog('ledger-detail:mount', {
      contactId: String(contact?.recordID || ''),
      perfTraceId: perfTraceId || null,
      sinceTapMs: tapAt ? Date.now() - Number(tapAt) : null,
    });
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ledger:updated', payload => {
      const incomingId = String(payload?.contactRecordId || '');
      const currentId = String(contact?.recordID || '');
      if (!incomingId || incomingId === currentId) {
        perfLog('trigger:ledger:updated -> loadData', {incomingId, currentId});
        loadData();
      }
    });

    return () => sub.remove();
  }, [contact?.recordID, conversationId]);


  useEffect(() => {
    const onFocus = navigation.addListener('focus', () => {
      perfLog('ledger-detail:focus', {
        contactId: String(contact?.recordID || ''),
        perfTraceId: perfTraceId || null,
        sinceTapMs: tapAt ? Date.now() - Number(tapAt) : null,
        sinceMountMs: Date.now() - screenOpenAtRef.current,
      });
      isScreenFocusedRef.current = true;
      inputTapAtRef.current = 0;
      chatInputRef.current?.blur?.();
      Keyboard.dismiss();
      setSoftInputHeight(0);
      setShouldHideActionButtons(false);
      const cachedBase = readContactBaseCache(contactRecordId);
      const cachedTimeline = readContactTimelineCache(contactRecordId);
      blinkLog('contact-change-cache-hydrate', {
        contactId: contactRecordId,
        hasBaseCache: Boolean(cachedBase),
        hasTimelineCache: Boolean(cachedTimeline),
      });
      if (cachedBase) {
        setTransactions(cachedBase.transactions || []);
        setBalance(
          cachedBase.balance || {
            netBalance: 0,
            totalPaid: 0,
            totalGet: 0,
            transactionCount: 0,
          },
        );
      }
      if (cachedTimeline) {
        hydrateTimelineFromCache(cachedTimeline);
      }
      const cacheUpdatedAt = Math.max(
        Number(cachedBase?.updatedAt || 0),
        Number(cachedTimeline?.updatedAt || 0),
      );
      const cacheFresh = Boolean(
        cachedBase &&
          cachedTimeline &&
          cacheUpdatedAt > 0 &&
          Date.now() - cacheUpdatedAt < CONTACT_CACHE_TTL_MS,
      );
      const conversationVersionChanged =
        conversationVersion !== lastConversationVersionLoadedRef.current;
      blinkLog('focus-cache-check', {
        contactId: contactRecordId,
        hasBaseCache: Boolean(cachedBase),
        hasTimelineCache: Boolean(cachedTimeline),
        cacheAgeMs: cacheUpdatedAt ? Date.now() - cacheUpdatedAt : null,
        cacheFresh,
        conversationVersion,
        lastConversationVersionLoaded: lastConversationVersionLoadedRef.current,
        conversationVersionChanged,
      });
      perfLog('trigger:focus -> loadData');
      if (!cacheFresh || conversationVersionChanged) {
        blinkLog('focus-load-path', {mode: 'fresh-load', contactId: contactRecordId});
        loadData();
        hydratePersistedConversationTimeline('focus').catch(error => {
          if (__DEV__) {
            console.log('[LEDGER_IDENTITY_DIAG][TIMELINE_HYDRATE_ERROR]', {
              reason: 'focus',
              message: error?.message || String(error),
            });
          }
        });
      } else {
        perfLog('focus:using-fresh-cache', {
          contactId: contactRecordId,
          cacheAgeMs: Date.now() - cacheUpdatedAt,
          conversationVersion,
        });
        blinkLog('focus-load-path', {mode: 'cache-only', contactId: contactRecordId});
      }
    });

    const onBlur = navigation.addListener('blur', () => {
      isScreenFocusedRef.current = false;
      setSoftInputHeight(0);
      setShouldHideActionButtons(false);
      Keyboard.dismiss();
      perfLog('ledger-detail:blur-reset');
    });

    return () => {
      onFocus();
      onBlur();
    };
  }, [
    navigation,
    contactRecordId,
    perfTraceId,
    tapAt,
    conversationVersion,
    hydratePersistedConversationTimeline,
    hydrateTimelineFromCache,
  ]);


  useEffect(() => {
    // Auto-focus keyboard when modal opens
    if (transactionModalVisible && amountInputRef.current) {
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 300);
    }
  }, [transactionModalVisible]);

  useEffect(() => {
    if (conversationId && isAppUser === true) {
      const currentVersion = chatStore.getState().conversationVersion?.[conversationId] || 0;
      markActiveConversationRead('conversation-effect');
      const cachedTimeline = readContactTimelineCache(contactRecordId);
      const cachedTimelineConversationId = String(
        cachedTimeline?.conversationId || '',
      ).trim();
      const timelineCacheAge = cachedTimeline?.updatedAt
        ? Date.now() - Number(cachedTimeline.updatedAt)
        : Number.POSITIVE_INFINITY;
      const timelineCacheFresh = Boolean(
        cachedTimeline &&
          cachedTimelineConversationId === String(conversationId || '').trim() &&
          timelineCacheAge < CONTACT_CACHE_TTL_MS &&
          currentVersion === lastConversationVersionLoadedRef.current
      );
      perfLog('trigger:conversation/effect -> loadUnifiedTimeline', {
        conversationId,
        conversationVersion: currentVersion,
        isAppUser,
      });
      if (!timelineCacheFresh) {
        loadUnifiedTimeline(conversationId);
      } else {
        blinkLog('conversation-effect:skip-timeline-load', {
          contactId: contactRecordId,
          conversationId,
          cachedConversationId: cachedTimelineConversationId || null,
          timelineCacheAge,
          conversationVersion: currentVersion,
        });
      }
      InteractionManager.runAfterInteractions(() => {
        runPendingSync('conversation-effect');
      });
    }
  }, [
    conversationId,
    isAppUser,
    contactRecordId,
    markActiveConversationRead,
  ]);

  useEffect(() => {
    if (isAppUser !== false) {
      return;
    }
    let isActive = true;
    (async () => {
      const preservedConversationId = await hydratePersistedConversationTimeline(
        'non-app-user-fallback',
      );
      if (!isActive || preservedConversationId) {
        return;
      }
      loadUnifiedTimeline(null);
    })();
    return () => {
      isActive = false;
    };
  }, [conversationId, hydratePersistedConversationTimeline, isAppUser]);


  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        runPendingSync('app-active');
      }
    });
    return () => appStateSub.remove();
  }, [conversationId, isAppUser]);

  useEffect(() => {
    let unsubscribe = null;
    try {
      const NetInfo = require('@react-native-community/netinfo');
      unsubscribe = NetInfo.addEventListener(state => {
        if (state?.isConnected) {
          runPendingSync('network-reconnect');
        }
      });
    } catch (error) {
      console.warn('NetInfo listener init failed for pending sync:', error);
    }
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [conversationId, isAppUser]);

  useEffect(() => {
    AvoidSoftInput.setEnabled(true);
    AvoidSoftInput.setShouldMimicIOSBehavior(false);
    AvoidSoftInput.setShowAnimationDelay(0);
    AvoidSoftInput.setHideAnimationDelay(0);
    AvoidSoftInput.setShowAnimationDuration(30);
    AvoidSoftInput.setHideAnimationDuration(30);
    AvoidSoftInput.setEasing('linear');
    return () => {
      AvoidSoftInput.setShowAnimationDelay();
      AvoidSoftInput.setHideAnimationDelay();
      AvoidSoftInput.setShowAnimationDuration();
      AvoidSoftInput.setHideAnimationDuration();
      AvoidSoftInput.setEnabled(false);
    };
  }, []);

  useEffect(() => {
    if (!shouldHideActionButtons) {
      return;
    }
    // After action-buttons hide + keyboard transition, force latest item visibility.
    scrollToLatest('buttons-hidden-sync', 50);
  }, [shouldHideActionButtons, scrollToLatest]);

  useEffect(() => {
    const loadSyncPreference = async () => {
      const key = getSyncAllEntriesStorageKey();
      if (!key) {
        setSyncAllEntriesEnabled(true);
        return;
      }
      try {
        const stored = await AsyncStorage.getItem(key);
        if (stored === null) {
          setSyncAllEntriesEnabled(true);
          return;
        }
        setSyncAllEntriesEnabled(stored !== '0');
      } catch (error) {
        console.error('Failed to load sync entries preference:', error);
        setSyncAllEntriesEnabled(true);
      }
    };
    loadSyncPreference();
  }, [getSyncAllEntriesStorageKey]);
  const loadUnifiedTimeline = async (convId = null, {force = false} = {}) => {
    if (!contactRecordId) {
      return;
    }

    const timelineKey = `${contactRecordId}:${String(convId || 'null')}`;
    const now = Date.now();
    if (!force && lastTimelineKeyRef.current === timelineKey &&
        conversationVersion === lastConversationVersionLoadedRef.current &&
        now - lastTimelineAtRef.current < 220) {
      perfLog('loadUnifiedTimeline:skip-duplicate', {
        timelineKey,
        sinceMs: now - lastTimelineAtRef.current,
      });
      return;
    }
    lastTimelineKeyRef.current = timelineKey;
    lastTimelineAtRef.current = now;
    const previousPage = historyPageRef.current;
    const ticket = {key: timelineKey, epoch: (previousPage?.epoch || 0) + 1, loading: false};
    const pageSize = previousPage?.key === timelineKey
      ? Math.max(50, timelineRowsRef.current.filter(item => !item.data?.local_only).length) : 50;
    historyPageRef.current = ticket;
    setLoadingOlderHistory(false);

    const perfId = ++perfSeqRef.current;
    const startedAt = now;
    blinkLog('timeline-load-start', {
      contactId: contactRecordId,
      convId: convId || null,
      perfId,
      previousCount: unifiedTimeline.length,
    });
    setTimelineLoading(true);
    perfLog('loadUnifiedTimeline:start', {perfId, convId: convId || null, timelineKey});

    try {
      const page = loadChatHistoryPage({contactRecordId, conversationId: convId, limit: pageSize});
      if (historyPageRef.current !== ticket) return;
      historyPageRef.current = {...ticket, cursor: page.cursor, hasMore: page.hasMore};
      setHasMoreHistory(page.hasMore);
      const sorted = page.items;
      applyTimelineState(sorted, true);
      dispatchLedgerDomainAction({
        type: LEDGER_ACTION_TYPES.UPSERT_TIMELINE,
        payload: {
          timeline: {
            recordId: contactRecordId,
            conversationId: String(convId || '').trim() || null,
            hasLoaded: true,
            updatedAt: Date.now(),
            items: sorted,
          },
        },
      });
      writeContactTimelineCache(contactRecordId, sorted, convId);
      lastConversationVersionLoadedRef.current = conversationVersion;
      blinkLog('timeline-load-success', {
        contactId: contactRecordId,
        convId: convId || null,
        perfId,
        nextCount: sorted.length,
        durationMs: Date.now() - startedAt,
      });
      perfLog('loadUnifiedTimeline:end', {
        perfId,
        convId: convId || null,
        messageCount: sorted.filter(item => item.type === 'message').length,
        timelineCount: sorted.length,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      console.error('Failed to load unified timeline:', error);
      showToast('Could not load history. Your current messages are kept.', 'error');
      perfLog('loadUnifiedTimeline:error', {
        perfId,
        convId: convId || null,
        durationMs: Date.now() - startedAt,
        message: error?.message || String(error),
      });
    } finally {
      setTimelineLoading(false);
    }
  };

  const queueLedgerStateRefresh = useCallback(
    (reason = 'submit-transaction') => {
      const nextConversationId = String(conversationId || '').trim() || null;
      InteractionManager.runAfterInteractions(() => {
        loadData().catch(error => {
          console.error('Failed to refresh ledger base after submit:', error);
        });
        if (nextConversationId) {
          loadUnifiedTimeline(nextConversationId).catch(error => {
            console.error('Failed to refresh ledger timeline after submit:', error);
          });
        }
        perfLog('ledger-detail:refresh-queued', {
          reason,
          contactId: contactRecordId,
          conversationId: nextConversationId,
        });
      });
    },
    [contactRecordId, conversationId, loadData, loadUnifiedTimeline, perfLog],
  );

  const {
    loadCachedChatIdentity,
    handleSendMessage: chatHandleSendMessage,
    mapContactToAppUser: chatMapContactToAppUser,
    resolvePeerUserIdForSync: chatResolvePeerUserIdForSync,
  } = useLedgerChatController({
    conversationId,
    contact,
    routeInitialConversationId: route?.params?.initialConversationId,
    perfTraceId,
    contactRecordId,
    chatCachePrefix: LEDGER_CHAT_CACHE_PREFIX,
    readContactIdentityCache,
    currentUserId,
    setCurrentUserId,
    appUser,
    setAppUser,
    setIsAppUser,
    setConversationId,
    setLoadingChat,
    setUnifiedTimeline,
    showToast,
    loadUnifiedTimeline,
    writeContactIdentityCache,
    getContactPhone,
    normalizePhoneNumber,
    perfLog,
    emitContactUpdate,
    persistDraftContactOnce,
  });
  const chatSendHandlerRef = useRef(chatHandleSendMessage);
  chatSendHandlerRef.current = chatHandleSendMessage;
  const retryChatMessage = useCallback(record => chatSendHandlerRef.current(record), []);

  const loadOlderHistory = useCallback(async () => {
    const pageState = historyPageRef.current;
    const key = `${contactRecordId}:${String(conversationId || 'null')}`;
    if (!pageState || pageState.key !== key || !pageState.hasMore || pageState.loading) return;
    pageState.loading = true;
    setLoadingOlderHistory(true);
    try {
      const page = loadChatHistoryPage({contactRecordId, conversationId, before: pageState.cursor, limit: 50});
      if (historyPageRef.current !== pageState) return;
      historyPageRef.current = {...pageState, cursor: page.cursor, hasMore: page.hasMore, loading: false};
      setHasMoreHistory(page.hasMore);
      setUnifiedTimeline(prev => appendChatHistoryPage(prev, page.items));
    } catch (error) {
      console.error('Older history load failed:', error);
      showToast('Could not load older history. Try again.', 'error');
    } finally {
      pageState.loading = false;
      setLoadingOlderHistory(false);
    }
  }, [contactRecordId, conversationId, showToast]);

  // Map contact to app user on screen open or contact change
  useEffect(() => {
    if (!contact?.recordID) {
      return;
    }
    chatMapContactToAppUser();
  }, [contact?.recordID, chatMapContactToAppUser]);

  const hydratePersistedConversationTimeline = useCallback(async reason => {
    const activeConversationId = String(conversationId || '').trim();
    if (activeConversationId) {
      return activeConversationId;
    }

    const cachedTimeline = readContactTimelineCache(contactRecordId);
    const cachedTimelineConversationId = String(
      cachedTimeline?.conversationId || '',
    ).trim();
    if (cachedTimelineConversationId) {
      setConversationId(prev => String(prev || '').trim() || cachedTimelineConversationId);
      await loadUnifiedTimeline(cachedTimelineConversationId);
      perfLog('timeline:hydrate-persisted', {
        reason,
        source: 'bounded-timeline-cache',
        conversationId: cachedTimelineConversationId,
      });
      return cachedTimelineConversationId;
    }

    const cachedIdentity = await loadCachedChatIdentity();
    const persistedConversationId = String(
      cachedIdentity?.conversationId || route?.params?.initialConversationId || '',
    ).trim();
    if (!persistedConversationId) {
      return '';
    }

    setConversationId(prev => String(prev || '').trim() || persistedConversationId);
    await loadUnifiedTimeline(persistedConversationId);
    perfLog('timeline:hydrate-persisted', {
      reason,
      source: 'async-chat-cache',
      conversationId: persistedConversationId,
    });
    return persistedConversationId;
  }, [
    contactRecordId,
    conversationId,
    loadCachedChatIdentity,
    loadUnifiedTimeline,
    perfLog,
    route?.params?.initialConversationId,
    setConversationId,
  ]);

  const {
    loadLedgerBaseData,
    submitTransaction: ledgerSubmitTransaction,
  } = useLedgerTransactionsController({
    contact,
    contactRecordId,
    currentUserId,
    getContactName: () => getContactName(),
    getSyncAllEntriesEnabled: () => syncAllEntriesEnabled,
    parseEntryDateToTimestamp: value => parseEntryDateToTimestamp(value),
    parseLedgerEditHistory: txn => parseLedgerEditHistory(txn),
    resolvePeerUserIdForSync: () => chatResolvePeerUserIdForSync(),
    writeContactBaseCache,
    setTransactions,
    setBalance,
    blinkLog,
    perfLog,
    persistDraftContactOnce,
  });

  useEffect(() => {
    let lastBase = null;
    let lastTimeline = null;
    const syncFromDomainStore = () => {
      if (!contactRecordId) {
        return;
      }
      const baseState = selectLedgerContactBase(contactRecordId);
      if (baseState?.updatedAt && baseState !== lastBase) {
        lastBase = baseState;
        setTransactions(Array.isArray(baseState.transactions) ? baseState.transactions : []);
        setBalance(
          baseState.balance || {
            netBalance: 0,
            totalPaid: 0,
            totalGet: 0,
            transactionCount: 0,
          },
        );
      }

      const timelineState = selectLedgerContactTimeline(contactRecordId);
      if ((timelineState?.updatedAt || timelineState?.hasLoaded) && timelineState !== lastTimeline) {
        lastTimeline = timelineState;
        if (sameChatTimeline(timelineState.items, publishedTimelineRef.current || [])) return;
        applyTimelineState(
          Array.isArray(timelineState.items) ? timelineState.items : [],
          timelineState.hasLoaded === true,
        );
      }
    };

    syncFromDomainStore();
    const unsubscribe = subscribeLedgerDomainState(() => {
      syncFromDomainStore();
    });
    return () => {
      unsubscribe();
    };
  }, [applyTimelineState, contactRecordId]);

  const onMessagesDeleted = useCallback(ids => {
    const deleted = new Set(ids);
    setUnifiedTimeline(prev => prev.filter(item => item.type !== 'message' ||
      !deleted.has(String(item.data?.message_id || item.data?.id || '').trim())));
  }, []);

  const getTimelineItemTimestamp = item => {
    if (!item) {
      return null;
    }
    if (item.type === 'transaction') {
      return item?.data?.transaction_date || item?.timestamp || null;
    }
    if (item.type === 'message') {
      return item?.data?.timestamp || item?.timestamp || null;
    }
    return item?.timestamp || null;
  };

  const timelineForList = useMemo(() => {
    const items = unifiedTimeline || [];
    return items.map((item, index) => {
      const currentTs = getTimelineItemTimestamp(item);
      if (!currentTs) {
        return {...item, showDate: false};
      }
      const currentDateKey = new Date(currentTs).toDateString();
      const nextItem = items[index + 1];
      const nextTs = getTimelineItemTimestamp(nextItem);
      const nextDateKey = nextTs ? new Date(nextTs).toDateString() : null;
      const showDate = !nextDateKey || currentDateKey !== nextDateKey;
      return {...item, showDate};
    });
  }, [unifiedTimeline]);

  const {
    isSelectionMode,
    selectedMessageIds,
    selectedCount,
    clearSelectionMode,
    enterSelectionMode,
    toggleMessageSelection,
    handleCopySelectedMessages,
    handleDeleteSelectedMessages,
  } = useLedgerSelectionMode({
    onMessagesDeleted,
    timelineForList,
    currentUserId,
    getContactFirstName: () => getContactFirstName(),
    formatTimeLabel: value => formatTimeLabel(value),
    showToast,
    setLoading,
    deleteMessagesHard,
    conversationId,
    getLatestConversationMessage,
    updateConversation,
    loadUnifiedTimeline,
  });

  useEffect(() => {
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSelectionMode) {
        clearSelectionMode();
        return true;
      }
      const inputFocused = Boolean(chatInputRef.current?.isFocused?.());
      const hasDraftMessage = Boolean(chatDraftRef.current.trim());
      perfLog('back:hardware-press', {
        inputFocused,
        hasDraftMessage,
      });
      if (inputFocused && hasDraftMessage) {
        chatInputRef.current?.blur?.();
        setShouldHideActionButtons(false);
        Keyboard.dismiss();
        return true;
      }
      return handleDirectBackNavigation();
    });

    return () => backSub.remove();
  }, [
    navigation,
    isSelectionMode,
    clearSelectionMode,
    handleDirectBackNavigation,
  ]);

  // Load current user ID on mount
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
  }, []);

  // Seed local cached state, then run a single contact-state verification.
  useEffect(() => {
    if (!contactRecordId) {
      return;
    }
    let isActive = true;
    const cachedBase = readContactBaseCache(contactRecordId);
    const cachedTimeline = readContactTimelineCache(contactRecordId);
    lastTimelineKeyRef.current = '';
    lastTimelineAtRef.current = 0;
    if (cachedBase) {
      setTransactions(cachedBase.transactions || []);
      setBalance(
        cachedBase.balance || {
          netBalance: 0,
          totalPaid: 0,
          totalGet: 0,
          transactionCount: 0,
        },
      );
    }
    hydrateTimelineFromCache(cachedTimeline);

    return () => {
      isActive = false;
    };
  }, [
    chatMapContactToAppUser,
    contactRecordId,
    hydrateTimelineFromCache,
  ]);

  const loadData = useCallback(async () => {
    if (!contactRecordId) {
      return;
    }
    const now = Date.now();
    if (dataLoadInFlightRef.current) {
      perfLog('loadData:skip-in-flight', {
        contactId: String(contact?.recordID || ''),
      });
      blinkLog('loadData-skip', {reason: 'in-flight', contactId: contactRecordId});
      return;
    }
    if (now - lastDataLoadAtRef.current < 200) {
      perfLog('loadData:skip-cooldown', {
        contactId: String(contact?.recordID || ''),
        sinceMs: now - lastDataLoadAtRef.current,
      });
      blinkLog('loadData-skip', {
        reason: 'cooldown',
        contactId: contactRecordId,
        sinceMs: now - lastDataLoadAtRef.current,
      });
      return;
    }
    dataLoadInFlightRef.current = true;
    lastDataLoadAtRef.current = now;

    try {
      const perfId = ++perfSeqRef.current;
      const startedAt = Date.now();
      perfLog('loadData:start', {
        perfId,
        contactId: contactRecordId,
        conversationId: conversationId || null,
      });

      const {txns} = loadLedgerBaseData();

      perfLog('loadData:base-done', {
        perfId,
        txCount: txns.length,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      dataLoadInFlightRef.current = false;
    }
  }, [contact, contactRecordId, conversationId, loadLedgerBaseData, perfLog]);

  const getContactName = () => {
    if (contact?.savedName) {
      return contact.savedName;
    }
    const fullName = [contact?.givenName, contact?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || contact?.displayName || 'Unknown Contact';
  };

  const getContactFirstName = () => {
    const fullName = String(getContactName() || '').trim();
    if (!fullName) {
      return 'Contact';
    }
    const first = fullName.split(/\s+/)[0];
    return first || fullName;
  };

  const handleInviteContact = useCallback(async () => {
    try {
      const name = getContactName();
      const message = name ? `${INVITE_MESSAGE} - ${name}` : INVITE_MESSAGE;
      await Share.share({message});
    } catch (error) {
      console.error('Failed to open invite share:', error);
      showToast('Failed to open invite', 'error');
    }
  }, [getContactName, showToast]);

  const normalizePhoneForMatch = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length > 10) {
      return digits.slice(-10);
    }
    return digits.length >= 8 ? digits : '';
  };

  const parseEntryDateToTimestamp = value => {
    if (value == null || value === '') {
      return null;
    }
    const numValue = Number(value);
    if (Number.isFinite(numValue) && numValue > 0) {
      return Math.floor(numValue);
    }
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return null;
  };
  const openContactProfileScreen = () => {
    const rawPhone = String(headerPhone || '').trim();
    const fallbackPhone = getContactPhone();
    const resolvedPhone = rawPhone || (fallbackPhone !== 'No phone number' ? fallbackPhone : '');
    navigation.navigate('contactprofilescreen', {
      contact,
      contactName: getContactName(),
      phone: resolvedPhone,
      bio: String(appUser?.bio || '').trim(),
      userId: String(appUser?.firebaseUid || appUser?.userId || contact?.userId || '').trim(),
      balance,
    });
  };

  useEffect(() => {
    let isActive = true;

    const resolveHeaderPhone = async () => {
      try {
        const contactPhones = [
          ...(Array.isArray(contact?.phoneNumbers)
            ? contact.phoneNumbers.map(item => String(item?.number || '').trim()).filter(Boolean)
            : []),
          String(contact?.phoneComputed || '').trim(),
        ].filter(Boolean);

        if (!contactPhones.length) {
          if (isActive) {
            setHeaderPhone('');
          }
          return;
        }

        const recordId = String(contact?.recordID || '').trim();
        if (recordId && !recordId.startsWith('app_')) {
          if (isActive) {
            setHeaderPhone(contactPhones[0]);
          }
          return;
        }

        const normalizedCandidates = new Set(
          contactPhones.map(phone => normalizePhoneForMatch(phone)).filter(Boolean),
        );
        if (!normalizedCandidates.size) {
          if (isActive) {
            setHeaderPhone('');
          }
          return;
        }

        const cachedRaw = await AsyncStorage.getItem(DEVICE_CONTACTS_CACHE_KEY);
        const cachedContacts = cachedRaw ? JSON.parse(cachedRaw) : [];
        if (!Array.isArray(cachedContacts) || !cachedContacts.length) {
          if (isActive) {
            setHeaderPhone('');
          }
          return;
        }

        for (const deviceContact of cachedContacts) {
          const deviceNumbers = [
            String(deviceContact?.phoneComputed || '').trim(),
            ...(Array.isArray(deviceContact?.phoneNumbers)
              ? deviceContact.phoneNumbers.map(item => String(item?.number || '').trim())
              : []),
          ].filter(Boolean);
          if (!deviceNumbers.length) {
            continue;
          }

          const matched = deviceNumbers.find(number =>
            normalizedCandidates.has(normalizePhoneForMatch(number)),
          );
          if (matched) {
            if (isActive) {
              setHeaderPhone(matched);
            }
            return;
          }
        }

        if (isActive) {
          setHeaderPhone('');
        }
      } catch (error) {
        console.error('Failed to resolve header phone:', error);
        if (isActive) {
          setHeaderPhone('');
        }
      }
    };

    resolveHeaderPhone();
    return () => {
      isActive = false;
    };
  }, [contact?.recordID, contact?.phoneNumbers, contact?.phoneComputed]);

  const openTransactionEntryScreen = type => {
    isScreenFocusedRef.current = false;
    inputTapAtRef.current = 0;
    chatInputRef.current?.blur?.();
    Keyboard.dismiss();
    setShouldHideActionButtons(false);

    navigation.navigate('AmountEntry', {
      returnOnly: true,
      ledgerAction: type,
      prevRouteKey: route.key,
      ledgerContactRecordId: String(contact?.recordID || ''),
      ledgerContactName: getContactName(),
      initialEntryDate: new Date().toISOString(),
    });
  };

  const openTransactionModal = type => {
    const startedAt = Date.now();
    perfLog('actions:open-transaction-modal', {
      type,
      shouldHideActionButtons,
    });
    setTransactionType(type);
    setAmount('');
    setNote('');
    setTransactionModalVisible(true);
    Animated.spring(modalSlideAnim, {
      toValue: 0,
      tension: 65,
      friction: 10,
      useNativeDriver: true,
    }).start(({finished}) => {
      perfLog('actions:open-transaction-modal:end', {
        type,
        finished,
        elapsedMs: Date.now() - startedAt,
      });
    });
  };

  const closeTransactionModal = () => {
    Keyboard.dismiss();
    Animated.timing(modalSlideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setTransactionModalVisible(false);
      setAmount('');
      setNote('');
    });
  };

  const submitTransaction = async (overrides = null) => {
    setLoading(true);
    try {
      const {entryType, committed} = await ledgerSubmitTransaction({
        overrides: {
          ...overrides,
          transactionType: overrides?.transactionType || transactionType,
          note: overrides?.note ?? note,
          amount: Number(overrides?.amount ?? amount),
        },
      });

      if (!committed) {
        throw new Error('ledger_commit_not_confirmed');
      }

      // Update UI immediately - don't wait for background refresh
      setAmount('');
      setNote('');
      setLoading(false);

      // Show toast instantly
      showToast(
        `${entryType === 'paid' ? 'Payment' : 'Receipt'} recorded successfully`,
        'success'
      );

      // Queue refresh in background (fire-and-forget, don't await)
      queueLedgerStateRefresh(entryType === 'paid' ? 'paid-submit' : 'get-submit');
    } catch (error) {
      console.error('Failed to add transaction:', error);
      showToast('Failed to record transaction', 'error');
      setLoading(false);
    }
  };

  const processAmountEntryResult = async result => {
    if (!result) {
      return;
    }

    const resultKey = String(
      result.resultId ||
      [result.action || '', result.amount || '', result.note || '', result.entryDateIso || ''].join(':')
    );

    if (processedAmountEntryResultRef.current === resultKey) {
      perfLog('trigger:amount-entry-result:skip-duplicate', {resultKey});
      return;
    }
    processedAmountEntryResultRef.current = resultKey;

    const action = result.action;
    const amountValue = Number(result.amount);
    const noteText = String(result.note || '');
    const entryDateIso = result.entryDateIso ? String(result.entryDateIso) : null;

    if ((action !== 'paid' && action !== 'get') || !amountValue || amountValue <= 0) {
      perfLog('trigger:amount-entry-result:invalid', {action, amountValue});
      return;
    }

    perfLog('trigger:amount-entry-result', {
      resultKey,
      action,
      amountValue,
      hasNote: Boolean(noteText.trim()),
    });

    // Match dashboard AmountEntry behavior: direct ledger entry save, no modal/default branching.
    chatInputRef.current?.blur?.();
    Keyboard.dismiss();
    setShouldHideActionButtons(false);

    if (action === 'get') {
      await submitTransaction({
        transactionType: 'get',
        amount: amountValue,
        note: noteText,
        entryDateIso,
      });
      return;
    }

    await submitTransaction({
      transactionType: 'paid',
      amount: amountValue,
      note: noteText,
      entryDateIso,
    });
  };

  useEffect(() => {
    const result = route.params?.amountEntryResult;
    if (!result) {
      return;
    }

    navigation.setParams({amountEntryResult: undefined});
    processAmountEntryResult(result);
  }, [
    route.params?.amountEntryResult,
    navigation,
  ]);

  
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ledger:amountEntryResult', payload => {
      const incomingContactId = String(payload?.contactRecordId || '');
      const currentContactId = String(contact?.recordID || '');
      if (incomingContactId && incomingContactId !== currentContactId) {
        return;
      }
      perfLog('trigger:amount-entry-result:event', {
        incomingContactId,
        currentContactId,
        resultId: payload?.resultId || null,
      });
      processAmountEntryResult(payload);
    });

    return () => sub.remove();
  }, [contact?.recordID]);
  const handleAddTransaction = async () => {
    if (!amount || Number(amount) <= 0) {
      showToast('Please enter a valid amount greater than 0', 'error');
      return;
    }

    if (!contact?.recordID) {
      showToast('Contact information not found', 'error');
      return;
    }

    if (transactionType === 'get') {
      await submitTransaction({transactionType: 'get'});
      return;
    }

    if (transactionType === 'paid') {
      await submitTransaction({transactionType: 'paid'});
      return;
    }

    await submitTransaction();
  };

  const formatCurrency = amount => {
    return `${currencySymbol} ${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const formatSignedBalance = amount => {
    if (amount < 0) {
      return `- ${formatCurrency(amount)}`;
    }
    return formatCurrency(amount);
  };

  const formatDateLabel = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const canEditTransaction = txn => {
    if (!txn) {
      return false;
    }
    const txnSourceUserId = String(txn.source_user_id || '').trim();
    const currentUserIdValue = String(currentUserId || '').trim();
    if (!txnSourceUserId || !currentUserIdValue || txnSourceUserId !== currentUserIdValue) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    if (Number(txn.edit_count) >= 3) {
      return false;
    }
    return txn.id !== null && txn.id !== undefined;
  };

  const canEditRemarkTransaction = txn => {
    if (!txn) {
      return false;
    }
    const txnSourceUserId = String(txn.source_user_id || '').trim();
    const currentUserIdValue = String(currentUserId || '').trim();
    if (!txnSourceUserId || !currentUserIdValue || txnSourceUserId !== currentUserIdValue) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    return txn.id !== null && txn.id !== undefined;
  };

  const isCreatorRestrictedEdit = txn => {
    if (!txn) {
      return false;
    }
    const txnSourceUserId = String(txn.source_user_id || '').trim();
    const currentUserIdValue = String(currentUserId || '').trim();
    if (!txnSourceUserId || !currentUserIdValue) {
      return false;
    }
    return txnSourceUserId !== currentUserIdValue;
  };

  const showCreatorOnlyAmountEditWarning = () => {
    themedAlert(
      'Edit Restricted',
      "Amount can't be edited because you are not the creator."
    );
  };

  const showCreatorOnlyRemarkEditWarning = () => {
    themedAlert(
      'Edit Restricted',
      "Remark can't be edited because you are not the creator."
    );
  };

  const canDeleteTransaction = txn => {
    if (!txn) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    return txn.id !== null && txn.id !== undefined;
  };

  const isOwnLedgerTransaction = txn => {
    if (!txn) {
      return false;
    }
    const txnSourceUserId = String(txn.source_user_id || '').trim();
    if (!txnSourceUserId) {
      return true;
    }
    const currentUserIdValue = String(currentUserId || '').trim();
    if (currentUserIdValue && txnSourceUserId === currentUserIdValue) {
      return true;
    }
    const contactUserIds = new Set(
      [
        appUser?.firebaseUid,
        appUser?.userId,
        contact?.firebaseUid,
        contact?.userId,
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean),
    );
    if (contactUserIds.has(txnSourceUserId)) {
      return false;
    }
    if (!currentUserIdValue) {
      return false;
    }
    return false;
  };

  const canSyncTransaction = txn => {
    if (!txn) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    if (!syncAllEntriesEnabled || syncingSelectedEntry) {
      return false;
    }
    return true;
  };

  const parseSourceOriginKey = value => {
    const raw = String(value || '').trim();
    if (!raw) {
      return null;
    }
    const separatorIndex = raw.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex >= raw.length - 1) {
      return null;
    }
    const sourceId = raw.slice(0, separatorIndex).trim();
    const originId = raw.slice(separatorIndex + 1).trim();
    if (!sourceId || !originId) {
      return null;
    }
    return {sourceId, originId};
  };

  const resolveCanonicalOriginForTransaction = async txn => {
    const parsedOrigin = parseSourceOriginKey(txn?.source_origin_key);
    if (parsedOrigin?.sourceId && parsedOrigin?.originId) {
      return {
        canonicalSourceUserId: parsedOrigin.sourceId,
        canonicalOriginTxnId: parsedOrigin.originId,
      };
    }

    const fallbackSourceUserId = String(
      currentUserId || (await AsyncStorage.getItem('firebaseUid')) || '',
    ).trim();
    const fallbackOriginTxnId = String(txn?.id || '').trim();

    if (!fallbackSourceUserId || !fallbackOriginTxnId) {
      return null;
    }

    return {
      canonicalSourceUserId: fallbackSourceUserId,
      canonicalOriginTxnId: fallbackOriginTxnId,
    };
  };

  const encodeCanonicalOriginTxnId = (sourceUserIdValue, originTxnIdValue) => {
    return `canon#${encodeURIComponent(sourceUserIdValue)}#${encodeURIComponent(originTxnIdValue)}`;
  };

  const parseLedgerEditHistory = txn => {
    try {
      const raw = String(txn?.edit_history || '').trim();
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0);
    } catch (error) {
      return [];
    }
  };

  const openTransactionMenu = txn => {
    if (!txn || Number(txn.is_deleted) === 1) {
      return;
    }
    setSelectedTransaction(txn);
    setOptionsVisible(true);
  };

  const closeTransactionMenu = () => {
    setOptionsVisible(false);
    setSelectedTransaction(null);
  };

  const handleEditAmount = () => {
    if (!selectedTransaction || !canEditTransaction(selectedTransaction)) {
      return;
    }
    const currentAbs = Math.abs(Number(selectedTransaction.amount) || 0);
    setEditAmount(String(currentAbs || ''));
    setEditAmountVisible(true);
    setOptionsVisible(false);
  };

  const handleEditRemark = () => {
    if (!selectedTransaction || !canEditRemarkTransaction(selectedTransaction)) {
      return;
    }
    setEditRemark(selectedTransaction.note || '');
    setEditRemarkVisible(true);
    setOptionsVisible(false);
  };

  const handleSaveEditAmount = async () => {
    if (!selectedTransaction) {
      return;
    }
    const parsed = parseFloat(String(editAmount).replace(/[^0-9.]/g, ''));
    if (!parsed || parsed <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return;
    }
    if (!canEditTransaction(selectedTransaction)) {
      showToast('Edit not allowed.', 'error');
      return;
    }
    const nextAmount = selectedTransaction.type === 'paid' ? parsed : parsed;
    const nextEditCount = Number(selectedTransaction.edit_count || 0) + 1;
    setLoading(true);
    try {
      await updateLedgerTransactionAmount(selectedTransaction.id, nextAmount, nextEditCount);

      try {
        if (syncAllEntriesEnabled && contact?.recordID) {
          const resolvedSourceUserId = String(
            currentUserId || (await AsyncStorage.getItem('firebaseUid')) || '',
          ).trim();
          const resolvedPeerUserId = await chatResolvePeerUserIdForSync();
          if (resolvedSourceUserId && resolvedPeerUserId) {
            const updatedTxn = getLedgerTransactionById(selectedTransaction.id) || selectedTransaction;
            const canonicalOrigin = await resolveCanonicalOriginForTransaction(updatedTxn);
            if (
              canonicalOrigin?.canonicalSourceUserId &&
              canonicalOrigin?.canonicalOriginTxnId
            ) {
              const encodedOriginTxnId = encodeCanonicalOriginTxnId(
                canonicalOrigin.canonicalSourceUserId,
                canonicalOrigin.canonicalOriginTxnId,
              );
              const syncEvent = buildLedgerCreateEvent({
                originTxnId: encodedOriginTxnId,
                sourceUserId: resolvedSourceUserId,
                peerUserId: resolvedPeerUserId,
                contactRecordId: contact.recordID,
                type: updatedTxn.type === 'get' ? 'get' : 'paid',
                amount: Math.abs(Number(updatedTxn.amount || 0)),
                note: String(updatedTxn.note || ''),
                editHistory: parseLedgerEditHistory(updatedTxn),
                timestamp: Number(updatedTxn.transaction_date || Date.now()) || Date.now(),
                createdAt: Number(updatedTxn.created_at || 0) || Date.now(),
              });
              await sendLedgerEvent({
                ...syncEvent,
                idempotencyKey: `ledger-edit:${resolvedSourceUserId}:${canonicalOrigin.canonicalSourceUserId}:${canonicalOrigin.canonicalOriginTxnId}:${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 8)}`,
                syncMode: 'single_entry',
                silentSync: true,
              });
            }
          }
        }
      } catch (syncError) {
        console.error('[LEDGER_SYNC] failed to sync edited amount event:', syncError);
      }

      setEditAmountVisible(false);
      setEditAmount('');
      setSelectedTransaction(null);
      await loadData();
    } catch (error) {
      console.error('Failed to update amount:', error);
      themedAlert('Error', 'Failed to update amount. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditRemark = async () => {
    if (!selectedTransaction) {
      return;
    }
    if (!canEditRemarkTransaction(selectedTransaction)) {
      showToast('Edit not allowed.', 'error');
      return;
    }
    setLoading(true);
    try {
      await updateLedgerTransactionNote(selectedTransaction.id, editRemark.trim());
      setEditRemarkVisible(false);
      setEditRemark('');
      setSelectedTransaction(null);
      await loadData();
    } catch (error) {
      console.error('Failed to update remark:', error);
      themedAlert('Error', 'Failed to update remark. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = () => {
    if (!selectedTransaction || !canDeleteTransaction(selectedTransaction)) {
      return;
    }
    themedAlert('Delete Entry', 'Are you sure you want to delete this entry?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await deleteTransaction(selectedTransaction.id);
            closeTransactionMenu();
            await loadData();
          } catch (error) {
            console.error('Failed to delete transaction:', error);
            themedAlert('Error', 'Failed to delete entry.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleSyncThisEntryWithUser = async () => {
    const txn = selectedTransaction;
    if (!txn) {
      return;
    }
    if (!contact?.recordID) {
      showToast('Contact information not found', 'error');
      return;
    }
    if (!syncAllEntriesEnabled) {
      showToast('Turn on sync enteries with user first', 'error');
      return;
    }
    const amountValue = Math.abs(Number(txn.amount || 0));
    if (!amountValue) {
      showToast('Invalid transaction amount', 'error');
      return;
    }

    setSyncingSelectedEntry(true);
    try {
      const resolvedSourceUserId = String(
        currentUserId || (await AsyncStorage.getItem('firebaseUid')) || '',
      ).trim();
      if (!resolvedSourceUserId) {
        throw new Error('Current user not found');
      }

      const resolvedPeerUserId = await chatResolvePeerUserIdForSync();
      if (!resolvedPeerUserId) {
        throw new Error('Could not resolve contact app user');
      }

      const timestamp =
        Number(txn.transaction_date || txn.created_at || Date.now()) || Date.now();
      const entryType = txn.type === 'get' ? 'get' : 'paid';
      const canonicalOrigin = await resolveCanonicalOriginForTransaction(txn);
      if (!canonicalOrigin?.canonicalSourceUserId || !canonicalOrigin?.canonicalOriginTxnId) {
        throw new Error('Unable to resolve canonical origin');
      }
      const encodedOriginTxnId = encodeCanonicalOriginTxnId(
        canonicalOrigin.canonicalSourceUserId,
        canonicalOrigin.canonicalOriginTxnId,
      );
      const manualSyncNonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const manualIdempotencyKey = `ledger-manual:${resolvedSourceUserId}:${canonicalOrigin.canonicalSourceUserId}:${canonicalOrigin.canonicalOriginTxnId}:${manualSyncNonce}`;

      const eventPayload = {
        ...buildLedgerCreateEvent({
          originTxnId: encodedOriginTxnId,
          sourceUserId: resolvedSourceUserId,
          peerUserId: resolvedPeerUserId,
          contactRecordId: contact.recordID,
          type: entryType,
          amount: amountValue,
          note: String(txn.note || ''),
          editHistory: parseLedgerEditHistory(txn),
          timestamp,
          createdAt: Number(txn.created_at || 0) || Date.now(),
        }),
        idempotencyKey: manualIdempotencyKey,
        syncMode: 'single_entry',
        silentSync: true,
      };

      const result = await sendLedgerEvent(eventPayload, {withResult: true});
      closeTransactionMenu();

      if (result?.delivered) {
        showToast('Entry synced with user', 'success');
      } else if (result?.queued) {
        showToast('Entry queued for sync', 'success');
      } else if (result?.skipped && result?.reason === 'sync_disabled') {
        showToast('Sync is disabled for this contact', 'error');
      } else {
        showToast('Sync not confirmed. Please retry.', 'error');
      }
    } catch (error) {
      console.error('Failed to sync selected transaction:', error);
      showToast('Failed to sync this entry', 'error');
    } finally {
      setSyncingSelectedEntry(false);
    }
  };

  const formatTimeLabel = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isBackdatedTransaction = txn => {
    const transactionDate = Number(txn?.transaction_date || 0);
    const createdAt = Number(txn?.created_at || 0);
    if (!Number.isFinite(transactionDate) || transactionDate <= 0) {
      return false;
    }
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      return false;
    }
    return new Date(transactionDate).toDateString() !== new Date(createdAt).toDateString();
  };

  const balanceAfterById = useMemo(() => {
    const map = {};
    let running = 0;
    const ordered = [...(transactions || [])].sort(
      (a, b) => (a.transaction_date || 0) - (b.transaction_date || 0)
    );
    ordered.forEach(txn => {
      if (Number(txn.is_deleted) === 1) {
        map[txn.id] = running;
        return;
      }
      const amountValue = Number(txn.amount) || 0;
      const isPaid = txn.type === 'paid';
      running += isPaid ? amountValue : -amountValue;
      map[txn.id] = running;
    });
    return map;
  }, [transactions]);

  const getMessageId = useCallback(message => {
    const resolvedId = message?.message_id || message?.id;
    return String(resolvedId || '').trim();
  }, []);

  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }
    setShouldHideActionButtons(false);
    chatInputRef.current?.blur?.();
    Keyboard.dismiss();
  }, [isSelectionMode]);

  useEffect(() => {
    const timelineCount = timelineForList.length;
    const appUserEmptyReady =
      isAppUser === true &&
      !loadingChat &&
      hasLoadedTimeline &&
      Boolean(conversationId);
    const nonAppUserEmptyReady =
      isAppUser === false &&
      hasLoadedTimeline;
    const emptyVisible =
      timelineCount === 0 && (appUserEmptyReady || nonAppUserEmptyReady);

    if (emptyVisible && !emptyVisibleRef.current) {
      emptyVisibleRef.current = true;
      perfLog('render:empty-visible', {
        contactId: String(contact?.recordID || ''),
        timelineCount,
        isAppUser,
        loadingChat,
        hasLoadedTimeline,
        conversationId: conversationId || null,
        sinceMountMs: Date.now() - screenOpenAtRef.current,
      });
    }

    if (!emptyVisible && emptyVisibleRef.current) {
      perfLog('render:empty-hidden', {
        contactId: String(contact?.recordID || ''),
        timelineCount,
        isAppUser,
        loadingChat,
        hasLoadedTimeline,
        conversationId: conversationId || null,
        sinceMountMs: Date.now() - screenOpenAtRef.current,
      });
      emptyVisibleRef.current = false;
    }

    if (timelineCount > 0 && !firstDataVisibleRef.current) {
      firstDataVisibleRef.current = true;
      perfLog('render:first-data-visible', {
        contactId: String(contact?.recordID || ''),
        timelineCount,
        isAppUser,
        loadingChat,
        hasLoadedTimeline,
        conversationId: conversationId || null,
        sinceMountMs: Date.now() - screenOpenAtRef.current,
      });
    }
  }, [
    timelineForList.length,
    isAppUser,
    loadingChat,
    hasLoadedTimeline,
    conversationId,
    contact?.recordID,
  ]);

  const renderChatMessage = (message, userId, showDate) => {
    const messageId = getMessageId(message);
    return (
      <LedgerMessageBubble
        messageId={messageId}
        timestamp={message.timestamp}
        text={message.message_text}
        deliveryStatusValue={message.delivery_status}
        onRetry={retryChatMessage}
        ownerId={message.sender_id}
        receiverId={message.receiver_id}
        conversationId={message.conversation_id || conversationId}
        isSent={message.sender_id === userId}
        isSelected={Boolean(messageId && selectedMessageIds[messageId])}
        isSelectionMode={isSelectionMode}
        showDate={showDate}
        styles={styles}
        colors={colors}
        enterSelectionMode={enterSelectionMode}
        toggleMessageSelection={toggleMessageSelection}
      />
    );
  };

  const renderTimelineItem = (item) => {
    if (!item) {
      return null;
    }

    if (item.type === 'message') {
      return renderChatMessage(item.data, currentUserId, item.showDate);
    }

    const transaction = item.data;
    if (!transaction) {
      return null;
    }

    const amountValue = Number(transaction.amount) || 0;
    const isPaid = transaction.type === 'paid';
    const isDeleted = Number(transaction.is_deleted) === 1;
    const isOwnTransaction = isOwnLedgerTransaction(transaction);
    const ownerBadgeLabel = isOwnTransaction ? 'You' : getContactFirstName();
    const hasSyncedTag = String(transaction.sync_tag || '').toLowerCase() === 'synced';
    const hasBackdatedTag = isBackdatedTransaction(transaction);
    const editHistory = parseLedgerEditHistory(transaction);
    const createdOnLabel = hasBackdatedTag
      ? formatDateLabel(transaction.created_at)
      : '';

    return (
      <View>
        {item.showDate && (
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>
              {formatDateLabel(transaction.transaction_date)}
            </Text>
          </View>
        )}
        <TapEffect
          style={[styles.chatRow, isPaid && styles.chatRowDebit]}
          {...getDeletedTapEffectProps(
            isDeleted,
            () => openTransactionMenu(transaction),
          )}
          delayLongPress={250}>
          <View
            style={[
              styles.chatBubble,
              isPaid ? styles.chatBubbleDebit : styles.chatBubbleCredit,
              isDeleted && deletedUiStyles.bubble,
            ]}>
            <View style={styles.chatHeader}>
              <View
                style={[
                  styles.chatIcon,
                  isPaid && styles.chatIconDebit,
                  isDeleted && deletedUiStyles.iconContainer,
                ]}>
                <Icon
                  name={isPaid ? 'arrow-up' : 'arrow-down'}
                  size={16}
                  color={getDeletedIconColor(
                    isDeleted,
                    isPaid ? '#EF4444' : '#10B981',
                  )}
                />
              </View>
              <Text
                style={withDeletedStyle(
                  isDeleted,
                  [styles.chatAmount, isPaid && styles.chatAmountDebit],
                  deletedUiStyles.amount,
                )}>
                {`${isPaid ? '-' : '+'} ${formatCurrency(amountValue)}`}
              </Text>
              <View style={styles.chatHeaderRight}>
                <View style={styles.chatHeaderMetaRow}>
                  <View
                    style={withDeletedStyle(
                      isDeleted,
                      [
                        styles.ownerBadge,
                        isOwnTransaction ? styles.ownerBadgeYou : styles.ownerBadgeOther,
                      ],
                      deletedUiStyles.mutedBadge,
                    )}>
                    <Text
                      style={withDeletedStyle(
                        isDeleted,
                        [
                          styles.ownerBadgeText,
                          isOwnTransaction
                            ? styles.ownerBadgeTextYou
                            : styles.ownerBadgeTextOther,
                        ],
                        deletedUiStyles.mutedText,
                      )}>
                      {ownerBadgeLabel}
                    </Text>
                  </View>
                  <Text style={styles.chatTime}>
                    {formatTimeLabel(transaction.transaction_date)}
                  </Text>
                </View>
                {hasSyncedTag ? (
                  <View
                    style={withDeletedStyle(
                      isDeleted,
                      [styles.syncedTagBadge],
                      deletedUiStyles.mutedBadge,
                    )}>
                    <Text
                      style={withDeletedStyle(
                        isDeleted,
                        [styles.syncedTagText],
                        deletedUiStyles.mutedText,
                      )}>
                      synced
                    </Text>
                  </View>
                ) : null}
                {renderDeletedBadge(isDeleted)}
                {hasBackdatedTag ? (
                  <View
                    style={withDeletedStyle(
                      isDeleted,
                      [styles.backdatedTagBadge],
                      deletedUiStyles.mutedBadge,
                    )}>
                    <Text
                      style={withDeletedStyle(
                        isDeleted,
                        [styles.backdatedTagText],
                        deletedUiStyles.mutedText,
                      )}>
                      backdated
                    </Text>
                  </View>
                ) : null}
                {hasBackdatedTag ? (
                  <View style={styles.backdatedMetaWrap}>
                    <Text
                      style={withDeletedStyle(
                        isDeleted,
                        [styles.backdatedCreatedOnText],
                        deletedUiStyles.mutedMetaText,
                      )}>
                      {`created on ${createdOnLabel}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            {isDeleted ? (
              renderDeletedNote(isDeleted)
            ) : transaction.note ? (
              <Text style={styles.chatRemark}>{transaction.note}</Text>
            ) : null}
            {!isDeleted && editHistory.length > 1 ? (
              <Text style={styles.editHistoryText}>
                {`edited amount: ${editHistory
                  .map(value => formatCurrency(Math.abs(Number(value) || 0)))
                  .join(' -> ')}`}
              </Text>
            ) : null}
          </View>
          <View style={[styles.chatMeta, isPaid && styles.chatMetaDebit]}>
            <Text style={styles.chatBalance}>
              {formatSignedBalance(balanceAfterById[transaction.id] || 0)}
            </Text>
          </View>
        </TapEffect>
      </View>
    );
  };

  const shouldShowEmptyHistory =
    !timelineLoading &&
    timelineForList.length === 0 &&
    ((isAppUser === true &&
      hasLoadedTimeline &&
      !loadingChat &&
      Boolean(conversationId)) ||
      (isAppUser === false && hasLoadedTimeline));
  const headerAvatarUri = String(
    contact?.thumbnailPath || appUser?.photoURL || appUser?.photo_url || ''
  ).trim();
  const contactStructuredName = [contact?.givenName, contact?.familyName].filter(Boolean).join(' ').trim();
  const isEmailLike = s => Boolean(s) && String(s).includes('@');
  const isUsernameLike = s => Boolean(s) && !String(s).includes(' ') && String(s) === String(s).toLowerCase() && String(s).length > 5;
  const appUserDisplayName = String(appUser?.displayName || '').trim();
  const contactNameForInitial = contactStructuredName
    || (!isEmailLike(contact?.savedName) && !isUsernameLike(contact?.savedName) && contact?.savedName)
    || (!isEmailLike(contact?.displayName) && !isUsernameLike(contact?.displayName) && contact?.displayName)
    || (!isEmailLike(appUserDisplayName) && appUserDisplayName)
    || '?';
  const headerInitial = (contactNameForInitial.charAt(0) || '?').toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
      {/* Header + Totals */}
      <TexturedSurface
        style={[
          styles.headerBlock,
          {
            paddingTop: spacing.sm + insets.top,
          },
        ]}>
        <View style={styles.headerRow} onLayout={handleHeaderLayout}>
          {isSelectionMode ? (
            <LedgerSelectionToolbar
              styles={styles}
              selectedCount={selectedCount}
              headerTexture={headerTexture}
              onClearSelection={clearSelectionMode}
              onCopySelected={handleCopySelectedMessages}
              onDeleteSelected={handleDeleteSelectedMessages}
            />
          ) : (
            <LedgerContactHeader
              styles={styles}
              headerTexture={headerTexture}
              onBackPress={() => {
                perfLog('back:header-press', {
                  shouldHideActionButtons,
                });
                chatInputRef.current?.blur?.();
                Keyboard.dismiss();
                setShouldHideActionButtons(false);
                handleDirectBackNavigation();
              }}
              onProfilePress={openContactProfileScreen}
              onMenuPress={handleHeaderMenuPress}
              headerAvatarUri={headerAvatarUri}
              headerInitial={headerInitial}
              contactName={getContactName()}
              headerPhone={headerPhone}
              menuButtonRef={menuButtonRef}
            />
          )}
        </View>
      </TexturedSurface>
      {!isSelectionMode && (
      <LedgerMetricsBar
        styles={styles}
        balance={balance}
        formatCurrency={formatCurrency}
        formatSignedBalance={formatSignedBalance}
      />
      )}
      
      <LedgerConversationTimeline
        listRef={listRef}
        timelineForList={timelineForList}
        styles={styles}
        listKeyboardSpacerHeight={listKeyboardSpacerHeight}
        footerSpacing={spacing.md}
        shouldShowEmptyHistory={shouldShowEmptyHistory}
        hasMoreHistory={hasMoreHistory}
        loadingOlderHistory={loadingOlderHistory}
        onLoadOlder={loadOlderHistory}
        renderTimelineItem={renderTimelineItem}
      />

      {/* Bottom Buttons */}
      {!shouldHideActionButtons && !isSelectionMode && (
        <LedgerBottomActions
          styles={styles}
          bottomPadding={spacing.md + insets.bottom}
          onPaidPress={() => {
            perfLog('actions:paid-press', {
              shouldHideActionButtons,
            });
            openTransactionEntryScreen('paid');
          }}
          onGetPress={() => {
            perfLog('actions:get-press', {
              shouldHideActionButtons,
            });
            openTransactionEntryScreen('get');
          }}
        />
      )}

      {/* Chat Input (only if app user) */}
      {isAppUser === true && !isSelectionMode && (
        <ChatComposer
          styles={styles}
          insetsBottom={insets.bottom}
          chatInputRef={chatInputRef}
          draftRef={chatDraftRef}
          ownerId={currentUserId}
          receiverId={appUser?.firebaseUid || appUser?.userId}
          conversationId={conversationId}
          sendAllowed={Boolean(currentUserId && conversationId && appUser && isInstalledAppUser(appUser))}
          onSendPress={chatHandleSendMessage}
          avoidOffset={chatInputAvoidOffset}
          onComposerLayout={handleComposerLayout}
          onSoftInputHeightChange={event => {
            handleSoftInputHeightChange(event);
            const nextHeight = Math.max(0, event?.nativeEvent?.softInputHeight || 0);
            if (nextHeight > 0) {
              scrollToLatest('softinput-height-change');
            } else {
              setShouldHideActionButtons(false);
            }
          }}
          onSoftInputShown={() => {
            handleSoftInputShown();
            scrollToLatest('softinput-shown-sync', 60);
          }}
          onSoftInputHidden={handleSoftInputHidden}
          onInputTouchStart={handleInputTouchStart}
          onInputFocus={handleInputFocus}
          onInputBlur={handleInputBlur}
        />
      )}

      {/* Invite Banner (if not app user) */}
      {isAppUser === false && (
        <View style={[styles.inviteBanner, {paddingBottom: spacing.md + insets.bottom}]}>
          <Text style={styles.inviteText}>
            Invite {getContactName()} to enable chat feature.
          </Text>
          <TouchableOpacity style={styles.inviteButton} onPress={handleInviteContact}>
            <Text style={styles.inviteButtonText}>Invite</Text>
          </TouchableOpacity>
        </View>
      )}

      <DropdownPopup
        visible={headerMenuVisible}
        onClose={closeHeaderMenu}
        cardStyle={[
          styles.menuCard,
          {
            width: menuWidth,
            top: menuTop,
            left: menuLeft,
            opacity: headerMenuAnim,
            transform: [
              {
                translateY: headerMenuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-14, 0],
                }),
              },
            ],
          },
        ]}>
            <View style={styles.menuRow}>
              <View style={styles.menuItemLeft}>
                <Icon name="sync-outline" size={22} color={colors.text.primary} />
                <Text style={styles.menuRowLabel}>sync enteries with user</Text>
              </View>
              <ToggleSwitch
                value={syncAllEntriesEnabled}
                onValueChange={toggleSyncAllEntries}
                trackColor={{false: colors.border, true: colors.success}}
                thumbColor={syncAllEntriesEnabled ? colors.white : colors.surface}
              />
            </View>
            <View style={styles.menuDivider} />
            <View style={styles.menuStateRow}>
              <Text style={styles.menuStateLabel}>sync mode</Text>
              <Text style={styles.menuStateValue}>
                {syncAllEntriesEnabled ? 'ON' : 'OFF'}
              </Text>
            </View>
      </DropdownPopup>

      {/* Entry Options */}
      <Modal
        visible={optionsVisible}
        transparent
        animationType="none"
        onRequestClose={closeTransactionMenu}>
        <Animated.View
          style={[styles.optionsOverlay, {opacity: optionsOverlayOpacity}]}
        >
          <TouchableOpacity
            style={styles.optionsOverlayTouchable}
            activeOpacity={1}
            onPress={closeTransactionMenu}
          />
          <Animated.View
            style={[
              styles.optionsContainer,
              {transform: [{translateY: optionsContentTranslateY}]},
            ]}>
            <View style={styles.optionsHeader}>
              <Text style={styles.optionsTitle}>
                {selectedTransaction
                  ? `Options for ${formatCurrency(
                      Math.abs(Number(selectedTransaction.amount) || 0)
                    )}`
                  : 'Options'}
              </Text>
            </View>
            <View style={styles.optionRowWithWarning}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  styles.optionButtonTightRight,
                  !canEditTransaction(selectedTransaction) &&
                    styles.optionButtonDisabled,
                ]}
                disabled={!canEditTransaction(selectedTransaction)}
                onPress={handleEditAmount}>
                <View style={styles.optionItemRow}>
                  <Icon
                    name="create-outline"
                    size={20}
                    color={
                      canEditTransaction(selectedTransaction)
                        ? colors.text.primary
                        : colors.text.light
                    }
                  />
                  <Text
                    style={[
                      styles.optionText,
                      !canEditTransaction(selectedTransaction) &&
                        styles.optionTextDisabled,
                    ]}>
                    Edit Amount
                  </Text>
                </View>
              </TouchableOpacity>
              {!canEditTransaction(selectedTransaction) &&
                isCreatorRestrictedEdit(selectedTransaction) ? (
                  <TouchableOpacity
                    style={styles.optionWarningButton}
                    onPress={showCreatorOnlyAmountEditWarning}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Icon name="information-circle" size={18} color={colors.warning} />
                  </TouchableOpacity>
                ) : null}
            </View>
            <View style={styles.optionRowWithWarning}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  styles.optionButtonTightRight,
                  !canEditRemarkTransaction(selectedTransaction) &&
                    styles.optionButtonDisabled,
                ]}
                disabled={!canEditRemarkTransaction(selectedTransaction)}
                onPress={handleEditRemark}>
                <View style={styles.optionItemRow}>
                  <Icon
                    name="chatbubble-ellipses-outline"
                    size={20}
                    color={
                      canEditRemarkTransaction(selectedTransaction)
                        ? colors.text.primary
                        : colors.text.light
                    }
                  />
                  <Text
                    style={[
                      styles.optionText,
                      !canEditRemarkTransaction(selectedTransaction) &&
                        styles.optionTextDisabled,
                    ]}>
                    Edit Remark
                  </Text>
                </View>
              </TouchableOpacity>
              {!canEditRemarkTransaction(selectedTransaction) &&
                isCreatorRestrictedEdit(selectedTransaction) ? (
                  <TouchableOpacity
                    style={styles.optionWarningButton}
                    onPress={showCreatorOnlyRemarkEditWarning}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Icon name="information-circle" size={18} color={colors.warning} />
                  </TouchableOpacity>
                ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.optionButton,
                !canSyncTransaction(selectedTransaction) &&
                  styles.optionButtonDisabled,
              ]}
              disabled={!canSyncTransaction(selectedTransaction)}
              onPress={handleSyncThisEntryWithUser}>
              <View style={styles.optionItemRow}>
                <Icon
                  name="sync-outline"
                  size={20}
                  color={
                    canSyncTransaction(selectedTransaction)
                      ? colors.primary
                      : colors.text.light
                  }
                />
                <Text
                  style={[
                    styles.optionText,
                    !canSyncTransaction(selectedTransaction) &&
                      styles.optionTextDisabled,
                  ]}>
                  {syncingSelectedEntry
                    ? 'Syncing entry...'
                    : 'sync this entry with user'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                styles.optionDelete,
                !canDeleteTransaction(selectedTransaction) &&
                  styles.optionButtonDisabled,
              ]}
              disabled={!canDeleteTransaction(selectedTransaction)}
              onPress={handleDeleteTransaction}>
              <View style={styles.optionItemRow}>
                <Icon
                  name="trash-outline"
                  size={20}
                  color={
                    canDeleteTransaction(selectedTransaction)
                      ? colors.error
                      : colors.text.light
                  }
                />
                <Text
                  style={[
                    styles.optionText,
                    styles.optionDeleteText,
                    !canDeleteTransaction(selectedTransaction) &&
                      styles.optionTextDisabled,
                  ]}>
                  Delete Entry
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, styles.optionButtonCancel]}
              onPress={closeTransactionMenu}>
              <View style={styles.optionItemRow}>
                <Icon name="close" size={20} color={colors.text.secondary} />
                <Text style={styles.optionTextCancel}>Cancel</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      <EditAmountModal
        visible={editAmountVisible}
        value={editAmount}
        onChangeText={setEditAmount}
        onSave={handleSaveEditAmount}
        onClose={() => setEditAmountVisible(false)}
        loading={loading}
      />

      <EditRemarkModalSheet
        visible={editRemarkVisible}
        onClose={() => {
          setEditRemarkVisible(false);
          setSelectedTransaction(null);
        }}
        value={editRemark}
        onChangeText={setEditRemark}
        onSave={handleSaveEditRemark}
        loading={loading}
      />

      {/* Transaction Modal */}
      <Modal
        visible={transactionModalVisible}
        transparent
        animationType="none"
        onRequestClose={closeTransactionModal}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeTransactionModal}
          />
          <Animated.View
            style={[
              styles.modalContainer,
              {transform: [{translateY: modalSlideAnim}]},
            ]}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>
                {transactionType === 'paid' ? 'Paid' : 'Get'}
              </Text>
              <TextInput
                ref={amountInputRef}
                style={styles.modalAmountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                editable={!loading}
                onSubmitEditing={() => noteInputRef.current?.focus()}
              />
              <Text style={styles.modalNoteLabel}>Note (Optional)</Text>
              <TextInput
                ref={noteInputRef}
                style={styles.modalNoteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note"
                placeholderTextColor={colors.text.light}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
              <TouchableOpacity
                style={[
                  styles.modalAddButton,
                  transactionType === 'paid'
                    ? styles.modalAddButtonPaid
                    : styles.modalAddButtonGet,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleAddTransaction}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalAddButtonText}>
                    {transactionType === 'paid'
                      ? 'Record Payment'
                      : 'Record Receipt'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      </View>
    </View>
  );
};

const createStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  headerBlock: {
    // Non-white fallback to avoid white flash before textured header paints.
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: headerTexture.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    marginBottom: 0,
  },
  backButton: {
    padding: 6,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(240,253,244,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  headerAvatarText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  headerTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
    textAlign: 'left',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: fontSize.small,
    color: 'rgba(240, 253, 244, 0.86)',
    textAlign: 'left',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  menuButton: {
    width: 34,
    height: 34,
    marginLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionHeaderTitle: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
  },
  selectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  selectionHeaderActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsSection: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.md,
    paddingBottom: spacing.md,
  },
  contactCard: {
    backgroundColor: colors.card,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.sm,
  },
  contactAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  contactAvatarText: {
    fontSize: 36,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  contactName: {
    fontSize: fontSize.xxlarge,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  contactPhone: {
    fontSize: fontSize.regular,
    color: colors.text.secondary,
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
  historySection: {
    marginTop: spacing.lg,
    marginBottom: 0,
  },
  chatList: {
    gap: spacing.sm,
  },
  datePill: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  datePillText: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
  },
  chatRow: {
    width: '100%',
    alignItems: 'flex-end',
    marginBottom: 0,
  },
  chatRowDebit: {
    alignItems: 'flex-start',
  },
  chatBubble: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    width: '72%',
  },
  chatBubbleCredit: {
    alignSelf: 'flex-end',
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chatBubbleDebit: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  chatHeaderRight: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 4,
  },
  chatHeaderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ownerBadgeYou: {
    backgroundColor: '#DBEAFE',
  },
  ownerBadgeOther: {
    backgroundColor: '#ECFCCB',
  },
  ownerBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
  },
  ownerBadgeTextYou: {
    color: '#1D4ED8',
  },
  ownerBadgeTextOther: {
    color: '#3F6212',
  },
  chatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatIconDebit: {
    backgroundColor: '#FEE2E2',
  },
  chatAmount: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: '#10B981',
    flex: 1,
    minWidth: 0,
  },
  chatAmountDebit: {
    color: '#EF4444',
  },
  chatTime: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  syncedTagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  syncedTagText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: '#166534',
    textTransform: 'lowercase',
  },
  backdatedMetaWrap: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    marginTop: 2,
    marginBottom: 4,
  },
  backdatedTagBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
  },
  backdatedTagText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: '#92400E',
    textTransform: 'lowercase',
  },
  backdatedCreatedOnText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: '#92400E',
    textTransform: 'lowercase',
    textAlign: 'right',
  },
  chatMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
  chatTickIcon: {
    marginTop: 1,
  },
  chatRemark: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    width: '100%',
    flexShrink: 1,
  },
  editHistoryText: {
    marginTop: 4,
    fontSize: fontSize.small,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  chatMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  chatMetaDebit: {
    alignItems: 'flex-start',
  },
  chatBalance: {
    marginTop: 6,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  chatMessageText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  chatBubbleSent: {
    backgroundColor: isDark ? hexToRgba(colors.primary, 0.26) : '#DCF8C6',
    alignSelf: 'flex-end',
  },
  // Sent-bubble status tones read by LedgerMessageBubble: sending/sent, delivered, read.
  chatBubbleSentPending: {
    backgroundColor: isDark ? hexToRgba('#94A3B8', 0.22) : '#ECEFF3',
    borderColor: isDark ? hexToRgba('#94A3B8', 0.35) : '#D5DAE1',
  },
  chatBubbleSentDelivered: {
    backgroundColor: isDark ? hexToRgba('#3B82F6', 0.3) : '#DCEBFF',
    borderColor: isDark ? hexToRgba('#3B82F6', 0.45) : '#B8D4FB',
  },
  chatBubbleSentRead: {
    backgroundColor: isDark ? hexToRgba('#22C55E', 0.28) : '#DCF8C6',
    borderColor: isDark ? hexToRgba('#22C55E', 0.42) : '#BFE8A3',
  },
  chatBubbleReceived: {
    backgroundColor: isDark ? colors.surface : '#E8E8E8',
    alignSelf: 'flex-start',
  },
  messageSelectableRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  messageSelectableRowSent: {
    justifyContent: 'flex-end',
  },
  messageSelectableRowReceived: {
    justifyContent: 'flex-start',
  },
  messageSelectionDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  messageSelectionDotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chatBubbleSelected: {
    borderColor: colors.primary,
    backgroundColor: isDark ? hexToRgba(colors.primary, 0.34) : '#E6F0FF',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.medium,
    maxHeight: 100,
    color: colors.text.primary,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: isDark ? colors.surfaceMuted : '#FFF3CD',
    borderTopWidth: 1,
    borderTopColor: isDark ? colors.border : '#FFE69C',
  },
  inviteText: {
    fontSize: fontSize.small,
    color: isDark ? colors.warning : '#856404',
    flex: 1,
  },
  inviteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: isDark ? colors.warning : '#FFC107',
    borderRadius: 8,
  },
  inviteButtonText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: isDark ? colors.black : '#856404',
  },
  emptyHistory: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    marginTop: 12,
  },
  bottomButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    zIndex: 999,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  optionsOverlayTouchable: {
    flex: 1,
  },
  optionsContainer: {
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
  optionsHeader: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionsTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  optionButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  optionButtonTightRight: {
    paddingRight: spacing.sm,
  },
  optionRowWithWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  optionWarningButton: {
    width: 26,
    height: 26,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuModalRoot: {
    flex: 1,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  menuCard: {
    position: 'absolute',
    backgroundColor: colors.modal,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: spacing.sm,
  },
  menuRowLabel: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
    marginRight: spacing.sm,
    marginLeft: 10,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  menuStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuStateLabel: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  menuStateValue: {
    fontSize: fontSize.small,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  optionText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  optionTextDisabled: {
    color: colors.text.light,
  },
  optionDelete: {
    backgroundColor: 'transparent',
  },
  optionDeleteText: {
    color: colors.error,
  },
  optionButtonDisabled: {
    opacity: 0.6,
  },
  optionButtonCancel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  optionTextCancel: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.medium,
    color: colors.text.secondary,
  },
  modalContainer: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    elevation: 5,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalContent: {
    position: 'relative',
    zIndex: 2,
  },
  transferDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  modalAmountInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    padding: 4,
    marginBottom: spacing.sm,
    gap: 8,
  },
  modeOption: {
    flex: 1,
  },
  modeButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 999,
  },
  modeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
  },
  modeButtonTextActive: {
    color: colors.text.primary,
  },
  setDefaultButton: {
    alignItems: 'center',
    paddingTop: 6,
  },
  setDefaultText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: '#10B981',
  },
  defaultBadge: {
    marginLeft: 6,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: '#166534',
  },
  amountFieldWrapper: {
    position: 'relative',
    zIndex: 5,
    marginBottom: spacing.md,
    overflow: 'visible',
  },
  amountFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.input,
    paddingLeft: 14,
  },
  amountInputBare: {
    flex: 75,
    fontSize: 22,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    paddingVertical: 14,
    paddingRight: 8,
  },
  amountFieldDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  amountAccountButton: {
    flex: 25,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amountAccountText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  floatingAccountList: {
    position: 'absolute',
    right: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.modal,
    zIndex: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  floatingAccountScroll: {
    maxHeight: 180,
  },
  floatingAccountItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingAccountItemSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  floatingAccountText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  floatingAccountTextSelected: {
    fontWeight: fontWeight.bold,
  },
  modalNoteLabel: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  modalNoteInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  modalAddButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalAddButtonPaid: {
    backgroundColor: '#EF4444',
  },
  modalAddButtonGet: {
    backgroundColor: '#10B981',
  },
  modalAddButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  promptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  promptBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  promptCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.modal,
    borderRadius: 12,
    padding: spacing.md,
    position: 'relative',
  },
  promptCloseButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    padding: 6,
  },
  promptTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  promptMessage: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  promptAccountName: {
    fontWeight: fontWeight.semibold,
  },
  promptAmount: {
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  promptRemember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  promptCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  promptCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  promptRememberText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    flex: 1,
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  promptButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  promptButtonSecondary: {
    backgroundColor: colors.surfaceMuted,
  },
  promptButtonPrimary: {
    backgroundColor: colors.primary,
  },
  promptButtonTextSecondary: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  promptButtonTextPrimary: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});

export default LedgerContactDetailScreen;

