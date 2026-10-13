// SCREEN: Expenses Account (ExpensesAccountDetailScreen)
﻿import React, {useCallback, useEffect, useRef, useState, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Dimensions,
  Animated,
  Easing,
  Keyboard,
  BackHandler,
  InteractionManager,
  PermissionsAndroid,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker/src/datetimepicker';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import ImageViewer from 'react-native-image-zoom-viewer';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {withAlpha} from '../utils/color';
import AccountDetailHeader from '../ui/AccountDetailHeader';
import BsCashCoin from '../components/icons/BsCashCoin';
import BottomSheet from '../components/BottomSheet';
import AmountEntryView from '../components/AmountEntryView';
import AmountActionButton from '../components/AmountActionButton';
import CTAButton from '../components/ui/ctabuttons';
import RenameAccountModal from '../components/RenameAccountModal';
import EditRemarkModalSheet from '../components/EditRemarkModalSheet';
import EditAmountModal from '../components/ui/editamount';
import DropdownPopup from '../components/ui/popups/DropdownPopup';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import {buildExpensesAccountMenuActions} from '../components/actions/accountMenuActions';
import {useUniversalToast} from '../hooks/useToast';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import TapEffect from '../components/ui/TapEffect';
import {calculateAccountsPeriodData} from '../services/accountsPeriodCore';
import {
  buildCreditAccountDetailMetrics,
  buildExpensesAccountDetailMetrics,
  buildSavingAccountDetailMetrics,
} from '../services/accountDetailMetrics';
import {
  loadAccountsPeriodState,
  clearAccountsPeriodState,
  saveAccountsPeriodState,
} from '../services/accountsPeriodStateStorage';
import {
  getDeletedTapEffectProps,
  withDeletedStyle,
  useDeletedUi,
} from '../components/ui/deleteui';
import {
  initTransactionsDatabase,
  createTransaction,
  deleteTransaction,
  getTransactionsByAccount,
  calculateAccountBalance,
  deleteTransactionsByAccount,
  updateTransactionAmount,
  updateTransactionRemark,
} from '../services/transactionsDatabase';
import {
  getActiveRecurringSchedules,
  SCHEDULE_EXECUTED_EVENT,
} from '../services/recurringDatabase';
import {
  canApplyAmountEditWithEntries,
  canWithdrawAtTimestampWithEntries,
  getBalanceAtTimestampWithEntries,
} from '../services/transactionTimeline';
import {parseEditHistory, buildDeleteHistory} from '../services/transactionEditHistory';
import {
  evaluateAccountTransactionDelete,
} from '../services/accountTransactionPolicy';
import {
  deleteAccount,
  getAllAccounts,
  getAccountsByType,
  renameAccount,
} from '../services/accountsDatabase';
import {getStrictEcoEnabled} from '../services/strictEcoService';
import {ensureEcoTransactionEntryAllowed} from '../services/strictEcoCoordinator';
import {createPerfTimer, perfLog, perfNow} from '../utils/perfLogger';

const QUICK_PERIODS = [
  {label: 'Last 5 Days', value: '1week'},
  {label: 'Last 10 Days', value: '10days'},
  {label: 'Last 15 Days', value: '15days'},
  {label: 'Last 30 Days', value: '30days'},
  {label: 'This Month', value: '1month'},
  {label: '3 Months', value: '3months'},
  {label: '6 Months', value: '6months'},
  {label: '1 Year', value: '1year'},
];
const VALID_QUICK_PERIODS = new Set(QUICK_PERIODS.map(item => item.value));

const MONTHS = [
  {label: 'January', value: 0},
  {label: 'February', value: 1},
  {label: 'March', value: 2},
  {label: 'April', value: 3},
  {label: 'May', value: 4},
  {label: 'June', value: 5},
  {label: 'July', value: 6},
  {label: 'August', value: 7},
  {label: 'September', value: 8},
  {label: 'October', value: 9},
  {label: 'November', value: 10},
  {label: 'December', value: 11},
];
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';

const MONTH_START_DAY_KEY = 'monthStartDay';
const EXPENSES_ACCOUNT_PERIOD_STATE_SCOPE = 'expensesAccount';
const DEFAULT_MONTH_START_DAY = 1;
const DASHBOARD_SHOW_SAVINGS_BALANCE_KEY = 'dashboard_show_savings_balance_in_net';
const SHOW_TRANSFER_ENTRIES_KEY_PREFIX = 'expensesShowTransferEntries';
const TRANSFER_LOG_VISIBLE_ENTRIES = 3;
const ACCOUNT_FOCUS_REFRESH_COOLDOWN_MS = 450;
const TRANSFER_VISIBILITY_CACHE_MAX_ENTRIES = 20;
const transferEntriesVisibilityCache = new Map();

let hasInitializedExpensesTransactionsDb = false;

const pruneTransferVisibilityCache = () => {
  while (transferEntriesVisibilityCache.size > TRANSFER_VISIBILITY_CACHE_MAX_ENTRIES) {
    const oldestKey = transferEntriesVisibilityCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    transferEntriesVisibilityCache.delete(oldestKey);
  }
};

const getCachedShowTransferEntries = account => {
  if (!account?.id) {
    return false;
  }
  if (String(account?.account_type || '').toLowerCase() === 'saving') {
    return false;
  }
  return transferEntriesVisibilityCache.get(String(account.id)) === true;
};

const setCachedShowTransferEntries = (accountId, value) => {
  if (!accountId) {
    return;
  }
  if (transferEntriesVisibilityCache.has(String(accountId))) {
    transferEntriesVisibilityCache.delete(String(accountId));
  }
  transferEntriesVisibilityCache.set(String(accountId), value === true);
  pruneTransferVisibilityCache();
};

const METRIC_ICON_SIZE = 28;
const METRIC_LABEL_GAP = 6;
const METRIC_LABEL_OFFSET = METRIC_ICON_SIZE + METRIC_LABEL_GAP;

const normalizeImageUri = uri => {
  if (!uri) {
    return '';
  }
  if (
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('file://') ||
    uri.startsWith('content://')
  ) {
    return uri;
  }
  return `file://${uri}`;
};

const stripFileScheme = uri => {
  if (!uri) {
    return '';
  }
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
};

const getFileExtension = path => {
  if (!path) {
    return 'jpg';
  }
  const cleanPath = stripFileScheme(path);
  const lastDot = cleanPath.lastIndexOf('.');
  if (lastDot === -1) {
    return 'jpg';
  }
  return cleanPath.slice(lastDot + 1) || 'jpg';
};

const getMimeType = extension => {
  const ext = String(extension || '').toLowerCase();
  if (ext === 'png') {
    return 'image/png';
  }
  if (ext === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
};

const renderAccountHeaderIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }
  return <Icon name={iconName || 'wallet-outline'} size={size} color={color} />;
};

const ExpensesAccountDetailScreen = ({route, navigation}) => {
  const insets = useSafeAreaInsets();
  const {isDark, colors} = useTheme();
  const {deletedUiStyles, renderDeletedBadge, renderDeletedNote} = useDeletedUi();
  const themeColors = colors;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const popupSurfaceColor = themeColors.modal || themeColors.card;
  const popupBorderColor = themeColors.border;
  const popupOverlayColor = themeColors.overlay || 'rgba(0,0,0,0.55)';
  const popupPrimaryText = themeColors.text?.primary || colors.text.primary;
  const popupSecondaryText = themeColors.text?.secondary || colors.text.secondary;
  const popupDangerColor = themeColors.error || '#B91C1C';
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
  const openedFromShortcut = route?.params?.openedFromShortcut === true;
  const initialAccount = route?.params?.account || {
    id: null,
    account_name: '',
    is_primary: 0,
  };
  const routeInitialShowTransferEntries =
    typeof route?.params?.initialShowTransferEntries === 'boolean'
      ? route.params.initialShowTransferEntries
      : null;
  const [account, setAccount] = useState(initialAccount);
  const isSavingAccount = account?.account_type === 'saving';
  const isCreditAccount = account?.account_type === 'credit';

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawReceiptUri, setWithdrawReceiptUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [entryDate, setEntryDate] = useState(new Date());
  const [showEntryDatePicker, setShowEntryDatePicker] = useState(false);
  const [showEntryTimePicker, setShowEntryTimePicker] = useState(false);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editAmountVisible, setEditAmountVisible] = useState(false);
  const [editRemarkVisible, setEditRemarkVisible] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [requestSelectVisible, setRequestSelectVisible] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestAccounts, setRequestAccounts] = useState([]);
  const [requestTarget, setRequestTarget] = useState(null);
  const [requestFieldHeight, setRequestFieldHeight] = useState(0);
  const [requestAccountWidth, setRequestAccountWidth] = useState(0);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferSelectVisible, setTransferSelectVisible] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferAccounts, setTransferAccounts] = useState([]);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferFieldHeight, setTransferFieldHeight] = useState(0);
  const [transferAccountWidth, setTransferAccountWidth] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({x: 0, y: 0, width: 36, height: 36});
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState(null);
  const [pendingWithdrawTotal, setPendingWithdrawTotal] = useState(null);
  const [quickPeriod, setQuickPeriod] = useState('1month');
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [addReceiptSheetVisible, setAddReceiptSheetVisible] = useState(false);
  const [receiptPreviewVisible, setReceiptPreviewVisible] = useState(false);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState('');
  const [deferredUiReady, setDeferredUiReady] = useState(false);
  const [filteredAdded, setFilteredAdded] = useState(0);
  const [filteredWithdrawals, setFilteredWithdrawals] = useState(0);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [hasAppliedFilter, setHasAppliedFilter] = useState(false);
  const [monthStartDay, setMonthStartDay] = useState(DEFAULT_MONTH_START_DAY);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showBalanceInDashboard, setShowBalanceInDashboard] = useState(true);
  const [showTransferEntries, setShowTransferEntries] = useState(() =>
    routeInitialShowTransferEntries ?? getCachedShowTransferEntries(initialAccount)
  );
  const [transferLogExpanded, setTransferLogExpanded] = useState(false);
  const [scheduledEntriesCount, setScheduledEntriesCount] = useState(0);

  const accountTypeLabel = useMemo(() => {
    const type = String(account?.account_type || '').toLowerCase();
    if (type === 'earning') {
      return 'Earning Account';
    }
    if (type === 'saving') {
      return 'Savings Account';
    }
    if (type === 'credit') {
      return 'Credit Card Account';
    }
    if (type === 'expenses') {
      return 'Expenses Account';
    }
    return 'Account';
  }, [account?.account_type]);
  const metricsLabels = useMemo(
    () =>
      isCreditAccount
        ? {
            earning: 'Paid Bill',
            expenses: 'Credit',
            net: totalBalance > 0 ? 'Advance' : 'Outstanding',
          }
        : isSavingAccount
        ? {
            earning: 'Savings',
            expenses: 'Transfer',
            net: 'Balance',
          }
        : !isSavingAccount
        ? {
            earning: 'Budget',
            expenses: 'Expenses',
            net: 'Balance',
          }
        : null,
    [isCreditAccount, isSavingAccount, totalBalance],
  );
  const {showUniversalToast} = useUniversalToast();
  const currencySymbol = useCurrencySymbol();
  const requestAmountInputRef = useRef(null);
  const withdrawAmountInputRef = useRef(null);
  const transferAmountInputRef = useRef(null);
  const renameInputRef = useRef(null);
  const menuButtonRef = useRef(null);
  const modalSlideAnim = useRef(new Animated.Value(0)).current;
  const optionsOverlayOpacity = useRef(new Animated.Value(0)).current;
  const optionsContentTranslateY = useRef(new Animated.Value(300)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;
  const transferSettingLoadInFlightRef = useRef(null);
  const lastScreenRefreshAtRef = useRef(0);
  const screenMountedAtRef = useRef(perfNow());
  const openPerfStartedAtRef = useRef(
    Number(route?.params?.__perfOpenStartedAt) || 0,
  );
  const firstHeaderLayoutLoggedRef = useRef(false);
  const firstListLayoutLoggedRef = useRef(false);
  const transitionOpenLoggedRef = useRef(false);
  const transitionCloseLoggedRef = useRef(false);
  const accountPerf = useCallback((event, payload = {}) => {
    perfLog('expenses-account-screen', event, payload);
  }, []);
  const {width: screenWidth} = Dimensions.get('window');
  const menuWidth = 280;
  const menuLeft = Math.min(
    Math.max(spacing.md, menuAnchor.x + menuAnchor.width - menuWidth),
    Math.max(spacing.md, screenWidth - menuWidth - spacing.md)
  );
  const menuTop = Math.max(spacing.md, menuAnchor.y + menuAnchor.height + spacing.xs);

  const isOverlayOpen =
    withdrawModalVisible ||
    transferModalVisible ||
    requestModalVisible ||
    editAmountVisible ||
    editRemarkVisible ||
    renameModalVisible ||
    optionsVisible ||
    menuVisible ||
    addReceiptSheetVisible ||
    receiptPreviewVisible;

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
  useEffect(() => {
    navigation.setOptions({gestureEnabled: !isOverlayOpen});
    return () => navigation.setOptions({gestureEnabled: true});
  }, [navigation, isOverlayOpen]);

  useEffect(() => {
    return () => {
      if (account?.id) {
        transferEntriesVisibilityCache.delete(String(account.id));
      }
    };
  }, [account?.id]);

  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent();
      const applyHide = () => {
        parent?.setOptions({
          tabBarStyle: {display: 'none'},
        });
      };
      const task = InteractionManager.runAfterInteractions(applyHide);
      return () => {
        task.cancel();
        parent?.setOptions({
          tabBarStyle: restoredTabBarStyle,
        });
      };
    }, [navigation, restoredTabBarStyle]),
  );

  useEffect(() => {
    const onBackPress = () => {
      if (withdrawModalVisible) {
        setWithdrawModalVisible(false);
        setWithdrawNote('');
        setWithdrawReceiptUri('');
        return true;
      }
      if (transferModalVisible) {
        setTransferModalVisible(false);
        setTransferNote('');
        setTransferSelectVisible(false);
        return true;
      }
      if (requestModalVisible) {
        setRequestModalVisible(false);
        setRequestNote('');
        return true;
      }
      if (optionsVisible) {
        closeOptionsMenu(true);
        return true;
      }
      if (menuVisible) {
        closeAccountMenu();
        return true;
      }
      if (editAmountVisible) {
        setEditAmountVisible(false);
        return true;
      }
      if (editRemarkVisible) {
        setEditRemarkVisible(false);
        return true;
      }
      if (renameModalVisible) {
        closeRenameModal();
        return true;
      }
      if (addReceiptSheetVisible) {
        setAddReceiptSheetVisible(false);
        return true;
      }
      if (receiptPreviewVisible) {
        closeReceiptPreview();
        return true;
      }
      if (openedFromShortcut) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Home');
        }
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [
    withdrawModalVisible,
    transferModalVisible,
    requestModalVisible,
    optionsVisible,
    menuVisible,
    editAmountVisible,
    editRemarkVisible,
    renameModalVisible,
    addReceiptSheetVisible,
    receiptPreviewVisible,
    openedFromShortcut,
    navigation,
  ]);

  const handleBackNavigation = useCallback(() => {
    accountPerf('back-navigation', {
      accountId: String(account?.id || ''),
      openedFromShortcut,
    });
    if (openedFromShortcut) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Home');
      }
      return;
    }
    navigation.goBack();
  }, [account?.id, accountPerf, navigation, openedFromShortcut]);

  const loadAccountDetails = useCallback(() => {
    const perf = createPerfTimer('expenses-account-screen', 'load-account-details');
    if (!account?.id) {
      perf.end({skipped: true});
      return;
    }
    const accounts = getAllAccounts();
    const updated = accounts.find(item => String(item.id) === String(account.id));
    if (!updated) {
      perf.end({missing: true, accountId: String(account.id)});
      return;
    }
    setAccount(updated);
    perf.end({accountId: String(account.id)});
  }, [account?.id]);

  const loadTransactions = useCallback(() => {
    const perf = createPerfTimer('expenses-account-screen', 'load-transactions');
    if (!account.id) {
      setTransactions([]);
      setTotalBalance(0);
      setHasLoadedTransactions(false);
      perf.end({skipped: true});
      return;
    }
    try {
      const txns = getTransactionsByAccount(account.id);
      setTransactions(txns);
      const updatedAccount = getAllAccounts().find(
        item => String(item.id) === String(account.id)
      );
      setTotalBalance(Number(updatedAccount?.balance) || 0);
      perf.end({
        accountId: String(account.id),
        txnsCount: txns.length,
        balance: Number(updatedAccount?.balance) || 0,
      });
    } catch (error) {
      console.error('Failed to load transactions:', error);
      perf.fail(error, {accountId: String(account.id)});
    } finally {
      setHasLoadedTransactions(true);
    }
  }, [account.id]);

  const loadScheduledEntriesCount = useCallback(() => {
    if (!account?.id) {
      setScheduledEntriesCount(0);
      return;
    }
    try {
      setScheduledEntriesCount(getActiveRecurringSchedules(account.id).length);
    } catch (error) {
      console.error('Failed to load scheduled entries count:', error);
      setScheduledEntriesCount(0);
    }
  }, [account?.id]);

  // Transfer entries visibility setting for expenses timeline.
  const loadShowTransferEntriesSetting = useCallback(async () => {
    if (!account?.id || isSavingAccount) {
      setShowTransferEntries(false);
      return;
    }
    const accountId = String(account.id);
    const cachedValue = getCachedShowTransferEntries(account);
    setShowTransferEntries(prev => (prev === cachedValue ? prev : cachedValue));
    if (transferSettingLoadInFlightRef.current === accountId) {
      return;
    }
    transferSettingLoadInFlightRef.current = accountId;
    try {
      const settingKey = `${SHOW_TRANSFER_ENTRIES_KEY_PREFIX}_${accountId}`;
      const savedValue = await AsyncStorage.getItem(settingKey);
      const nextValue = savedValue === '1';
      setCachedShowTransferEntries(account.id, nextValue);
      setShowTransferEntries(prev => (prev === nextValue ? prev : nextValue));
    } catch (error) {
      console.error('Failed to load transfer entries setting:', error);
      setShowTransferEntries(false);
    } finally {
      if (transferSettingLoadInFlightRef.current === accountId) {
        transferSettingLoadInFlightRef.current = null;
      }
    }
  }, [account?.id, isSavingAccount]);

  useEffect(() => {
    if (!hasInitializedExpensesTransactionsDb) {
      initTransactionsDatabase();
      hasInitializedExpensesTransactionsDb = true;
    }
    lastScreenRefreshAtRef.current = Date.now();
    loadAccountDetails();
    loadTransactions();
    loadScheduledEntriesCount();
    loadShowTransferEntriesSetting();
    loadMonthStartDay();
  }, [
    loadAccountDetails,
    loadTransactions,
    loadScheduledEntriesCount,
    loadShowTransferEntriesSetting,
  ]);

  useEffect(() => {
    setDeferredUiReady(false);
    let isActive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!isActive) {
        return;
      }
      requestAnimationFrame(() => {
        if (isActive) {
          setDeferredUiReady(true);
        }
      });
    });
    return () => {
      isActive = false;
      task.cancel();
    };
  }, [account?.id]);

  useEffect(() => {
    accountPerf('screen-mounted', {
      accountId: String(account?.id || ''),
      openedFromShortcut,
      sinceTapMs:
        openPerfStartedAtRef.current > 0
          ? Math.max(0, perfNow() - openPerfStartedAtRef.current)
          : null,
    });
    return () => {
      accountPerf('screen-unmounted', {
        accountId: String(account?.id || ''),
        aliveMs: Math.max(0, perfNow() - screenMountedAtRef.current),
      });
    };
  }, [account?.id, accountPerf, openedFromShortcut]);

  useEffect(() => {
    const unsubTransitionStart = navigation.addListener('transitionStart', e => {
      const isClosing = Boolean(e?.data?.closing);
      accountPerf(isClosing ? 'transition-close:start' : 'transition-open:start', {
        accountId: String(account?.id || ''),
        sinceTapMs:
          !isClosing && openPerfStartedAtRef.current > 0
            ? Math.max(0, perfNow() - openPerfStartedAtRef.current)
            : null,
      });
    });
    const unsubTransitionEnd = navigation.addListener('transitionEnd', e => {
      const isClosing = Boolean(e?.data?.closing);
      if (!isClosing && transitionOpenLoggedRef.current) {
        return;
      }
      if (isClosing && transitionCloseLoggedRef.current) {
        return;
      }
      if (isClosing) {
        transitionCloseLoggedRef.current = true;
      } else {
        transitionOpenLoggedRef.current = true;
      }
      accountPerf(isClosing ? 'transition-close:end' : 'transition-open:end', {
        accountId: String(account?.id || ''),
        sinceTapMs:
          !isClosing && openPerfStartedAtRef.current > 0
            ? Math.max(0, perfNow() - openPerfStartedAtRef.current)
            : null,
        sinceMountMs: Math.max(0, perfNow() - screenMountedAtRef.current),
      });
    });
    return () => {
      unsubTransitionStart();
      unsubTransitionEnd();
    };
  }, [account?.id, accountPerf, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const focusStartedAt = perfNow();
      const now = Date.now();
      if (now - lastScreenRefreshAtRef.current < ACCOUNT_FOCUS_REFRESH_COOLDOWN_MS) {
        accountPerf('focus-refresh:skipped-cooldown', {
          accountId: String(account?.id || ''),
          sinceLastRefreshMs: Math.max(0, now - lastScreenRefreshAtRef.current),
        });
        return;
      }
      lastScreenRefreshAtRef.current = now;
      loadAccountDetails();
      loadScheduledEntriesCount();
      loadShowTransferEntriesSetting();
      loadMonthStartDay();
      loadTransactions();
      accountPerf('focus-refresh:triggered', {
        accountId: String(account?.id || ''),
        dispatchMs: Math.max(0, perfNow() - focusStartedAt),
      });
    });
    return unsubscribe;
  }, [
    account?.id,
    accountPerf,
    navigation,
    loadAccountDetails,
    loadMonthStartDay,
    loadTransactions,
    loadScheduledEntriesCount,
    loadShowTransferEntriesSetting,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      SCHEDULE_EXECUTED_EVENT,
      payload => {
        const affectedAccountIds = Array.isArray(payload?.affectedAccountIds)
          ? payload.affectedAccountIds.map(Number)
          : [];
        if (!affectedAccountIds.includes(Number(account?.id))) {
          return;
        }
        lastScreenRefreshAtRef.current = Date.now();
        loadAccountDetails();
        loadScheduledEntriesCount();
        loadTransactions();
      },
    );
    return () => sub.remove();
  }, [
    account?.id,
    loadAccountDetails,
    loadScheduledEntriesCount,
    loadTransactions,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'expenses-account:refresh-transactions',
      payload => {
        if (payload?.accountId && String(payload.accountId) !== String(account?.id)) {
          return;
        }
        lastScreenRefreshAtRef.current = Date.now();
        loadAccountDetails();
        loadTransactions();
      }
    );
    return () => sub.remove();
  }, [account?.id, loadAccountDetails, loadTransactions]);

  useEffect(() => {
    const nextAccount = route?.params?.account;
    const nextInitialShowTransferEntries = route?.params?.initialShowTransferEntries;
    if (nextAccount?.id && String(nextAccount.id) !== String(account?.id)) {
      setAccount(nextAccount);
    }
    if (
      nextAccount?.id &&
      typeof nextInitialShowTransferEntries === 'boolean'
    ) {
      setCachedShowTransferEntries(nextAccount.id, nextInitialShowTransferEntries);
      setShowTransferEntries(nextInitialShowTransferEntries);
    }
  }, [route?.params?.account, route?.params?.initialShowTransferEntries, account?.id]);

  useEffect(() => {
    setTransferLogExpanded(false);
    setShowTransferEntries(getCachedShowTransferEntries(account));
    loadShowTransferEntriesSetting();
  }, [account, account?.id, loadShowTransferEntriesSetting]);




  useEffect(() => {
    if (
      withdrawModalVisible ||
      requestModalVisible ||
      transferModalVisible ||
      renameModalVisible ||
      editAmountVisible ||
      editRemarkVisible
    ) {
      Animated.timing(modalSlideAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      modalSlideAnim.setValue(0);
    }
  }, [
    withdrawModalVisible,
    requestModalVisible,
    transferModalVisible,
    renameModalVisible,
    editAmountVisible,
    editRemarkVisible,
    modalSlideAnim,
  ]);

  useEffect(() => {
    if (!requestModalVisible) {
      setRequestSelectVisible(false);
      return;
    }
    try {
      const earningAccounts = getAccountsByType('earning');
      setRequestAccounts(earningAccounts);
      if (earningAccounts.length === 0) {
        setRequestTarget(null);
        return;
      }
      setRequestTarget(current =>
        current && earningAccounts.some(item => item.id === current.id)
          ? current
          : earningAccounts[0]
      );
    } catch (error) {
      console.error('Failed to load earning accounts:', error);
      setRequestAccounts([]);
      setRequestTarget(null);
    }
  }, [requestModalVisible]);

  useEffect(() => {
    if (withdrawModalVisible || requestModalVisible || transferModalVisible) {
      setEntryDate(new Date());
      setShowEntryDatePicker(false);
      setShowEntryTimePicker(false);
    }
  }, [withdrawModalVisible, requestModalVisible, transferModalVisible]);

  useEffect(() => {
    if (!transferModalVisible) {
      setTransferSelectVisible(false);
      setTransferAmount('');
      setTransferNote('');
      return;
    }
    try {
      const accountsList = getAllAccounts().filter(item => {
        if (!item || item.id === account.id) {
          return false;
        }
        return item.account_type !== 'saving';
      });
      setTransferAccounts(accountsList);
      if (accountsList.length === 0) {
        setTransferTarget(null);
        return;
      }
      setTransferTarget(current =>
        current && accountsList.some(item => item.id === current.id)
          ? current
          : accountsList[0]
      );
    } catch (error) {
      console.error('Failed to load transfer accounts:', error);
      setTransferAccounts([]);
      setTransferTarget(null);
    }
  }, [transferModalVisible, account.id]);

  const focusWithdrawAmountInput = useCallback(() => {
    const focus = () => withdrawAmountInputRef.current?.focus();
    Keyboard.dismiss();
    focus();
    requestAnimationFrame(focus);
    InteractionManager.runAfterInteractions(focus);
    setTimeout(focus, 300);
    setTimeout(focus, 600);
  }, []);

  const focusRequestAmountInput = useCallback(() => {
    const focus = () => requestAmountInputRef.current?.focus();
    Keyboard.dismiss();
    focus();
    requestAnimationFrame(focus);
    InteractionManager.runAfterInteractions(focus);
    setTimeout(focus, 300);
    setTimeout(focus, 600);
  }, []);

  const focusTransferAmountInput = useCallback(() => {
    const focus = () => transferAmountInputRef.current?.focus();
    Keyboard.dismiss();
    focus();
    requestAnimationFrame(focus);
    InteractionManager.runAfterInteractions(focus);
    setTimeout(focus, 300);
    setTimeout(focus, 600);
  }, []);

  const focusRenameInput = useCallback(() => {
    const focus = () => renameInputRef.current?.focus();
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(focus);
      setTimeout(focus, 120);
    });
  }, []);

  const handleStickyHeaderLayout = useCallback(event => {
    const measuredHeight = Math.ceil(event?.nativeEvent?.layout?.height || 0);
    setHeaderHeight(previousHeight =>
      previousHeight === measuredHeight ? previousHeight : measuredHeight
    );
    if (!firstHeaderLayoutLoggedRef.current && measuredHeight > 0) {
      firstHeaderLayoutLoggedRef.current = true;
      accountPerf('first-header-layout', {
        accountId: String(account?.id || ''),
        headerHeight: measuredHeight,
        sinceTapMs:
          openPerfStartedAtRef.current > 0
            ? Math.max(0, perfNow() - openPerfStartedAtRef.current)
            : null,
        sinceMountMs: Math.max(0, perfNow() - screenMountedAtRef.current),
      });
    }
  }, [account?.id, accountPerf]);

  useEffect(() => {
    if (!withdrawModalVisible) {
      return;
    }
    const timer = setTimeout(() => {
      focusWithdrawAmountInput();
    }, 250);
    return () => clearTimeout(timer);
  }, [withdrawModalVisible, focusWithdrawAmountInput]);

  useEffect(() => {
    if (!requestModalVisible) {
      return;
    }
    const timer = setTimeout(() => {
      focusRequestAmountInput();
    }, 250);
    return () => clearTimeout(timer);
  }, [requestModalVisible, focusRequestAmountInput]);

  useEffect(() => {
    if (!transferModalVisible) {
      return;
    }
    const timer = setTimeout(() => {
      focusTransferAmountInput();
    }, 250);
    return () => clearTimeout(timer);
  }, [transferModalVisible, focusTransferAmountInput]);

  useEffect(() => {
    if (!renameModalVisible) {
      return;
    }
    const timer = setTimeout(() => {
      focusRenameInput();
    }, 250);
    return () => clearTimeout(timer);
  }, [renameModalVisible, focusRenameInput]);

  const ensureReceiptsDir = useCallback(async () => {
    const receiptsDir = `${RNFS.DocumentDirectoryPath}/receipts`;
    const exists = await RNFS.exists(receiptsDir);
    if (!exists) {
      await RNFS.mkdir(receiptsDir);
    }
    return receiptsDir;
  }, []);

  const persistReceiptImage = useCallback(
    async sourcePath => {
      if (!sourcePath) {
        return '';
      }
      const receiptsDir = await ensureReceiptsDir();
      const extension = getFileExtension(sourcePath);
      const fileName = `receipt_${Date.now()}.${extension}`;
      const destination = `${receiptsDir}/${fileName}`;
      await RNFS.copyFile(stripFileScheme(sourcePath), destination);
      return destination;
    },
    [ensureReceiptsDir]
  );

  const openReceiptPreview = useCallback(uri => {
    if (!uri) {
      return;
    }
    setReceiptPreviewUri(uri);
    setReceiptPreviewVisible(true);
  }, []);

  const closeReceiptPreview = useCallback(() => {
    setReceiptPreviewVisible(false);
    setReceiptPreviewUri('');
  }, []);

  const handlePickReceiptImage = useCallback(
    async source => {
      try {
        const pickerOptions = {
          mediaType: 'photo',
          selectionLimit: 1,
          quality: 0.5,
          maxWidth: 1200,
          maxHeight: 1200,
          saveToPhotos: false,
        };
        const result =
          source === 'camera'
            ? await launchCamera(pickerOptions)
            : await launchImageLibrary(pickerOptions);
        if (result?.didCancel) {
          return;
        }
        if (result?.errorCode) {
          throw new Error(result?.errorMessage || result?.errorCode);
        }
        const asset = result?.assets?.[0];
        const selectedUri = asset?.originalPath || asset?.uri || '';
        if (selectedUri) {
          setWithdrawReceiptUri(selectedUri);
        }
      } catch (error) {
        console.error('Failed to pick receipt image:', error);
        themedAlert('Error', 'Failed to open image picker.');
      }
    },
    []
  );

  const handleAddReceipt = useCallback(() => {
    setAddReceiptSheetVisible(true);
  }, []);

  const handleRemoveReceipt = useCallback(() => {
    setWithdrawReceiptUri('');
  }, []);

  const requestDownloadPermission = useCallback(async () => {
    if (Platform.OS !== 'android' || Platform.Version >= 29) {
      return true;
    }
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Storage permission required',
        message: 'Allow storage access to save bill photos to Downloads.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const downloadReceiptToDownloads = useCallback(
    async uri => {
      if (!uri) {
        return;
      }
      if (Platform.OS !== 'android') {
        showUniversalToast('Download not supported on this device.', 'error');
        return;
      }
      const sourcePath = stripFileScheme(uri);
      const extension = getFileExtension(sourcePath);
      const fileName = `savingo_${Date.now()}.${extension}`;
      const mimeType = getMimeType(extension);
      try {
        if (Platform.Version >= 29 && RNBlobUtil.MediaCollection?.copyToMediaStore) {
          await RNBlobUtil.MediaCollection.copyToMediaStore(
            {
              name: fileName,
              parentFolder: 'Download',
              mimeType,
            },
            'Download',
            sourcePath
          );
        } else {
          const permitted = await requestDownloadPermission();
          if (!permitted) {
            showUniversalToast('Storage permission denied.', 'error');
            return;
          }
          const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
          await RNBlobUtil.fs.cp(sourcePath, destPath);
        }
        showUniversalToast('Saved to Download.', 'success');
      } catch (error) {
        console.error('Failed to download receipt:', error);
        showUniversalToast('Failed to download image.', 'error');
      }
    },
    [requestDownloadPermission, showUniversalToast]
  );

  const renderReceiptPreviewHeader = useCallback(() => {
    return (
      <View style={styles.previewHeader}>
        <TouchableOpacity
          style={styles.previewHeaderButton}
          onPress={closeReceiptPreview}>
          <Icon name="close" size={22} color={colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.previewHeaderButton}
          onPress={() => downloadReceiptToDownloads(receiptPreviewUri)}>
          <Icon name="download-outline" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>
    );
  }, [closeReceiptPreview, downloadReceiptToDownloads, receiptPreviewUri]);

  const deleteReceiptFileIfPossible = useCallback(async uri => {
    if (!uri) {
      return;
    }
    const path = stripFileScheme(uri);
    if (!path || !path.startsWith(RNFS.DocumentDirectoryPath)) {
      return;
    }
    try {
      const exists = await RNFS.exists(path);
      if (exists) {
        await RNFS.unlink(path);
      }
    } catch (error) {
      console.warn('Failed to delete receipt image:', error);
    }
  }, []);

  const showAccountMenu = () => {
    setMenuVisible(true);
    requestAnimationFrame(() => {
      menuAnim.setValue(0);
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const openAccountMenu = () => {
    if (menuButtonRef.current?.measureInWindow) {
      menuButtonRef.current.measureInWindow((x, y, width, height) => {
        setMenuAnchor({x, y, width, height});
        showAccountMenu();
      });
      return;
    }
    showAccountMenu();
  };

  const closeAccountMenu = () => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
    });
  };

  const loadShowBalanceInDashboard = useCallback(async () => {
    try {
      const savedValue = await AsyncStorage.getItem(DASHBOARD_SHOW_SAVINGS_BALANCE_KEY);
      if (savedValue === null) {
        setShowBalanceInDashboard(true);
        return;
      }
      setShowBalanceInDashboard(savedValue === '1');
    } catch (error) {
      console.error('Failed to load dashboard savings visibility setting:', error);
      setShowBalanceInDashboard(true);
    }
  }, []);

  useEffect(() => {
    if (!menuVisible || !isSavingAccount) {
      return;
    }
    loadShowBalanceInDashboard();
  }, [menuVisible, isSavingAccount, loadShowBalanceInDashboard]);

  const handleToggleShowBalanceInDashboard = useCallback(
    async nextValue => {
      const previousValue = showBalanceInDashboard;
      setShowBalanceInDashboard(nextValue);
      try {
        await AsyncStorage.setItem(
          DASHBOARD_SHOW_SAVINGS_BALANCE_KEY,
          nextValue ? '1' : '0'
        );
      } catch (error) {
        console.error('Failed to save dashboard savings visibility setting:', error);
        setShowBalanceInDashboard(previousValue);
        showUniversalToast('Failed to update setting.', 'error');
      }
    },
    [showBalanceInDashboard, showUniversalToast]
  );

  const openTransactionMenu = txn => {
    setSelectedTransaction(txn);
    setOptionsVisible(true);
    optionsOverlayOpacity.setValue(0);
    optionsContentTranslateY.setValue(300);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(optionsOverlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(optionsContentTranslateY, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closeOptionsMenu = (keepSelection = false) => {
    Animated.parallel([
      Animated.timing(optionsOverlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(optionsContentTranslateY, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setOptionsVisible(false);
      if (!keepSelection) {
        setSelectedTransaction(null);
      }
    });
  };

  const isTransferTransaction = txn => {
    const entryKind = String(txn?.entry_kind || '').trim().toLowerCase();
    if (entryKind) {
      return entryKind === 'transfer';
    }
    const remark = String(txn?.remark || '').trim().toLowerCase();
    return (
      remark.startsWith('transferred to ') ||
      remark.startsWith('transferred from ')
    );
  };

  const isRequestTransaction = txn => {
    const entryKind = String(txn?.entry_kind || '').trim().toLowerCase();
    if (entryKind) {
      return entryKind === 'request' || entryKind === 'legacy_transfer';
    }
    const remark = String(txn?.remark || '').trim().toLowerCase();
    return (
      remark.startsWith('requested from ') ||
      remark.startsWith('requested by ') ||
      remark.startsWith('requested to ')
    );
  };

  const isTransferLogTimelineTransaction = txn => {
    const entryKind = String(txn?.entry_kind || '').trim().toLowerCase();
    if (entryKind) {
      return (
        entryKind === 'transfer' ||
        entryKind === 'request' ||
        entryKind === 'legacy_transfer'
      );
    }
    return isTransferTransaction(txn) || isRequestTransaction(txn);
  };

  const formatTransferLogRemark = txn => {
    const remark = String(txn?.remark || '').trim();
    const amount = Math.abs(Number(txn?.amount) || 0);
    const amountLabel = formatCurrency(amount);
    if (!remark) {
      return `Transfer ${amountLabel}`;
    }

    const lower = remark.toLowerCase();
    const directionByPrefix = {
      'transferred to ': 'to',
      'transferred from ': 'from',
      'requested by ': 'to',
      'requested to ': 'to',
      'requested from ': 'from',
    };
    const prefixes = Object.keys(directionByPrefix);
    const matchedPrefix = prefixes.find(prefix => lower.startsWith(prefix));
    if (!matchedPrefix) {
      return `Transfer ${amountLabel}`;
    }

    const remainder = remark.slice(matchedPrefix.length).trim();
    if (!remainder) {
      return `Transfer ${amountLabel}`;
    }
    const separatorIndex = remainder.indexOf(' - ');
    const accountName =
      separatorIndex === -1
        ? remainder
        : remainder.slice(0, separatorIndex).trim();
    const note =
      separatorIndex === -1 ? '' : remainder.slice(separatorIndex + 3).trim();
    const actionLabel = matchedPrefix.startsWith('requested') ? 'Request' : 'Transfer';
    const direction = directionByPrefix[matchedPrefix] || 'to';

    if (note) {
      return `${actionLabel} ${amountLabel} ${direction} ${accountName} - ${note}`;
    }
    return `${actionLabel} ${amountLabel} ${direction} ${accountName}`;
  };


  const isLockedTransaction = txn =>
    isTransferTransaction(txn) || isRequestTransaction(txn);

  const canEditRemark = txn => {
    if (!txn) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    const amount = Number(txn.amount);
    return Number.isFinite(amount);
  };

  const formatEditHistoryValue = value => {
    if (value === 'Deleted') {
      return 'Deleted';
    }
    return formatCurrency(Number(value) || 0);
  };

  const canEditAmount = txn => {
    if (!txn) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    if (isLockedTransaction(txn)) {
      return false;
    }
    const editCount = Number(txn.edit_count) || 0;
    if (editCount >= 3) {
      return false;
    }
    const amount = Number(txn.amount);
    return Number.isFinite(amount);
  };

  const canDeleteTransaction = useCallback(
    txn => {
      if (!txn) {
        return false;
      }
      if (Number(txn?.is_deleted) === 1) {
        return false;
      }
      const amount = Number(txn?.amount);
      return Number.isFinite(amount);
    },
    []
  );

  const handleUpdateAmount = async () => {
    if (!selectedTransaction) {
      return;
    }
    const parsedAmount = parseFloat(
      String(editAmount).replace(/[^0-9.]/g, '')
    );
    if (!parsedAmount || parsedAmount <= 0) {
      showUniversalToast('Please enter a valid amount.', 'error');
      return;
    }
    const editCount = Number(selectedTransaction.edit_count) || 0;
    if (editCount >= 3) {
      showUniversalToast('Edit limit reached.', 'error');
      return;
    }
    if (Number(selectedTransaction.amount) < 0) {
      const currentAbs = Math.abs(Number(selectedTransaction.amount) || 0);
      const availableBalance = totalBalance + currentAbs;
      if (parsedAmount > availableBalance) {
        showUniversalToast('Balance is low. Add amount first to withdraw.', 'error');
        return;
      }
    }
    setLoading(true);
    try {
      const nextAmount =
        Number(selectedTransaction.amount) < 0 ? -parsedAmount : parsedAmount;
      if (
        !canApplyAmountEditWithEntries(
          transactions,
          selectedTransaction.id,
          nextAmount
        )
      ) {
        showUniversalToast(
          'Edit not allowed. Balance would go negative.',
          'error'
        );
        return;
      }
      const currentHistory = parseEditHistory(selectedTransaction);
      const originalAbs = Math.abs(Number(selectedTransaction.amount) || 0);
      const nextAbs = Math.abs(nextAmount);
      const nextHistory =
        currentHistory.length > 0
          ? [...currentHistory, nextAbs]
          : [originalAbs, nextAbs];
      await updateTransactionAmount(
        selectedTransaction.id,
        account.id,
        nextAmount,
        JSON.stringify(nextHistory),
        editCount + 1
      );
      const remainingEdits = Math.max(0, 2 - editCount);
      showUniversalToast(`${remainingEdits} edits remaining.`, 'success');
      setEditAmountVisible(false);
      setSelectedTransaction(null);
      setEditAmount('');
      loadTransactions();
    } catch (error) {
      console.error('Failed to update amount:', error);
      themedAlert('Error', 'Failed to update amount. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRemark = async () => {
    if (!selectedTransaction) {
      return;
    }
    setLoading(true);
    try {
      await updateTransactionRemark(selectedTransaction.id, editRemark.trim());
      setEditRemarkVisible(false);
      setSelectedTransaction(null);
      setEditRemark('');
      loadTransactions();
    } catch (error) {
      console.error('Failed to update remark:', error);
      themedAlert('Error', 'Failed to update remark. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openRenameModal = () => {
    setNewAccountName(account.account_name || '');
    setRenameModalVisible(true);
    setTimeout(() => {
      renameInputRef.current?.focus();
    }, 600);
  };

  const closeRenameModal = () => {
    setRenameModalVisible(false);
    setNewAccountName('');
  };

  const emitDashboardDataChanged = useCallback(
    source => {
      DeviceEventEmitter.emit(DASHBOARD_DATA_CHANGED_EVENT, {
        source: String(source || 'expenses-account'),
        accountId: account?.id ? String(account.id) : null,
      });
    },
    [account?.id],
  );

  const handleAccountMenuRename = useCallback(() => {
    closeAccountMenu();
    openRenameModal();
  }, [closeAccountMenu]);

  const handleAccountMenuPersonalize = useCallback(() => {
    closeAccountMenu();
    navigation.navigate('PersonalizeAccount', {
      accountId: account.id,
    });
  }, [closeAccountMenu, navigation, account.id]);

  const handleAccountMenuDelete = useCallback(() => {
    closeAccountMenu();
    if (isSavingAccount) {
      themedAlert('Not Allowed', 'Saving account cannot be deleted.');
      return;
    }
    if (Math.abs(Number(totalBalance) || 0) > 0.000001) {
      themedAlert(
        'Balance Not Settled',
        'This account balance is not settled. Please settle it to 0 before removing the account.'
      );
      return;
    }
    themedAlert(
      'Delete Account',
      'Are you sure you want to delete this account? This will remove all transactions.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransactionsByAccount(account.id);
              await deleteAccount(account.id);
              emitDashboardDataChanged('expenses-account:delete');
              navigation.goBack();
            } catch (error) {
              console.error('Failed to delete account:', error);
              themedAlert(
                'Error',
                'Failed to delete account. Please try again.'
              );
            }
          },
        },
      ]
    );
  }, [
    account.id,
    closeAccountMenu,
    emitDashboardDataChanged,
    isSavingAccount,
    navigation,
    themedAlert,
    totalBalance,
  ]);

  const handleToggleShowTransferEntries = useCallback(
    async nextFromSwitch => {
      const nextValue =
        typeof nextFromSwitch === 'boolean'
          ? nextFromSwitch
          : !showTransferEntries;
      const previousValue = showTransferEntries;
      setCachedShowTransferEntries(account?.id, nextValue);
      setShowTransferEntries(nextValue);
      if (account?.id && !isSavingAccount) {
        try {
          const settingKey = `${SHOW_TRANSFER_ENTRIES_KEY_PREFIX}_${account.id}`;
          await AsyncStorage.setItem(settingKey, nextValue ? '1' : '0');
        } catch (error) {
          console.error('Failed to save transfer entries setting:', error);
          setCachedShowTransferEntries(account?.id, previousValue);
          setShowTransferEntries(previousValue);
          showUniversalToast('Failed to update setting.', 'error');
        }
      }
    },
    [
      showTransferEntries,
      account?.id,
      isSavingAccount,
      showUniversalToast,
    ]
  );

  const handleAccountMenuTransfer = useCallback(() => {
    closeAccountMenu();
    navigation.navigate('AmountEntry', {
      mode: 'withdraw',
      account,
      prevRouteKey: route.key,
      initialEntryDate: entryDate.toISOString(),
      transferOnly: true,
    });
  }, [closeAccountMenu, navigation, account, route.key, entryDate]);

  const handleOpenScheduledEntries = useCallback(() => {
    navigation.navigate('ScheduledEntries', {account});
  }, [navigation, account]);

  const accountMenuActions = useMemo(
    () =>
      buildExpensesAccountMenuActions({
        onRename: handleAccountMenuRename,
        onPersonalize: handleAccountMenuPersonalize,
        showTransferAction: !isSavingAccount,
        onTransfer: handleAccountMenuTransfer,
        showTransferEntriesSettingVisible: !isSavingAccount,
        showTransferEntries: !isSavingAccount && showTransferEntries,
        onToggleShowTransferEntries: handleToggleShowTransferEntries,
        onDelete: handleAccountMenuDelete,
      }),
    [
      handleAccountMenuRename,
      handleAccountMenuPersonalize,
      isSavingAccount,
      handleAccountMenuTransfer,
      showTransferEntries,
      handleToggleShowTransferEntries,
      handleAccountMenuDelete,
    ]
  );
  const accountMenuPrimaryActions = useMemo(
    () => accountMenuActions.filter(action => action.id !== 'personalize'),
    [accountMenuActions]
  );
  const accountMenuPersonalizeAction = useMemo(
    () => accountMenuActions.find(action => action.id === 'personalize') || null,
    [accountMenuActions]
  );

  const handleSaveAccountName = async () => {
    if (!account?.id || !newAccountName.trim()) {
      themedAlert('Invalid Name', 'Account name cannot be empty.');
      return;
    }
    setLoading(true);
    try {
      const nextName = newAccountName.trim();
      await renameAccount(account.id, nextName);
      emitDashboardDataChanged('expenses-account:rename');
      const nextAccount = {
        ...account,
        account_name: nextName,
      };
      setAccount(nextAccount);
      navigation.setParams({account: nextAccount});
      showUniversalToast('Account renamed successfully', 'success');
      closeRenameModal();
    } catch (error) {
      console.error('Failed to rename account:', error);
      themedAlert('Error', 'Failed to rename account.');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (isSavingAccount) {
      showUniversalToast(
        'Saving account does not support withdrawals.',
        'error'
      );
      return false;
    }
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      showUniversalToast('Please enter a valid amount.', 'error');
      return false;
    }

    const amountValue = Math.abs(parseFloat(withdrawAmount));
    if (isFutureEntryDate(entryDate)) {
      showUniversalToast('Future entry not allowed.', 'error');
      return false;
    }
    const strictEcoEnabled = await getStrictEcoEnabled();
    const entryTimestamp = entryDate.getTime();
    if (strictEcoEnabled) {
      const balanceAtTimestamp = getBalanceAtTimestampWithEntries(
        transactions,
        entryTimestamp
      );
      if (amountValue > balanceAtTimestamp) {
        showUniversalToast(`Low balance on ${account.account_name}.`, 'error');
        return false;
      }
    }

    setLoading(true);
    try {
      const hasConsent = await ensureEcoTransactionEntryAllowed();
      if (!hasConsent) {
        return false;
      }
      const remark = withdrawNote.trim();
      let receiptPath = '';
      if (withdrawReceiptUri) {
        try {
          receiptPath = await persistReceiptImage(withdrawReceiptUri);
        } catch (error) {
          console.error('Failed to save receipt image:', error);
          showUniversalToast('Failed to save bill photo.', 'error');
          return false;
        }
      }
      await createTransaction(
        account.id,
        -amountValue,
        remark,
        entryTimestamp,
        receiptPath
      );
      showUniversalToast('Withdrawal recorded.', 'success');
      setWithdrawAmount('');
      setWithdrawNote('');
      setWithdrawReceiptUri('');
      loadTransactions();
      return true;
    } catch (error) {
      console.error('Failed to add withdrawal:', error);
      themedAlert('Error', 'Failed to add entry. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleTransferFromSaving = async () => {
    if (!isSavingAccount) {
      return false;
    }
    if (!transferTarget) {
      themedAlert('Select Account', 'Please select a transfer account.');
      return false;
    }
    if (transferTarget.account_type === 'saving') {
      showUniversalToast('Cannot transfer to a saving account.', 'error');
      return false;
    }
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      showUniversalToast('Please enter a valid amount.', 'error');
      return false;
    }
    if (isFutureEntryDate(entryDate)) {
      showUniversalToast('Future entry not allowed.', 'error');
      return false;
    }

    const amountValue = Math.abs(parseFloat(transferAmount));
    const strictEcoEnabled = await getStrictEcoEnabled();
    const entryTimestamp = entryDate.getTime();
    if (strictEcoEnabled) {
      const balanceAtTimestamp = getBalanceAtTimestampWithEntries(
        transactions,
        entryTimestamp
      );
      if (amountValue > balanceAtTimestamp) {
        showUniversalToast('Balance is low in saving account.', 'error');
        return false;
      }
      const savingPending = [
        {
          id: 'pending-saving-transfer',
          amount: -amountValue,
          transaction_date: entryTimestamp,
          is_deleted: 0,
          orderIndex: 1,
        },
      ];
      if (
        !canWithdrawAtTimestampWithEntries(
          amountValue,
          entryTimestamp,
          transactions,
          savingPending
        )
      ) {
        showUniversalToast(
          'Transfer not allowed. Balance was insufficient at that time.',
          'error'
        );
        return false;
      }
    }

    const trimmedNote = transferNote.trim();
    const toRemark = trimmedNote
      ? `Transferred to ${transferTarget.account_name} - ${trimmedNote}`
      : `Transferred to ${transferTarget.account_name}`;
    const fromRemark = trimmedNote
      ? `Transferred from ${account.account_name} - ${trimmedNote}`
      : `Transferred from ${account.account_name}`;

    setLoading(true);
    try {
      const hasConsent = await ensureEcoTransactionEntryAllowed();
      if (!hasConsent) {
        return false;
      }
      await createTransaction(account.id, -amountValue, toRemark, entryTimestamp);
      await createTransaction(
        transferTarget.id,
        amountValue,
        fromRemark,
        entryTimestamp
      );
      setTransferAmount('');
      setTransferNote('');
      setTransferSelectVisible(false);
      setTransferModalVisible(false);
      loadTransactions();
      showUniversalToast('Transfer completed successfully.', 'success');
      return true;
    } catch (error) {
      console.error('Failed to transfer from saving:', error);
      themedAlert('Error', 'Failed to transfer. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRequestStart = async () => {
    if (!requestAmount || parseFloat(requestAmount) <= 0) {
      showUniversalToast('Please enter a valid amount.', 'error');
      return false;
    }

    const amountValue = Math.abs(parseFloat(requestAmount));
    if (!requestAccounts || requestAccounts.length === 0) {
      themedAlert('No Accounts', 'No earning accounts available for request.');
      return false;
    }

    if (!requestTarget) {
      themedAlert('Select Account', 'Please select an earning account.');
      return false;
    }

    await handleRequestFromAccount(requestTarget, amountValue);
    return true;
  };

  const handleRequestFromAccount = async (earningAccount, amountValue) => {
    if (!earningAccount || !amountValue) {
      return;
    }
    setLoading(true);
    try {
      const hasConsent = await ensureEcoTransactionEntryAllowed();
      if (!hasConsent) {
        return;
      }
      const strictEcoEnabled = await getStrictEcoEnabled();
      if (isFutureEntryDate(entryDate)) {
        showUniversalToast('Future entry not allowed.', 'error');
        return;
      }
      const entryTimestamp = entryDate.getTime();
      if (strictEcoEnabled) {
        const earningEntries = getTransactionsByAccount(earningAccount.id);
        const earningPending = [
          {
            id: 'pending-earning-request',
            amount: -Math.abs(amountValue),
            transaction_date: entryTimestamp,
            is_deleted: 0,
            orderIndex: 1,
          },
        ];
        if (
          !canWithdrawAtTimestampWithEntries(
            amountValue,
            entryTimestamp,
            earningEntries,
            earningPending
          )
        ) {
          showUniversalToast(
            `Request not allowed. ${earningAccount.account_name} had insufficient balance at that time.`,
            'error'
          );
          return;
        }
        const earningBalance = calculateAccountBalance(earningAccount.id);
        if (earningBalance < amountValue) {
          showUniversalToast(
            `Low balance on ${earningAccount.account_name}.`,
            'error'
          );
          return;
        }
      }

      const trimmedNote = requestNote.trim();
      const fromRemark = trimmedNote
        ? `Requested by ${account.account_name} - ${trimmedNote}`
        : `Requested by ${account.account_name}`;
      const toRemark = trimmedNote
        ? `Requested from ${earningAccount.account_name} - ${trimmedNote}`
        : `Requested from ${earningAccount.account_name}`;
      await createTransaction(
        earningAccount.id,
        -amountValue,
        fromRemark,
        entryTimestamp
      );
      await createTransaction(
        account.id,
        amountValue,
        toRemark,
        entryTimestamp
      );
      setRequestAmount('');
      setRequestNote('');
      setRequestSelectVisible(false);
      loadTransactions();
      showUniversalToast(
        `Amount requested from ${earningAccount.account_name}.`,
        'success'
      );
    } catch (error) {
      console.error('Failed to request amount:', error);
      themedAlert('Error', 'Failed to request amount. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = value => {
    return `${currencySymbol} ${value.toLocaleString('en-IN')}`;
  };

  const getDeleteBlockedMessage = deleteEvaluation => {
    const dependency = deleteEvaluation?.dependency;
    if (!dependency?.blockingEntry) {
      return "Can't delete this entry because balance depends on it.";
    }
    const balanceValue = Number(dependency.runningBalance) || 0;
    return `Can't delete this entry. Depended balance becomes ${formatCurrency(balanceValue)} on ${new Date(
      dependency.blockingEntry.transaction_date
    ).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })}.`;
  };

  const formatEntryDate = value => {
    return value.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatEntryTime = value => {
    return value.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isFutureEntryDate = value => {
    if (!(value instanceof Date)) {
      return false;
    }
    return value.getTime() > Date.now();
  };

  const handleEntryDateChange = (event, selectedDate) => {
    setShowEntryDatePicker(false);
    if (event?.type === 'dismissed' || !selectedDate) {
      return;
    }
    const updated = new Date(entryDate);
    updated.setFullYear(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    );
    updated.setSeconds(0, 0);
    if (isFutureEntryDate(updated)) {
      showUniversalToast('Future date not allowed.', 'error');
      setEntryDate(new Date());
      return;
    }
    setEntryDate(updated);
  };

  const handleEntryTimeChange = (event, selectedDate) => {
    setShowEntryTimePicker(false);
    if (event?.type === 'dismissed' || !selectedDate) {
      return;
    }
    const updated = new Date(entryDate);
    updated.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    if (isFutureEntryDate(updated)) {
      showUniversalToast('Future time not allowed.', 'error');
      setEntryDate(new Date());
      return;
    }
    setEntryDate(updated);
  };

  const formatDateLabel = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTimeLabel = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const updateFilteredData = useCallback(() => {
    setIsFiltering(true);
    const summary = calculateAccountsPeriodData({
      quickPeriod,
      customStartDate,
      customEndDate,
      monthStartDay,
      accountsSource: account?.id ? [account] : [],
      transactionsSource: transactions,
    });

    const filtered = [];
    transactions.forEach(txn => {
      if (Number(txn.is_deleted) === 1) {
        return;
      }
      const txnTime = Number(txn.transaction_date) || 0;
      if (
        txnTime >= summary.startTime &&
        (summary.endTime === null || txnTime <= summary.endTime)
      ) {
        filtered.push(txn);
      }
    });

    const metricInput = {
      transactions,
      periodRange: {
        startTime: summary.startTime,
        endTime: summary.endTime,
      },
      balance: totalBalance,
    };

    if (isCreditAccount) {
      const detailMetrics = buildCreditAccountDetailMetrics(metricInput);
      setFilteredAdded(detailMetrics.paidBill);
      setFilteredWithdrawals(detailMetrics.credit);
    } else if (isSavingAccount) {
      const detailMetrics = buildSavingAccountDetailMetrics(metricInput);
      setFilteredAdded(detailMetrics.savings);
      setFilteredWithdrawals(detailMetrics.transfer);
    } else {
      const detailMetrics = buildExpensesAccountDetailMetrics({
        transactions,
        periodRange: {
          startTime: summary.startTime,
          endTime: summary.endTime,
        },
        balance: totalBalance,
      });
      setFilteredAdded(detailMetrics.budget);
      setFilteredWithdrawals(detailMetrics.expenses);
    }
    setFilteredTransactions(filtered);
    setIsFiltering(false);
    setHasAppliedFilter(true);
  }, [
    account,
    customEndDate,
    customStartDate,
    isCreditAccount,
    isSavingAccount,
    monthStartDay,
    quickPeriod,
    totalBalance,
    transactions,
  ]);

  const handleQuickPeriodSelect = period => {
    setQuickPeriod(period);
    setCustomStartDate(null);
    setCustomEndDate(null);
    savePersistedPeriodState({
      quickPeriod: period,
      selectedMonth: null,
      selectedYear: null,
      customStartDate: null,
      customEndDate: null,
    }).catch(error => {
      console.error('Failed to save expenses account period preference:', error);
    });
  };

  const handleCustomDateRange = useCallback(
    (start, end) => {
      setCustomStartDate(start);
      setCustomEndDate(end);
      savePersistedPeriodState({
        quickPeriod,
        selectedMonth: null,
        selectedYear: null,
        customStartDate: start,
        customEndDate: end,
      }).catch(error => {
        console.error('Failed to save expenses account period preference:', error);
      });
    },
    [quickPeriod, savePersistedPeriodState],
  );

  const handleClearDateRange = useCallback(() => {
    setCustomStartDate(null);
    setCustomEndDate(null);
    clearAccountsPeriodState({
      scope: EXPENSES_ACCOUNT_PERIOD_STATE_SCOPE,
      accountId: account?.id,
    }).catch(error => {
      console.error('Failed to clear expenses account period preference:', error);
    });
  }, [account?.id]);

  const renderAddReceiptSheet = () => {
    return (
      <View style={styles.receiptSheetContainer}>
        <Text style={styles.receiptSheetTitle}>Attach Bill Photo</Text>
        <Text style={styles.receiptSheetSubtitle}>Choose a source</Text>
        <View style={styles.receiptSheetOptions}>
          <TouchableOpacity
            style={[
              styles.receiptSheetOption,
              {backgroundColor: popupSurfaceColor, shadowColor: themeColors.shadow || colors.black},
            ]}
            onPress={() => {
              setAddReceiptSheetVisible(false);
              handlePickReceiptImage('camera');
            }}>
            <Icon name="camera-outline" size={32} color={themeColors.primary || colors.primary} />
            <Text style={[styles.receiptSheetOptionText, {color: themeColors.primary || colors.primary}]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.receiptSheetOption,
              {backgroundColor: popupSurfaceColor, shadowColor: themeColors.shadow || colors.black},
            ]}
            onPress={() => {
              setAddReceiptSheetVisible(false);
              handlePickReceiptImage('gallery');
            }}>
            <Icon name="image-outline" size={32} color={themeColors.primary || colors.primary} />
            <Text style={[styles.receiptSheetOptionText, {color: themeColors.primary || colors.primary}]}>Gallery</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.receiptSheetCancel, {backgroundColor: popupBorderColor}]}
          onPress={() => setAddReceiptSheetVisible(false)}>
          <Text style={[styles.receiptSheetCancelText, {color: popupPrimaryText}]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      updateFilteredData();
    });
    return () => task.cancel();
  }, [updateFilteredData]);

  useEffect(() => {
    if (renameModalVisible) {
      setTimeout(() => {
        renameInputRef.current?.focus();
      }, 400);
    }
  }, [renameModalVisible]);

  const normalizeMonthStartDay = value => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_MONTH_START_DAY;
    }
    return Math.min(28, Math.max(1, Math.floor(parsed)));
  };

  const loadMonthStartDay = async () => {
    try {
      const stored = await AsyncStorage.getItem(MONTH_START_DAY_KEY);
      setMonthStartDay(normalizeMonthStartDay(stored));
    } catch (error) {
      console.error('Failed to load month start day:', error);
    }
  };

  useEffect(() => {
    let active = true;
    const accountId = account?.id;

    if (!accountId) {
      setQuickPeriod('1month');
      setCustomStartDate(null);
      setCustomEndDate(null);
      return () => {
        active = false;
      };
    }

    const loadPersistedPeriodState = async () => {
      try {
        const storedState = await loadAccountsPeriodState({
          scope: EXPENSES_ACCOUNT_PERIOD_STATE_SCOPE,
          accountId,
        });
        if (!active) {
          return;
        }
        if (!storedState) {
          setQuickPeriod('1month');
          setCustomStartDate(null);
          setCustomEndDate(null);
          return;
        }

        if (storedState.quickPeriod && VALID_QUICK_PERIODS.has(storedState.quickPeriod)) {
          setQuickPeriod(storedState.quickPeriod);
        } else {
          setQuickPeriod('1month');
        }
        setCustomStartDate(storedState.customStartDate);
        setCustomEndDate(storedState.customEndDate);
      } catch (error) {
        console.error('Failed to load expenses account period preference:', error);
      }
    };

    loadPersistedPeriodState();

    return () => {
      active = false;
    };
  }, [account?.id]);

  const savePersistedPeriodState = useCallback(
    state => {
      if (!account?.id) {
        return Promise.resolve(null);
      }

      return saveAccountsPeriodState({
        scope: EXPENSES_ACCOUNT_PERIOD_STATE_SCOPE,
        accountId: account.id,
        state,
      });
    },
    [account?.id],
  );

  const transferLogEntries = useMemo(() => {
    if (isSavingAccount) {
      return [];
    }
    return transactions
      .filter(
        txn =>
          Number(txn?.is_deleted) !== 1 &&
          isTransferLogTimelineTransaction(txn)
      )
      .sort((a, b) => {
        const timeDiff = Number(b.transaction_date) - Number(a.transaction_date);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        const aIdNum = Number(a.id);
        const bIdNum = Number(b.id);
        if (Number.isFinite(aIdNum) && Number.isFinite(bIdNum)) {
          return bIdNum - aIdNum;
        }
        return String(b.id).localeCompare(String(a.id));
      });
  }, [transactions, isSavingAccount]);

  const ledgerTransactions = useMemo(() => transactions, [transactions]);

  const transactionList = useMemo(() => {
    const shouldHideTransferInMainList =
      !isSavingAccount && !showTransferEntries;
    const filteredEntries = ledgerTransactions.filter(
      txn =>
        !shouldHideTransferInMainList ||
        !isTransferLogTimelineTransaction(txn)
    );
    const descendingEntries = new Array(filteredEntries.length);
    let runningBalance = 0;

    for (let index = filteredEntries.length - 1; index >= 0; index -= 1) {
      const txn = filteredEntries[index];
      const isDeleted = Number(txn.is_deleted) === 1;
      const txnAmount = isDeleted ? 0 : Number(txn.amount) || 0;
      runningBalance += txnAmount;
      descendingEntries[index] = {
        txn,
        balanceAfter: runningBalance,
        isDeleted,
      };
    }

    return descendingEntries.map((entry, index) => {
      const dateKey = new Date(entry.txn.transaction_date).toDateString();
      const nextDateKey =
        index < descendingEntries.length - 1
          ? new Date(descendingEntries[index + 1].txn.transaction_date).toDateString()
          : null;
      const showDate = dateKey !== nextDateKey;
      return {...entry, showDate};
    });
  }, [ledgerTransactions, showTransferEntries, isSavingAccount]);

  const renderTransferLogBlock = () => {
    if (isSavingAccount || transferLogEntries.length === 0 || showTransferEntries) {
      return null;
    }

    const latestEntry = transferLogEntries[0];
    const olderEntries = transferLogExpanded ? transferLogEntries.slice(1) : [];
    const shouldScrollTransferLog =
      transferLogExpanded &&
      olderEntries.length > TRANSFER_LOG_VISIBLE_ENTRIES - 1;

    return (
      <View
        style={[
          styles.transferLogCard,
          isDark && {
            backgroundColor: themeColors.card,
            borderWidth: 1,
            borderColor: themeColors.border,
            borderRadius: 12,
          },
        ]}>
        <TouchableOpacity
          style={styles.transferLogHeader}
          activeOpacity={0.85}
          onPress={() => setTransferLogExpanded(prev => !prev)}>
          <View style={styles.transferLogContent}>
            <Text
              style={[
                styles.transferLogText,
              ]}>
              {formatTransferLogRemark(latestEntry)}
            </Text>
            <Text
              style={[
                styles.transferLogMeta,
              ]}>
              {`${formatDateLabel(latestEntry.transaction_date)} ${formatTimeLabel(
                latestEntry.transaction_date
              )}`}
            </Text>
          </View>
          <Icon
            name={transferLogExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.text.secondary}
          />
        </TouchableOpacity>

        {olderEntries.length > 0 ? (
          <ScrollView
            style={styles.transferLogBody}
            contentContainerStyle={styles.transferLogBodyContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            scrollEnabled={shouldScrollTransferLog}>
            {olderEntries.map((entry, index) => (
              <View key={String(entry.id)} style={styles.transferLogItem}>
                <View style={styles.transferLogMarkerWrap}>
                  <View
                    style={[
                      styles.transferLogDot,
                      isRequestTransaction(entry)
                        ? styles.transferLogDotRequest
                        : styles.transferLogDotTransfer,
                    ]}
                  />
                  {index < olderEntries.length - 1 ? (
                    <View
                      style={[
                        styles.transferLogConnector,
                        isDark && {backgroundColor: themeColors.border},
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.transferLogContent}>
                  <Text
                    style={[
                      styles.transferLogText,
                    ]}>
                    {formatTransferLogRemark(entry)}
                  </Text>
                  <Text
                    style={[
                      styles.transferLogMeta,
                    ]}>
                    {`${formatDateLabel(entry.transaction_date)} ${formatTimeLabel(
                      entry.transaction_date
                    )}`}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    );
  };

  const renderTransactions = () => {
    if (!hasLoadedTransactions) {
      return null;
    }
    if (transactions.length === 0) {
      return (
        <View
          style={[
            styles.scrollContent,
            styles.historySection,
            styles.emptyHistory,
            isDark && {
              backgroundColor: themeColors.card,
              borderColor: themeColors.border,
            },
          ]}>
          <Icon
            name="receipt-outline"
            size={48}
            color={colors.text.light}
          />
          <Text
            style={[
              styles.emptyText,
            ]}>
            No transactions yet
          </Text>
        </View>
      );
    }

    if (transactionList.length === 0) {
      return null;
    }

    return (
      <FlatList
        data={transactionList}
        keyExtractor={item => String(item.txn.id)}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          styles.historySection,
          styles.chatList,
        ]}
        showsVerticalScrollIndicator={false}
        inverted
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={16}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        onLayout={() => {
          if (firstListLayoutLoggedRef.current) {
            return;
          }
          firstListLayoutLoggedRef.current = true;
          accountPerf('first-list-layout', {
            accountId: String(account?.id || ''),
            itemsCount: transactionList.length,
            sinceTapMs:
              openPerfStartedAtRef.current > 0
                ? Math.max(0, perfNow() - openPerfStartedAtRef.current)
                : null,
            sinceMountMs: Math.max(0, perfNow() - screenMountedAtRef.current),
          });
        }}
        renderItem={({item}) => {
          const {txn, balanceAfter, isDeleted, showDate} = item;
          const isDebit = Number(txn.amount) < 0;
          const editCount = Number(txn.edit_count) || 0;
          const editHistory = editCount ? parseEditHistory(txn) : [];
          const isTransfer = isTransferTransaction(txn);
          const isRequest = isRequestTransaction(txn);
          const isOffSessionEntry = Boolean(
            String(txn?.off_session_id || '').trim()
          );
          const ecoLeafColor = isOffSessionEntry
            ? isDark
              ? '#D1D5DB'
              : '#6B7280'
            : '#16A34A';
          const receiptUri = txn.image_uri ? normalizeImageUri(txn.image_uri) : '';

          return (
            <View key={txn.id}>
              {showDate && (
                <View
                  style={[
                    styles.datePill,
                    isDark && {
                      backgroundColor: themeColors.surface || themeColors.card,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.datePillText,
                    ]}>
                    {formatDateLabel(txn.transaction_date)}
                  </Text>
                </View>
              )}
              <TapEffect
                style={[styles.chatRow, isDebit && styles.chatRowDebit]}
                {...getDeletedTapEffectProps(
                  isDeleted,
                  () => openTransactionMenu(txn),
                )}
                delayLongPress={250}>
                <View
                  style={[
                    styles.chatBubble,
                    isDebit && styles.chatBubbleDebit,
                    isDark && {
                      backgroundColor: themeColors.card,
                      borderColor: themeColors.border,
                    },
                    isDeleted && deletedUiStyles.bubble,
                    isDeleted &&
                      isDark && {
                        backgroundColor: themeColors.card,
                        borderColor: themeColors.border,
                      },
                  ]}>
                  <View style={styles.chatHeader}>
                    <View
                      style={[
                        styles.chatIcon,
                        isDebit && styles.chatIconDebit,
                        isTransfer && styles.chatIconTransfer,
                        isDeleted && deletedUiStyles.iconContainer,
                        isDeleted &&
                          isDark && {
                            backgroundColor: themeColors.surface || themeColors.card,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                          },
                      ]}>
                      <Icon
                        name={isDebit ? 'arrow-down' : 'arrow-up'}
                        size={16}
                        color={
                          isDeleted
                            ? isDark
                              ? themeColors.text?.secondary || '#9CA3AF'
                              : '#6B7280'
                            : isTransfer
                            ? '#3B82F6'
                            : isRequest
                            ? '#10B981'
                            : isDebit
                            ? '#EF4444'
                            : '#10B981'
                        }
                      />
                    </View>
                    <Text
                      style={withDeletedStyle(
                        isDeleted,
                        [
                          styles.chatAmount,
                          isDebit && styles.chatAmountDebit,
                          isTransfer && styles.chatAmountTransfer,
                          isRequest && styles.chatAmountRequest,
                        ],
                        deletedUiStyles.amount,
                      )}>
                      {(isDebit ? '-' : '+') +
                        formatCurrency(Math.abs(Number(txn.amount) || 0))}
                    </Text>
                    <View style={styles.chatHeaderRight}>
                      <Icon
                        name="leaf"
                        size={15}
                        color={ecoLeafColor}
                        style={isDeleted ? {opacity: 0.7} : null}
                      />
                      {renderDeletedBadge(
                        isDeleted,
                        [
                          deletedUiStyles.badge,
                          isDark && {
                            backgroundColor: themeColors.surface || themeColors.card,
                            borderWidth: 1,
                            borderColor: themeColors.border,
                          },
                        ],
                        [
                          deletedUiStyles.badgeText,
                          isDark && {
                            color: themeColors.text?.secondary || '#9CA3AF',
                          },
                        ],
                      )}
                    </View>
                  </View>
                  {isDeleted ? (
                    renderDeletedNote(isDeleted)
                  ) : txn.remark ? (
                    <Text
                      style={[
                        styles.chatRemark,
                      ]}>
                      {txn.remark}
                    </Text>
                  ) : null}
                  {!isDeleted && receiptUri ? (
                    <Pressable
                      style={styles.receiptBubbleThumb}
                      onPress={() => openReceiptPreview(txn.image_uri)}>
                      <Image source={{uri: receiptUri}} style={styles.receiptBubbleImage} />
                    </Pressable>
                  ) : null}
                  <View style={[styles.chatMeta, isDebit && styles.chatMetaDebit]}>
                    <Text
                      style={[
                        styles.chatBalance,
                      ]}>
                      {formatCurrency(balanceAfter)}
                    </Text>
                    <View style={styles.chatMetaRight}>
                      <Text
                        style={[
                          styles.chatTime,
                        ]}>
                        {formatTimeLabel(txn.transaction_date)}
                      </Text>
                    </View>
                  </View>
                  {editHistory.length > 1 && (
                    <Text
                      style={[
                        styles.editHistoryText,
                      ]}>
                      {`Edited: ${editHistory
                        .map(formatEditHistoryValue)
                        .join(' -> ')}`}
                    </Text>
                  )}
                </View>
              </TapEffect>
            </View>
          );
        }}
      />
    );
  };

  const handleOpenPersonalize = useCallback(() => {
    navigation.navigate('PersonalizeAccount', {accountId: account.id});
  }, [navigation, account.id]);

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: themeColors.background},
      ]}>
      <AccountDetailHeader
        insets={insets}
        account={account}
        handleBackNavigation={handleBackNavigation}
        handleStickyHeaderLayout={handleStickyHeaderLayout}
        accountTypeLabel={accountTypeLabel}
        renderAccountHeaderIcon={renderAccountHeaderIcon}
        menuButtonRef={menuButtonRef}
        openAccountMenu={openAccountMenu}
        handleOpenPersonalize={handleOpenPersonalize}
        quickPeriod={quickPeriod}
        handleQuickPeriodSelect={handleQuickPeriodSelect}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        handleCustomDateRange={handleCustomDateRange}
        handleClearDateRange={handleClearDateRange}
        monthStartDay={monthStartDay}
        filteredAdded={filteredAdded}
        filteredWithdrawals={filteredWithdrawals}
        totalBalance={totalBalance}
        formatCurrency={formatCurrency}
        metricsLabels={metricsLabels}
      />
      <View style={[styles.listSpacer, {paddingTop: headerHeight}]}>
        {renderTransactions()}
      </View>


      {/* Bottom Fixed Section */}
      <View
        style={[
          styles.bottomSection,
          {
            backgroundColor: themeColors.card,
            borderTopColor: themeColors.border,
            paddingBottom: spacing.md + insets.bottom,
          },
        ]}>
        {deferredUiReady ? renderTransferLogBlock() : null}
        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {!isSavingAccount && (
            <CTAButton
              label="Withdraw"
              kind="withdraw"
              compact
              style={styles.withdrawCtaButton}
              onPress={() => {
                navigation.navigate('AmountEntry', {
                  mode: 'withdraw',
                  account,
                  hideTransferAction: isCreditAccount ? true : false,
                  withdrawFromExpensesOnly: isCreditAccount ? true : false,
                  prevRouteKey: route.key,
                  initialEntryDate: entryDate.toISOString(),
                });
              }}
            />
          )}
          {isSavingAccount && (
            <CTAButton
              label="Transfer"
              kind="transfer"
              compact
              style={styles.transferButton}
              onPress={() => {
                navigation.navigate('AmountEntry', {
                  mode: 'withdraw',
                  account,
                  prevRouteKey: route.key,
                  initialEntryDate: entryDate.toISOString(),
                  transferOnly: true,
                });
              }}
            />
          )}
          {isSavingAccount ? (
            <CTAButton
              label="Add Savings"
              kind="add"
              compact
              style={styles.givenCtaButton}
              onPress={() => {
                navigation.navigate('AmountEntry', {
                  mode: 'request',
                  account,
                  prevRouteKey: route.key,
                  initialEntryDate: entryDate.toISOString(),
                  enableCalculator: true,
                });
              }}
            />
          ) : (
            <CTAButton
              label={isCreditAccount ? 'Paid Bill' : 'Add Budget'}
              kind="add"
              compact
              style={styles.givenCtaButton}
              onPress={() => {
                navigation.navigate('AmountEntry', {
                  mode: isCreditAccount ? 'payBill' : 'request',
                  account,
                  prevRouteKey: route.key,
                  initialEntryDate: entryDate.toISOString(),
                  enableCalculator: true,
                });
              }}
            />
          )}
        </View>
      </View>

      {scheduledEntriesCount > 0 ? (
        <TouchableOpacity
          style={[
            styles.scheduledFab,
            {
              bottom: spacing.md + insets.bottom + 88,
              backgroundColor: themeColors.primary,
            },
          ]}
          activeOpacity={0.9}
          onPress={handleOpenScheduledEntries}>
          <Icon name="time-outline" size={22} color={themeColors.onPrimary} />
          <View style={styles.scheduledFabBadge}>
            <Text style={styles.scheduledFabBadgeText}>
              {scheduledEntriesCount > 99 ? '99+' : String(scheduledEntriesCount)}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {deferredUiReady ||
      withdrawModalVisible ||
      transferModalVisible ||
      requestModalVisible ||
      receiptPreviewVisible ||
      optionsVisible ||
      menuVisible ||
      editAmountVisible ||
      editRemarkVisible ||
      renameModalVisible ||
      addReceiptSheetVisible ? (
        <>
      <AmountEntryView visible={withdrawModalVisible}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={[styles.modalBackdrop, {backgroundColor: popupOverlayColor}]}
            activeOpacity={1}
            onPress={() => {
              setWithdrawModalVisible(false);
              setWithdrawNote('');
              setWithdrawReceiptUri('');
            }}
          />
          <Animated.View
            style={[
              styles.modalSheet,
              {backgroundColor: popupSurfaceColor},
              {
                transform: [
                  {
                    translateY: modalSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [260, 0],
                    }),
                  },
                ],
              },
            ]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Withdraw</Text>
            <TextInput
              style={styles.modalAmountInput}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              autoFocus
              ref={withdrawAmountInputRef}
              showSoftInputOnFocus
              editable={!loading}
            />
            <View style={styles.entryDateTimeRow}>
              <TouchableOpacity
                style={styles.entryDateTimeButton}
                onPress={() => setShowEntryDatePicker(true)}>
                <Text style={styles.entryDateTimeLabel}>Date</Text>
                <Text style={styles.entryDateTimeValue}>
                  {formatEntryDate(entryDate)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.entryDateTimeButton}
                onPress={() => setShowEntryTimePicker(true)}>
                <Text style={styles.entryDateTimeLabel}>Time</Text>
                <Text style={styles.entryDateTimeValue}>
                  {formatEntryTime(entryDate)}
                </Text>
              </TouchableOpacity>
            </View>
            {showEntryDatePicker && (
              <DateTimePicker
                value={entryDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={handleEntryDateChange}
              />
            )}
            {showEntryTimePicker && (
              <DateTimePicker
                value={entryDate}
                mode="time"
                display="default"
                maximumDate={new Date()}
                onChange={handleEntryTimeChange}
              />
            )}
              <Text style={styles.modalNoteLabel}>Note (Optional)</Text>
              <View style={styles.noteInputWithAttach}>
                <TextInput
                  style={[styles.modalNoteInput, styles.modalNoteInputPadded]}
                  value={withdrawNote}
                  onChangeText={setWithdrawNote}
                  placeholder="Add a note"
                  placeholderTextColor={colors.text.light}
                  multiline
                  numberOfLines={3}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={handleAddReceipt}>
                  <Icon name="attach-outline" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>
              {withdrawReceiptUri ? (
                <View style={styles.receiptPreviewRow}>
                  <Image source={{uri: normalizeImageUri(withdrawReceiptUri)}} style={styles.receiptThumb} />
                  <TouchableOpacity
                    style={styles.receiptRemoveButton}
                    onPress={handleRemoveReceipt}>
                    <Text style={styles.receiptRemoveText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <AmountActionButton
                label="Withdraw"
                variant="neutralOutline"
                style={[styles.modalAddButton, loading && styles.buttonDisabled]}
                textStyle={styles.modalAddButtonText}
                onPress={async () => {
                  const didWithdraw = await handleWithdraw();
                  if (didWithdraw) {
                    setWithdrawModalVisible(false);
                  }
                }}
                loading={loading}
                activityColor={colors.onPrimary}
              />
          </Animated.View>
        </View>
      </AmountEntryView>

      <AmountEntryView visible={transferModalVisible}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={[styles.modalBackdrop, {backgroundColor: popupOverlayColor}]}
            activeOpacity={1}
            onPress={() => {
              setTransferModalVisible(false);
              setTransferNote('');
              setTransferSelectVisible(false);
            }}
          />
          <Animated.View
            style={[
              styles.modalSheet,
              {backgroundColor: popupSurfaceColor},
              {
                transform: [
                  {
                    translateY: modalSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [260, 0],
                    }),
                  },
                ],
              },
            ]}>
            {transferSelectVisible && (
              <Pressable
                style={styles.transferDismissOverlay}
                onPress={() => setTransferSelectVisible(false)}
              />
            )}
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Transfer</Text>
              <View style={styles.amountFieldWrapper}>
                <View
                  style={[
                    styles.amountFieldRow,
                    isDark && {
                      backgroundColor: themeColors.input || themeColors.card,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onLayout={event =>
                    setTransferFieldHeight(event.nativeEvent.layout.height)
                  }>
                  <TextInput
                    style={styles.amountInputBare}
                    value={transferAmount}
                    onChangeText={setTransferAmount}
                    keyboardType="numeric"
                    ref={transferAmountInputRef}
                    showSoftInputOnFocus
                    editable={!loading}
                  />
                  <View style={styles.amountFieldDivider} />
                  <TouchableOpacity
                    style={styles.amountAccountButton}
                    onPress={() =>
                      setTransferSelectVisible(current => !current)
                    }
                    onLayout={event =>
                      setTransferAccountWidth(event.nativeEvent.layout.width)
                    }
                    disabled={transferAccounts.length === 0}>
                    <Text
                      style={[
                        styles.amountAccountText,
                        transferTarget?.icon_color && {
                          color: transferTarget.icon_color,
                        },
                      ]}
                      numberOfLines={1}>
                      {transferTarget?.account_name ||
                        (transferAccounts.length
                          ? 'Select account'
                          : 'No accounts')}
                    </Text>
                    <Icon
                      name="chevron-down"
                      size={16}
                      color={colors.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
                {transferSelectVisible && (
                  <View
                    style={[
                      styles.floatingAccountList,
                      {
                        backgroundColor: popupSurfaceColor,
                        borderColor: popupBorderColor,
                      },
                      {
                        bottom: transferFieldHeight + 6,
                        right: 0,
                        width: transferAccountWidth || 140,
                      },
                    ]}>
                    <ScrollView
                      style={styles.floatingAccountScroll}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled">
                      {transferAccounts.map(item => {
                        const isSelected = transferTarget?.id === item.id;
                        const itemColor =
                          item.icon_color || colors.text.primary;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.floatingAccountItem,
                              isSelected && styles.floatingAccountItemSelected,
                            ]}
                            onPress={() => {
                              setTransferTarget(item);
                              setTransferSelectVisible(false);
                            }}>
                            <Text
                              style={[
                                styles.floatingAccountText,
                                {color: itemColor},
                                isSelected && styles.floatingAccountTextSelected,
                              ]}>
                              {item.account_name}
                            </Text>
                            {isSelected && (
                              <Icon
                                name="checkmark-circle"
                                size={16}
                                color={itemColor}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
              <View style={styles.entryDateTimeRow}>
                <TouchableOpacity
                  style={styles.entryDateTimeButton}
                  onPress={() => setShowEntryDatePicker(true)}>
                  <Text style={styles.entryDateTimeLabel}>Date</Text>
                  <Text style={styles.entryDateTimeValue}>
                    {formatEntryDate(entryDate)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.entryDateTimeButton}
                  onPress={() => setShowEntryTimePicker(true)}>
                  <Text style={styles.entryDateTimeLabel}>Time</Text>
                  <Text style={styles.entryDateTimeValue}>
                    {formatEntryTime(entryDate)}
                  </Text>
                </TouchableOpacity>
              </View>
              {showEntryDatePicker && (
                <DateTimePicker
                  value={entryDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={handleEntryDateChange}
                />
              )}
              {showEntryTimePicker && (
                <DateTimePicker
                  value={entryDate}
                  mode="time"
                  display="default"
                  maximumDate={new Date()}
                  onChange={handleEntryTimeChange}
                />
              )}
              <Text style={styles.modalNoteLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.modalNoteInput}
                value={transferNote}
                onChangeText={setTransferNote}
                placeholder="Add a note"
                placeholderTextColor={colors.text.light}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
              <AmountActionButton
                label="Transfer"
                variant="neutralOutline"
                style={[
                  styles.modalAddButton,
                  account.icon_color && {backgroundColor: account.icon_color},
                  loading && styles.buttonDisabled,
                ]}
                textStyle={styles.modalAddButtonText}
                onPress={handleTransferFromSaving}
                loading={loading}
                activityColor={colors.onPrimary}
              />
            </View>
          </Animated.View>
        </View>
      </AmountEntryView>

      <AmountEntryView visible={requestModalVisible}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={[styles.modalBackdrop, {backgroundColor: popupOverlayColor}]}
            activeOpacity={1}
            onPress={() => {
              setRequestModalVisible(false);
              setRequestNote('');
            }}
          />
          <Animated.View
            style={[
              styles.modalSheet,
              {backgroundColor: popupSurfaceColor},
              {
                transform: [
                  {
                    translateY: modalSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [260, 0],
                    }),
                  },
                ],
              },
            ]}>
            {requestSelectVisible && (
              <Pressable
                style={styles.transferDismissOverlay}
                onPress={() => setRequestSelectVisible(false)}
              />
            )}
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{isSavingAccount ? 'Add Savings' : 'Add Budget'}</Text>
              <View style={styles.amountFieldWrapper}>
                <View
                  style={[
                    styles.amountFieldRow,
                    isDark && {
                      backgroundColor: themeColors.input || themeColors.card,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onLayout={event =>
                    setRequestFieldHeight(event.nativeEvent.layout.height)
                  }>
                  <TextInput
                    style={styles.amountInputBare}
                    value={requestAmount}
                    onChangeText={setRequestAmount}
                    keyboardType="numeric"
                    autoFocus
                    ref={requestAmountInputRef}
                    showSoftInputOnFocus
                    editable={!loading}
                  />
                  <View style={styles.amountFieldDivider} />
                  <TouchableOpacity
                    style={styles.amountAccountButton}
                    onPress={() =>
                      setRequestSelectVisible(current => !current)
                    }
                    onLayout={event =>
                      setRequestAccountWidth(event.nativeEvent.layout.width)
                    }
                    disabled={requestAccounts.length === 0}>
                    <Text
                      style={[
                        styles.amountAccountText,
                        requestTarget?.icon_color && {
                          color: requestTarget.icon_color,
                        },
                      ]}
                      numberOfLines={1}>
                      {requestTarget?.account_name ||
                        (requestAccounts.length
                          ? 'Select account'
                          : 'No accounts')}
                    </Text>
                    <Icon
                      name="chevron-down"
                      size={16}
                      color={colors.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
                {requestSelectVisible && (
                  <View
                    style={[
                      styles.floatingAccountList,
                      {
                        backgroundColor: popupSurfaceColor,
                        borderColor: popupBorderColor,
                      },
                      {
                        bottom: requestFieldHeight + 6,
                        right: 0,
                        width: requestAccountWidth || 140,
                      },
                    ]}>
                    <ScrollView
                      style={styles.floatingAccountScroll}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled">
                      {requestAccounts.map(item => {
                        const isSelected = requestTarget?.id === item.id;
                        const itemColor =
                          item.icon_color || colors.text.primary;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.floatingAccountItem,
                              isSelected && styles.floatingAccountItemSelected,
                            ]}
                            onPress={() => {
                              setRequestTarget(item);
                              setRequestSelectVisible(false);
                            }}>
                            <Text
                              style={[
                                styles.floatingAccountText,
                                {color: itemColor},
                                isSelected && styles.floatingAccountTextSelected,
                              ]}>
                              {item.account_name}
                            </Text>
                            {isSelected && (
                              <Icon
                                name="checkmark-circle"
                                size={16}
                                color={itemColor}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
              <View style={styles.entryDateTimeRow}>
                <TouchableOpacity
                  style={styles.entryDateTimeButton}
                  onPress={() => setShowEntryDatePicker(true)}>
                  <Text style={styles.entryDateTimeLabel}>Date</Text>
                  <Text style={styles.entryDateTimeValue}>
                    {formatEntryDate(entryDate)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.entryDateTimeButton}
                  onPress={() => setShowEntryTimePicker(true)}>
                  <Text style={styles.entryDateTimeLabel}>Time</Text>
                  <Text style={styles.entryDateTimeValue}>
                    {formatEntryTime(entryDate)}
                  </Text>
                </TouchableOpacity>
              </View>
              {showEntryDatePicker && (
                <DateTimePicker
                  value={entryDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={handleEntryDateChange}
                />
              )}
              {showEntryTimePicker && (
                <DateTimePicker
                  value={entryDate}
                  mode="time"
                  display="default"
                  maximumDate={new Date()}
                  onChange={handleEntryTimeChange}
                />
              )}
              <Text style={styles.modalNoteLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.modalNoteInput}
                value={requestNote}
                onChangeText={setRequestNote}
                placeholder="Add a note"
                placeholderTextColor={colors.text.light}
                multiline
                numberOfLines={3}
                editable={!loading}
              />
              <AmountActionButton
                label={isSavingAccount ? "Add Savings" : "Add Budget"}
                variant="neutralOutline"
                style={[
                  styles.modalAddButton,
                  account.icon_color && {backgroundColor: account.icon_color},
                  loading && styles.buttonDisabled,
                ]}
                textStyle={styles.modalAddButtonText}
                onPress={async () => {
                  const didOpen = await handleRequestStart();
                  if (didOpen) {
                    setRequestModalVisible(false);
                  }
                }}
                loading={loading}
                activityColor={colors.onPrimary}
              />
            </View>
          </Animated.View>
        </View>
      </AmountEntryView>

      <Modal
        visible={receiptPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReceiptPreview}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewViewer}>
            <ImageViewer
              imageUrls={[
                {url: normalizeImageUri(receiptPreviewUri)},
              ]}
              enableSwipeDown
              onSwipeDown={closeReceiptPreview}
              renderHeader={renderReceiptPreviewHeader}
              saveToLocalByLongPress={false}
              backgroundColor="transparent"
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={optionsVisible}
        transparent
        animationType="none"
        onRequestClose={closeOptionsMenu}>
        <Animated.View
          style={[
            styles.optionsOverlay,
            {backgroundColor: popupOverlayColor},
            {opacity: optionsOverlayOpacity},
          ]}>
          <TouchableOpacity
            style={styles.optionsOverlayTouchable}
            activeOpacity={1}
            onPress={closeOptionsMenu}
          />
          <Animated.View
            style={[
              styles.optionsContainer,
              {
                backgroundColor: popupSurfaceColor,
                shadowColor: themeColors.shadow || colors.black,
              },
              {transform: [{translateY: optionsContentTranslateY}]},
            ]}>
            <View style={styles.optionsHeader}>
              <Text style={[styles.optionsTitle, {color: popupPrimaryText}]}>
                {selectedTransaction
                  ? `Options for ${formatCurrency(
                      Math.abs(Number(selectedTransaction.amount) || 0)
                    )}`
                  : 'Options'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.optionButton,
                !canEditAmount(selectedTransaction) &&
                  styles.optionButtonDisabled,
              ]}
              disabled={!canEditAmount(selectedTransaction)}
              onPress={() => {
                if (!selectedTransaction) {
                  return;
                }
                closeOptionsMenu(true);
                setEditAmount(
                  String(Math.abs(Number(selectedTransaction.amount) || 0))
                );
                setEditAmountVisible(true);
              }}>
              <View style={styles.optionItemRow}>
                <Icon
                  name="create-outline"
                  size={20}
                  color={
                    canEditAmount(selectedTransaction)
                      ? popupPrimaryText
                      : themeColors.text?.light || colors.text.light
                  }
                />
                <Text
                  style={[
                    styles.optionText,
                    {color: popupPrimaryText},
                    !canEditAmount(selectedTransaction) &&
                      styles.optionTextDisabled,
                  ]}>
                  Edit Amount
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => {
                if (!selectedTransaction) {
                  return;
                }
                if (!canEditRemark(selectedTransaction)) {
                  return;
                }
                closeOptionsMenu(true);
                setEditRemark(selectedTransaction.remark || '');
                setEditRemarkVisible(true);
              }}>
              <View style={styles.optionItemRow}>
                <Icon
                  name="chatbubble-ellipses-outline"
                  size={20}
                  color={popupPrimaryText}
                />
                <Text style={[styles.optionText, {color: popupPrimaryText}]}>Edit Remark</Text>
              </View>
            </TouchableOpacity>
            {selectedTransaction?.image_uri ? (
              <TouchableOpacity
                style={styles.optionButton}
                onPress={() => {
                  if (!selectedTransaction?.image_uri) {
                    return;
                  }
                  closeOptionsMenu(true);
                  openReceiptPreview(selectedTransaction.image_uri);
                }}>
                <View style={styles.optionItemRow}>
                  <Icon
                    name="image-outline"
                    size={20}
                    color={popupPrimaryText}
                  />
                  <Text style={[styles.optionText, {color: popupPrimaryText}]}>View Bill Photo</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.optionButton,
                styles.optionDelete,
                !canDeleteTransaction(selectedTransaction) &&
                  styles.optionButtonDisabled,
              ]}
              disabled={!canDeleteTransaction(selectedTransaction)}
              onPress={() => {
                if (!selectedTransaction) {
                  return;
                }
                const isLinked = isLockedTransaction(selectedTransaction);
                const warningText = isLinked
                  ? 'Deleting here will also delete the linked entry from your earning account. This may cause confusion in your accounts.'
                  : 'Are you sure you want to delete this entry?';
                themedAlert(
                  'Delete Entry',
                  warningText,
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        closeOptionsMenu(true);
                        try {
                          const deleteEvaluation =
                            evaluateAccountTransactionDelete({
                              txn: selectedTransaction,
                              transactions,
                              currentAccountId: account.id,
                              strictEcoEnabled: await getStrictEcoEnabled(),
                              isLockedTransaction,
                            });
                          if (!deleteEvaluation.allowed) {
                            themedAlert(
                              "Can't delete this entry",
                              getDeleteBlockedMessage(deleteEvaluation)
                            );
                            return;
                          }
                          if (isLinked) {
                            const linked = deleteEvaluation.linkedTransaction;
                            if (!linked) {
                              showUniversalToast(
                                'Linked entry not found. Only this entry will be deleted.',
                                'error'
                              );
                            }
                            if (linked) {
                              const linkedHistory = buildDeleteHistory(linked);
                              await deleteTransaction(
                                linked.id,
                                linked.account_id,
                                linkedHistory
                              );
                              await deleteReceiptFileIfPossible(
                                linked.image_uri
                              );
                            }
                          }
                          const deleteHistory =
                            buildDeleteHistory(selectedTransaction);
                          await deleteTransaction(
                            selectedTransaction.id,
                            account.id,
                            deleteHistory
                          );
                          await deleteReceiptFileIfPossible(
                            selectedTransaction.image_uri
                          );
                          loadTransactions();
                          setSelectedTransaction(null);
                        } catch (error) {
                          console.error('Failed to delete entry:', error);
                          themedAlert(
                            'Error',
                            'Failed to delete entry. Please try again.'
                          );
                        }
                      },
                    },
                  ]
                );
              }}>
              <View style={styles.optionItemRow}>
                <Icon
                  name="trash-outline"
                  size={20}
                  color={
                    canDeleteTransaction(selectedTransaction)
                      ? popupDangerColor
                      : themeColors.text?.light || colors.text.light
                  }
                />
                <Text
                  style={[
                    styles.optionText,
                    styles.optionDeleteText,
                    {color: popupDangerColor},
                    !canDeleteTransaction(selectedTransaction) &&
                      styles.optionTextDisabled,
                  ]}>
                  Delete Entry
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                styles.optionButtonCancel,
                {borderTopColor: popupBorderColor},
              ]}
              onPress={closeOptionsMenu}>
              <View style={styles.optionItemRow}>
                <Icon name="close" size={20} color={popupSecondaryText} />
                <Text style={[styles.optionTextCancel, {color: popupSecondaryText}]}>Cancel</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      <DropdownPopup
        visible={menuVisible}
        onClose={closeAccountMenu}
        cardStyle={[
          styles.accountMenuCard,
          {
            width: menuWidth,
            top: menuTop,
            left: menuLeft,
            opacity: menuAnim,
            backgroundColor: popupSurfaceColor,
            borderColor: popupBorderColor,
            shadowColor: themeColors.shadow || colors.black,
            transform: [
              {
                translateY: menuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-14, 0],
                }),
              },
            ],
          },
        ]}>
            {accountMenuPrimaryActions.map(action => {
              if (action.type === 'switch') {
                return (
                  <View
                    key={action.id}
                    style={[
                      styles.accountMenuToggleRow,
                      action.disabled && styles.optionButtonDisabled,
                    ]}>
                    <View style={styles.accountMenuToggleLeft}>
                      <Icon
                        name={action.icon}
                        size={22}
                        color={popupPrimaryText}
                      />
                      <Text style={[styles.accountMenuToggleLabel, {color: popupPrimaryText}]}>{action.label}</Text>
                    </View>
                    <ToggleSwitch
                      value={Boolean(action.value)}
                      onValueChange={action.onValueChange}
                      disabled={action.disabled}
                    />
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={action.id}
                  style={[
                    styles.optionButton,
                    action.variant === 'danger' && styles.optionDelete,
                  ]}
                  onPress={action.onPress}
                  disabled={action.disabled}>
                  <View style={styles.optionItemRow}>
                    <Icon
                      name={action.icon}
                      size={20}
                      color={action.variant === 'danger' ? popupDangerColor : popupPrimaryText}
                    />
                    <Text
                      style={[
                        styles.optionText,
                        action.variant === 'danger' && styles.optionDeleteText,
                        {color: action.variant === 'danger' ? popupDangerColor : popupPrimaryText},
                      ]}>
                      {action.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {isSavingAccount && (
              <>
                <View style={styles.accountMenuDivider} />
                <View style={styles.accountMenuToggleRow}>
                  <View style={styles.accountMenuToggleLeft}>
                    <Icon name="eye-outline" size={22} color={popupPrimaryText} />
                    <Text style={[styles.accountMenuToggleLabel, {color: popupPrimaryText}]}>show balance in dashboard</Text>
                  </View>
                  <ToggleSwitch
                    value={showBalanceInDashboard}
                    onValueChange={handleToggleShowBalanceInDashboard}
                  />
                </View>
              </>
            )}
            {accountMenuPersonalizeAction && (
              <TouchableOpacity
                key={accountMenuPersonalizeAction.id}
                style={[
                  styles.optionButton,
                  accountMenuPersonalizeAction.variant === 'danger' && styles.optionDelete,
                ]}
                onPress={accountMenuPersonalizeAction.onPress}
                disabled={accountMenuPersonalizeAction.disabled}>
                <View style={styles.optionItemRow}>
                  <Icon
                    name={accountMenuPersonalizeAction.icon}
                    size={20}
                    color={
                      accountMenuPersonalizeAction.variant === 'danger'
                        ? popupDangerColor
                        : popupPrimaryText
                    }
                  />
                  <Text
                    style={[
                      styles.optionText,
                      accountMenuPersonalizeAction.variant === 'danger' &&
                        styles.optionDeleteText,
                      {
                        color:
                          accountMenuPersonalizeAction.variant === 'danger'
                            ? popupDangerColor
                            : popupPrimaryText,
                      },
                    ]}>
                    {accountMenuPersonalizeAction.label}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
      </DropdownPopup>

      <EditAmountModal
        visible={editAmountVisible}
        value={editAmount}
        onChangeText={setEditAmount}
        onSave={handleUpdateAmount}
        onClose={() => setEditAmountVisible(false)}
        loading={loading}
        autoFocus
      />

      <EditRemarkModalSheet
        visible={editRemarkVisible}
        onClose={() => setEditRemarkVisible(false)}
        value={editRemark}
        onChangeText={setEditRemark}
        onSave={handleUpdateRemark}
        loading={loading}
      />

      <RenameAccountModal
        visible={renameModalVisible}
        value={newAccountName}
        onChange={setNewAccountName}
        onSave={handleSaveAccountName}
        onClose={closeRenameModal}
        loading={loading}
        inputRef={renameInputRef}
        styles={styles}
      />

      <BottomSheet
        visible={addReceiptSheetVisible}
        onClose={() => setAddReceiptSheetVisible(false)}>
        {renderAddReceiptSheet()}
      </BottomSheet>
        </>
      ) : null}
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerMetricsSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.lg,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  accountMenuCard: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.sm,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  accountMenuToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  accountMenuToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: spacing.sm,
  },
  accountMenuToggleLabel: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
    marginRight: spacing.sm,
    marginLeft: 10,
  },
  accountMenuDivider: {
    height: 1,
    backgroundColor: colors.primarySoft,
    marginVertical: 8,
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
  optionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  accountMetricsWrapper: {
    paddingTop: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  accountMetricsCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
    marginBottom: 0,
  },
  dropdownGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  dropdownContainer: {
    flex: 1,
  },
  dropdownLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  dropdown: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    flex: 1,
  },
  dropdownDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.6,
  },
  dropdownTextDisabled: {
    color: colors.text.light,
  },
  accountMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountMetricHalf: {
    flex: 1,
  },
  accountMetricDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  accountMetricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  accountMetricIcon: {
    width: METRIC_ICON_SIZE,
    height: METRIC_ICON_SIZE,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountMetricValueIndented: {
    marginLeft: METRIC_LABEL_OFFSET,
  },
  accountMetricIconNegative: {
    backgroundColor: colors.error,
  },
  accountMetricLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'left',
  },
  accountMetricValue: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'left',
  },
  accountMetricNegative: {
    color: colors.error,
  },
  accountMetricSavings: {
    color: colors.success,
  },
  periodOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  periodDropdownModal: {
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    maxHeight: 400,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  periodDropdownModalScrollable: {
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    maxHeight: 400,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  periodDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodDropdownOptionActive: {
    backgroundColor: colors.surfaceMuted,
  },
  periodDropdownOptionText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
  periodDropdownOptionTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  bottomSheetTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  periodDropdownOptionClear: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: withAlpha(colors.error, 0.1),
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(colors.error, 0.4),
  },
  periodDropdownOptionClearText: {
    fontSize: fontSize.medium,
    color: colors.error,
    fontWeight: fontWeight.semibold,
  },
  receiptSheetContainer: {
    padding: spacing.md,
  },
  receiptSheetTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  receiptSheetSubtitle: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  receiptSheetOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: spacing.md, // Added gap between options
    paddingHorizontal: spacing.md, // Added horizontal padding
    marginBottom: spacing.lg,
  },
  receiptSheetOption: {
    alignItems: 'center',
    paddingVertical: spacing.md, // Increased padding
    paddingHorizontal: spacing.sm,
    borderRadius: 12, // Slightly larger border radius
    backgroundColor: colors.card, // Use white for better contrast with sheet background
    // Subtle shadow for card effect
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minWidth: 120, // Ensure a minimum width
    justifyContent: 'center',
  },
  receiptSheetOptionText: {
    marginTop: spacing.xs,
    fontSize: fontSize.medium,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  receiptSheetCancel: {
    backgroundColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  receiptSheetCancelText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  historySection: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  listSpacer: {

    flex: 1,

    minHeight: 280,

  },

  chatList: {
    gap: spacing.md,
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
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  chatRowDebit: {
    alignItems: 'flex-start',
  },
  chatBubble: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    minWidth: '70%',
    overflow: 'hidden',
  },
  chatBubbleDebit: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  chatHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(colors.success, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatIconDebit: {
    backgroundColor: withAlpha(colors.error, 0.1),
  },
  chatIconTransfer: {
    backgroundColor: colors.primarySoft,
  },
  chatAmount: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.success,
    flex: 1,
  },
  chatAmountDebit: {
    color: colors.error,
  },
  chatAmountTransfer: {
    color: colors.text.primary,
  },
  chatAmountRequest: {
    color: colors.success,
  },
  chatTime: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  chatRemark: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  editHistoryText: {
    marginTop: 4,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  chatMetaDebit: {
    alignItems: 'flex-start',
  },
  chatMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatBalance: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  transferLogCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: 0,
    overflow: 'hidden',
  },
  transferLogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  transferLogBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    maxHeight: 156,
  },
  transferLogBodyContent: {
    gap: spacing.xs,
  },
  transferLogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  transferLogMarkerWrap: {
    width: 18,
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  transferLogDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  transferLogDotTransfer: {
    backgroundColor: colors.primary,
  },
  transferLogDotRequest: {
    backgroundColor: colors.success,
  },
  transferLogConnector: {
    width: 1,
    flex: 1,
    marginTop: 3,
    backgroundColor: colors.border,
    minHeight: 18,
  },
  transferLogContent: {
    flex: 1,
    paddingBottom: spacing.xs,
  },
  transferLogText: {
    fontSize: fontSize.small,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
    lineHeight: 18,
  },
  transferLogMeta: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginTop: 2,
  },
  emptyHistory: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    marginTop: 12,
    textAlign: 'center',

  },
  bottomSection: {
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: spacing.md,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomNavIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  balanceLabel: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  balanceAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceValue: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.success,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  withdrawCtaButton: {
    flex: 1,
  },
  transferButton: {
    flex: 1,
  },
  givenCtaButton: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    position: 'relative',
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
  modalTextInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  entryDateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  entryDateTimeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.input,
  },
  entryDateTimeLabel: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  entryDateTimeValue: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
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
  noteInputWithAttach: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  modalNoteInputPadded: {
    paddingRight: 40, // Make space for the attach button
  },
  attachButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor: 'red', // For debugging positioning
  },

  receiptPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  receiptThumbWrapper: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  receiptThumb: {
    width: '100%',
    height: '100%',
  },
  receiptActions: {
    flex: 1,
    gap: 8,
  },
  receiptActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  receiptActionText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  receiptRemoveButton: {
    backgroundColor: withAlpha(colors.error, 0.1),
    borderColor: withAlpha(colors.error, 0.4),
  },
  receiptRemoveText: {
    color: colors.error,
  },
  receiptBubbleThumb: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  receiptBubbleImage: {
    width: 180,
    height: 110,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  previewViewer: {
    width: '100%',
    height: '100%',
  },
  previewHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  previewHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewContent: {
    width: '100%',
    height: '80%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.black,
  },
  previewImage: {
    width: '100%',
    height: '100%',
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
    backgroundColor: colors.card,
    paddingLeft: 14,
  },
  amountInputBare: {
    flex: 55,
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
    flex: 45,
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
    backgroundColor: colors.card,
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
  modalAddButton: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalAddButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.bold,
    color: colors.onPrimary,
  },
  transferList: {
    maxHeight: 280,
  },
  transferItem: {
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.card,
    marginBottom: spacing.xs,
  },
  transferName: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  scheduledFab: {
    position: 'absolute',
    right: spacing.md,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
  },
  scheduledFabBadge: {
    position: 'absolute',
    top: -4,
    right: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
  },
  scheduledFabBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
});

export default ExpensesAccountDetailScreen;
