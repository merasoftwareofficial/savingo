import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  BackHandler,
  Platform,
  LayoutAnimation,
  UIManager,
  Animated,
  TextInput,
  Keyboard,
  InteractionManager,
  NativeModules,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import FaArrowCircleDown from '../components/icons/FaArrowCircleDown';
import BsCashCoin from '../components/icons/BsCashCoin';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import FaArrowCircleUp from '../components/icons/FaArrowCircleUp';
import RenameAccountModal from '../components/RenameAccountModal';
import SetupRequirePopup from '../components/setuprequirepopup';
import {buildDashboardAccountMenuActions} from '../components/actions/accountMenuActions';
import DashboardPeriodFilter from '../components/DashboardPeriodFilter';
import DashboardAccountSection from '../ui/DashboardAccountSection';
import CombinedAccountsCard from '../ui/CombinedAccountsCard';
import {QUICK_PERIODS} from '../components/DashboardQuickPeriodSheet';
import {
  getAllAccounts,
  renameAccount,
  deleteAccountAndTransactions,
  updateAccountPrimary,
  updateAccountSortIndex,
} from '../services/accountsDatabase';
import {
  getAllTransactions,
} from '../services/transactionsDatabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useToast} from '../hooks/useToast';
import {useFocusEffect} from '@react-navigation/native';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {useResolvedHeaderTextureVariant} from '../hooks/useAdaptiveThemeAccent';
import {createPerfTimer, perfLog, perfNow} from '../utils/perfLogger';
import {
  DASHBOARD_SHOW_SAVINGS_BALANCE_KEY,
  calculateAccountsNetBalance,
  getNetBalanceLabel,
} from '../utils/dashboardNetBalance';
import {requiresProfileSetup} from '../utils/profileReadiness';
import {readCachedSessionUser} from '../services/sessionService';
import {
  calculateAccountsPeriodData,
  getMonthYearRange,
  getMonthlyRangeFromStartDay,
} from '../services/accountsPeriodCore';
import {
  clearAccountsPeriodState,
  loadAccountsPeriodState,
  saveAccountsPeriodState,
} from '../services/accountsPeriodStateStorage';
import {subscribeToAccountsChanged} from '../services/accountsChangeBus';


const MONTH_START_DAY_KEY = 'monthStartDay';
const DEFAULT_MONTH_START_DAY = 1;
const DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY = 'dashboard_hide_saving_accounts';
const DASHBOARD_FOCUS_REFRESH_COOLDOWN_MS = 450;
const DASHBOARD_FOCUS_STALE_REFRESH_MS = 30000;
const TRANSFER_PREF_DEFER_MS = 3200;
const TRANSFER_PREF_BATCH_SIZE = 3;
const EARNING_SHOW_TRANSFER_ENTRIES_KEY_PREFIX = 'earningShowTransferEntries';
const EXPENSES_SHOW_TRANSFER_ENTRIES_KEY_PREFIX = 'expensesShowTransferEntries';
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';
const SOFT_REFRESH_MIN_INTERVAL_MS = 500;
const SOFT_REFRESH_INDICATOR_MIN_MS = 600;
const CREDIT_CARD_NOTICE_DISMISSED_KEY = 'creditCardAccounts.noticeDismissed.v1';

const readAllTransactionsWithPerf = (dashboardPerf, stage) => {
  const startedAt = perfNow();
  const transactions = getAllTransactions();
  dashboardPerf('transactions-read', {
    stage,
    transactionCount: transactions.length,
    durationMs: Math.max(0, perfNow() - startedAt),
  });
  return transactions;
};

const hexToRgba = (hex, opacity) => {
  if (!hex) return `rgba(0,0,0,${opacity})`;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0,0,0,${opacity})`;
  return `rgba(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)},${opacity})`;
};

const renderAccountIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }
  return <Icon name={iconName} size={size} color={color} />;
};

const AllAccountsScreen = ({navigation, route}) => {
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
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const screenMountedAtRef = useRef(perfNow());

  // Period selection states
  const [quickPeriod, setQuickPeriod] = useState('10days');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);

  // Filtered data states
  const [filteredEarning, setFilteredEarning] = useState(0);
  const [filteredWithdrawals, setFilteredWithdrawals] = useState(0);
  const [hasRecords, setHasRecords] = useState(true);
  const [periodAccountAmounts, setPeriodAccountAmounts] = useState({});
  const [periodAccountExpenses, setPeriodAccountExpenses] = useState({});
  const [closingAccountBalances, setClosingAccountBalances] = useState({});
  const [fabExpanded, setFabExpanded] = useState(false);

  // Other states
  const [accounts, setAccounts] = useState([]);
  const [isInitialDashboardLoading, setIsInitialDashboardLoading] = useState(true);
  const [isSoftRefreshing, setIsSoftRefreshing] = useState(false);
  const [monthStartDay, setMonthStartDay] = useState(DEFAULT_MONTH_START_DAY);
  const [showSavingsBalanceInDashboard, setShowSavingsBalanceInDashboard] =
    useState(true);
  const [hideSavingAccountsOnDashboard, setHideSavingAccountsOnDashboard] =
    useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const selectedAccountRef = useRef(null);
  const deletePressGuardRef = useRef(false);
  const renameInputRef = useRef(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTargetAccount, setRenameTargetAccount] = useState(null);
  const [newAccountName, setNewAccountName] = useState('');
  const {showToast} = useToast();
  const currencySymbol = useCurrencySymbol();
  const themeAccent = useResolvedHeaderTextureVariant();
  const fabSurfaceTone = themeAccent?.surfaceToneStrong || themeAccent?.selectionTone;
  const fabBorderTone = themeAccent?.borderTone || themeAccent?.ring;
  const fabIconColor = colors.white;
  const fabThemeColor = themeAccent.accentSelection || themeAccent.accentPrimary;

  // Setup completion popup states
  const [showSetupPopup, setShowSetupPopup] = useState(false);
  const [popupDismissedThisSession, setPopupDismissedThisSession] =
    useState(false);
  const [startupNeverShowChecked, setStartupNeverShowChecked] = useState(false);
  const [showStartupNeverShowCheckbox, setShowStartupNeverShowCheckbox] =
    useState(false);
  const [showCreditCardNotice, setShowCreditCardNotice] = useState(false);
  const [creditCardNoticeDontShow, setCreditCardNoticeDontShow] =
    useState(false);
  const startupNeverShowKeyRef = useRef('');
  const startupPopupShowCountKeyRef = useRef('');
  const suppressSetupPopupOnceRef = useRef(
    route?.params?.suppressSetupPopupOnce === true
  );
  const lastDashboardRefreshAtRef = useRef(0);
  const transferEntriesPreferenceRef = useRef({});
  const transferPrefLoadTimerRef = useRef(null);
  const transferPrefInteractionTaskRef = useRef(null);
  const monthStartDayTaskRef = useRef(null);
  const focusRefreshTaskRef = useRef(null);
  const softRefreshInProgressRef = useRef(false);
  const softRefreshLastAtRef = useRef(0);
  const softRefreshHideTimerRef = useRef(null);
  const updateFilteredRunRef = useRef(0);
  const hasLoadedAccountsOnceRef = useRef(false);
  const lastAppliedFilterSignatureRef = useRef('');
  const pendingAccountsHydrationSignatureRef = useRef(null);
  const refreshDashboardDataRef = useRef(null);
  const updateFilteredDataRef = useRef(null);
  const runSoftRefreshRef = useRef(null);
  const dashboardPerf = useCallback((event, payload = {}) => {
    perfLog('dashboard-screen', event, payload);
  }, []);

  const fabRef = useRef(null);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const bottomInsetWithFallback =
    insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? 18 : 0;
  const fabBottomOffset = spacing.lg + bottomInsetWithFallback;
  const fabActionsBottomOffset = fabBottomOffset + 64;

  const focusRenameInput = useCallback(() => {
    const focus = () => renameInputRef.current?.focus();
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(focus);
      setTimeout(focus, 120);
    });
  }, []);

  const renameModalStyles = {
    ...styles,
    modalOverlay: styles.renameModalOverlay,
    modalBackdrop: styles.renameModalBackdrop,
    modalSheet: styles.renameModalSheet,
    modalHandle: styles.renameModalHandle,
    modalTitle: styles.renameModalTitle,
    modalTextInput: styles.renameModalTextInput,
    modalAddButton: styles.renameModalAddButton,
    modalAddButtonText: styles.renameModalAddButtonText,
  };

  const netBalance = React.useMemo(() => {
    const useHistoricalClosing =
      selectedMonth !== null && selectedYear !== null;
    return calculateAccountsNetBalance({
      accounts,
      closingAccountBalances,
      showSavingsBalanceInNet: showSavingsBalanceInDashboard,
      useHistoricalClosing,
    });
  }, [
    accounts,
    closingAccountBalances,
    selectedMonth,
    selectedYear,
    showSavingsBalanceInDashboard,
  ]);
  const metricsLabels = React.useMemo(
    () => ({
      earning: 'Earning',
      expenses: 'Expenses',
      getNetLabel: getNetBalanceLabel,
    }),
    [],
  );

  const earningAccounts = React.useMemo(
    () => accounts.filter(account => account.account_type === 'earning'),
    [accounts],
  );

  const savingAccounts = React.useMemo(
    () => accounts.filter(account => account.account_type === 'saving'),
    [accounts],
  );

  const expenseAccounts = React.useMemo(
    () => accounts.filter(account => account.account_type === 'expenses'),
    [accounts],
  );

  const creditAccounts = React.useMemo(
    () => accounts.filter(account => account.account_type === 'credit'),
    [accounts],
  );

  const loadShowSavingsBalancePreference = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(DASHBOARD_SHOW_SAVINGS_BALANCE_KEY);
      if (stored === '0') {
        setShowSavingsBalanceInDashboard(false);
        return;
      }
      setShowSavingsBalanceInDashboard(true);
    } catch (error) {
      console.error('Failed to load dashboard savings visibility setting:', error);
      setShowSavingsBalanceInDashboard(true);
    }
  }, []);

  const loadHideSavingAccountsPreference = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY);
      setHideSavingAccountsOnDashboard(stored === '1');
    } catch (error) {
      console.error('Failed to load hide saving accounts setting:', error);
      setHideSavingAccountsOnDashboard(false);
    }
  }, []);

  const handleAddAccountPress = () => {
    const next = !fabExpanded;
    setFabExpanded(next);
    Animated.timing(fabAnim, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeFabMenu = () => {
    setFabExpanded(false);
    Animated.timing(fabAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (!fabExpanded) {
          return false;
        }
        closeFabMenu();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );

      return () => {
        backHandler.remove();
      };
    }, [fabExpanded]),
  );

  const openAddAccount = type => {
    closeFabMenu();
    navigation.navigate('AddAccount', {accountType: type});
  };

  const selectedAccountIndex = React.useMemo(() => {
    if (!selectedAccount) {
      return -1;
    }
    return accounts.findIndex(
      account => String(account.id) === String(selectedAccount.id)
    );
  }, [accounts, selectedAccount]);

  const selectedAccountType = selectedAccount?.account_type;
  const accountsOfType = React.useMemo(() => {
    if (!selectedAccountType) {
      return [];
    }
    return accounts.filter(
      account => account.account_type === selectedAccountType
    );
  }, [accounts, selectedAccountType]);
  const selectedAccountTypeIndex = React.useMemo(() => {
    if (!selectedAccount) {
      return -1;
    }
    return accountsOfType.findIndex(
      account => String(account.id) === String(selectedAccount.id)
    );
  }, [accountsOfType, selectedAccount]);
  const canMoveWithinType = accountsOfType.length >= 2;
  const isMoveUpDisabled = !canMoveWithinType || selectedAccountTypeIndex <= 0;
  const isMoveDownDisabled =
    !canMoveWithinType ||
    selectedAccountTypeIndex < 0 ||
    selectedAccountTypeIndex >= accountsOfType.length - 1;

  // Animation values
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(300)).current;

  // Initialize database and load accounts on mount
  useEffect(() => {
    let deferredPrefsTask = null;
    const perf = createPerfTimer('dashboard-screen', 'initial-bootstrap');
      setIsInitialDashboardLoading(true);
    try {
      deferredPrefsTask = InteractionManager.runAfterInteractions(() => {
        refreshDashboardDataRef.current?.({
          reason: 'initial-bootstrap',
          refreshMonthStartDay: true,
          refreshPreferences: true,
        });
        setIsInitialDashboardLoading(false);
        dashboardPerf('initial-bootstrap:deferred-pref-load-dispatched');
      });
      lastDashboardRefreshAtRef.current = Date.now();
      perf.end();
    } catch (error) {
      console.error('Failed to initialize accounts database:', error);
      setIsInitialDashboardLoading(false);
      perf.fail(error);
    }
    return () => {
      deferredPrefsTask?.cancel?.();
      if (focusRefreshTaskRef.current?.cancel) {
        focusRefreshTaskRef.current.cancel();
      }
      if (monthStartDayTaskRef.current?.cancel) {
        monthStartDayTaskRef.current.cancel();
      }
      if (softRefreshHideTimerRef.current) {
        clearTimeout(softRefreshHideTimerRef.current);
        softRefreshHideTimerRef.current = null;
      }
      focusRefreshTaskRef.current = null;
      monthStartDayTaskRef.current = null;
    };
  }, [
    dashboardPerf,
  ]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadPeriodPreferences = async () => {
      try {
        const storedState = await loadAccountsPeriodState({scope: 'allAccounts'});
        if (!active || !storedState) {
          return;
        }

        const validQuickPeriods = QUICK_PERIODS.map(item => item.value);
        if (storedState.quickPeriod && validQuickPeriods.includes(storedState.quickPeriod)) {
          setQuickPeriod(storedState.quickPeriod);
        }
        setSelectedMonth(storedState.selectedMonth);
        setSelectedYear(storedState.selectedYear);
        setCustomStartDate(storedState.customStartDate);
        setCustomEndDate(storedState.customEndDate);
      } catch (error) {
        console.error('Failed to load accounts period preference:', error);
      }
    };

    loadPeriodPreferences();

    return () => {
      active = false;
    };
  }, []);

  const runPinReorderAnimation = () => {
    LayoutAnimation.configureNext({
      duration: 600,
      update: {type: LayoutAnimation.Types.easeInEaseOut},
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.scaleXY,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  };

  // Refresh accounts when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const focusStartedAt = perfNow();
      const now = Date.now();
      const sinceLastRefreshMs = Math.max(
        0,
        now - lastDashboardRefreshAtRef.current
      );
      if (sinceLastRefreshMs < DASHBOARD_FOCUS_REFRESH_COOLDOWN_MS) {
        dashboardPerf('focus-refresh:skipped-cooldown', {
          sinceLastRefreshMs,
        });
        return;
      }
      if (sinceLastRefreshMs < DASHBOARD_FOCUS_STALE_REFRESH_MS) {
        dashboardPerf('focus-refresh:skipped-fresh-state', {
          sinceLastRefreshMs,
        });
        return;
      }
      if (focusRefreshTaskRef.current?.cancel) {
        focusRefreshTaskRef.current.cancel();
      }
      focusRefreshTaskRef.current = InteractionManager.runAfterInteractions(() => {
        focusRefreshTaskRef.current = null;
        const refreshNow = Date.now();
        const sinceLastRefreshAfterInteractionsMs = Math.max(
          0,
          refreshNow - lastDashboardRefreshAtRef.current
        );
        if (
          sinceLastRefreshAfterInteractionsMs <
          DASHBOARD_FOCUS_REFRESH_COOLDOWN_MS
        ) {
          dashboardPerf('focus-refresh:skipped-cooldown-after-interactions', {
            sinceLastRefreshMs: sinceLastRefreshAfterInteractionsMs,
          });
          return;
        }
        if (
          sinceLastRefreshAfterInteractionsMs <
          DASHBOARD_FOCUS_STALE_REFRESH_MS
        ) {
          dashboardPerf('focus-refresh:skipped-fresh-state-after-interactions', {
            sinceLastRefreshMs: sinceLastRefreshAfterInteractionsMs,
          });
          return;
        }
        refreshDashboardDataRef.current?.({
          reason: 'focus',
          refreshMonthStartDay: true,
          refreshPreferences: true,
        });
        dashboardPerf('focus-refresh:triggered', {
          dispatchMs: Math.max(0, perfNow() - focusStartedAt),
        });
        // updateFilteredData is derived from state effects, avoid triggering duplicates on focus.
      });
    });

    return () => {
      unsubscribe();
      if (focusRefreshTaskRef.current?.cancel) {
        focusRefreshTaskRef.current.cancel();
        focusRefreshTaskRef.current = null;
      }
    };
  }, [
    navigation,
    dashboardPerf,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      DASHBOARD_DATA_CHANGED_EVENT,
      payload => {
        InteractionManager.runAfterInteractions(() => {
          runSoftRefreshRef.current?.(payload?.source || 'event');
        });
      }
    );
    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const sub = subscribeToAccountsChanged(payload => {
      InteractionManager.runAfterInteractions(() => {
        runSoftRefreshRef.current?.(payload?.source || 'accounts-change');
      });
    });
    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    dashboardPerf('screen-mounted');
    return () => {
      if (transferPrefLoadTimerRef.current) {
        clearTimeout(transferPrefLoadTimerRef.current);
        transferPrefLoadTimerRef.current = null;
      }
      if (transferPrefInteractionTaskRef.current?.cancel) {
        transferPrefInteractionTaskRef.current.cancel();
        transferPrefInteractionTaskRef.current = null;
      }
      if (focusRefreshTaskRef.current?.cancel) {
        focusRefreshTaskRef.current.cancel();
        focusRefreshTaskRef.current = null;
      }
      if (monthStartDayTaskRef.current?.cancel) {
        monthStartDayTaskRef.current.cancel();
      }
      monthStartDayTaskRef.current = null;
      dashboardPerf('screen-unmounted', {
        aliveMs: Math.max(0, perfNow() - screenMountedAtRef.current),
      });
    };
  }, [dashboardPerf]);

  const buildAccountsSignature = useCallback(accountsSource => {
    const effectiveAccounts = Array.isArray(accountsSource) ? accountsSource : [];
    return effectiveAccounts
      .map(account => {
        const accountId = String(account?.id || '').trim();
        const accountType = String(account?.account_type || '').trim();
        const balance = Number(account?.balance) || 0;
        return `${accountId}:${accountType}:${balance}`;
      })
      .join('|');
  }, []);

  const buildDashboardFilterSignature = useCallback(
    (accountsSource = accounts) => {
      const effectiveAccounts = Array.isArray(accountsSource)
        ? accountsSource
        : accounts;
      const accountSignature = buildAccountsSignature(effectiveAccounts);

      return JSON.stringify({
        quickPeriod,
        selectedMonth,
        selectedYear,
        customStartDate,
        customEndDate,
        monthStartDay,
        accountSignature,
      });
    },
    [
      accounts,
      buildAccountsSignature,
      customEndDate,
      customStartDate,
      monthStartDay,
      quickPeriod,
      selectedMonth,
      selectedYear,
    ],
  );

  // Update filtered data when period selection changes
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const currentAccountsSignature = buildAccountsSignature(accounts);
      const pendingAccountsHydrationSignature =
        pendingAccountsHydrationSignatureRef.current;
      if (
        pendingAccountsHydrationSignature !== null &&
        pendingAccountsHydrationSignature !== currentAccountsSignature
      ) {
        dashboardPerf('update-filtered-data:skipped-stale-state-effect', {
          accountsCount: accounts.length,
          pendingAccountsHydrationSignature,
          currentAccountsSignature,
        });
        return;
      }
      const nextSignature = buildDashboardFilterSignature(accounts);
      if (nextSignature === lastAppliedFilterSignatureRef.current) {
        dashboardPerf('update-filtered-data:skipped-duplicate-state-effect', {
          accountsCount: accounts.length,
        });
        return;
      }
      updateFilteredDataRef.current?.(accounts, 'state-effect');
      pendingAccountsHydrationSignatureRef.current = null;
    });
    return () => task.cancel();
  }, [
    accounts,
    buildAccountsSignature,
    buildDashboardFilterSignature,
    dashboardPerf,
    quickPeriod,
    selectedMonth,
    selectedYear,
    monthStartDay,
    customStartDate,
    customEndDate,
  ]);

  useEffect(() => {
    if (!renameModalVisible) {
      return;
    }
    const timer = setTimeout(() => {
      focusRenameInput();
    }, 250);
    return () => clearTimeout(timer);
  }, [renameModalVisible, focusRenameInput]);

  const hasBasicDetails = userData => {
    const name = String(userData?.displayName || userData?.name || '').trim();
    const phone = String(
      userData?.phoneNumber || userData?.mobile || ''
    ).trim();
    const currency = String(
      userData?.currencySymbol ||
        userData?.currency ||
        userData?.currency_symbol ||
        ''
    ).trim();
    return Boolean(name) && Boolean(phone) && Boolean(currency);
  };

  const getStartupNeverShowKey = userData => {
    const firebaseUid = String(userData?.firebaseUid || '').trim();
    if (firebaseUid) {
      return `startupSetupPopup.neverShow.${firebaseUid}`;
    }
    const email = String(userData?.email || '').trim().toLowerCase();
    if (email) {
      return `startupSetupPopup.neverShow.${email}`;
    }
    return '';
  };

  const getStartupPopupShowCountKey = userData => {
    const firebaseUid = String(userData?.firebaseUid || '').trim();
    if (firebaseUid) {
      return `startupSetupPopup.showCount.${firebaseUid}`;
    }
    const email = String(userData?.email || '').trim().toLowerCase();
    if (email) {
      return `startupSetupPopup.showCount.${email}`;
    }
    return '';
  };

  useEffect(() => {
    let cancelled = false;
    const checkCreditCardNotice = async () => {
      if (isInitialDashboardLoading) {
        return;
      }
      if (creditAccounts.length > 0) {
        setShowCreditCardNotice(false);
        return;
      }
      try {
        const dismissed = await AsyncStorage.getItem(CREDIT_CARD_NOTICE_DISMISSED_KEY);
        if (cancelled) {
          return;
        }
        const shouldSkip = dismissed === 'true';
        setCreditCardNoticeDontShow(shouldSkip);
        setShowCreditCardNotice(!shouldSkip);
      } catch (error) {
        console.error('Failed to read credit card notice preference:', error);
      }
    };

    checkCreditCardNotice();
    return () => {
      cancelled = true;
    };
  }, [creditAccounts.length, isInitialDashboardLoading]);

  // Check setup completion status on screen focus
  useFocusEffect(
    React.useCallback(() => {
      const checkSetupStatus = async () => {
        try {
          if (suppressSetupPopupOnceRef.current) {
            suppressSetupPopupOnceRef.current = false;
            setShowSetupPopup(false);
            setPopupDismissedThisSession(true);
            return;
          }
          const userData = await readCachedSessionUser();
          if (Object.keys(userData || {}).length > 0) {
            const neverShowKey = getStartupNeverShowKey(userData);
            const showCountKey = getStartupPopupShowCountKey(userData);
            startupNeverShowKeyRef.current = neverShowKey;
            startupPopupShowCountKeyRef.current = showCountKey;
            const neverShowValue = neverShowKey
              ? await AsyncStorage.getItem(neverShowKey)
              : null;
            const neverShowEnabled = neverShowValue === 'true';
            setStartupNeverShowChecked(neverShowEnabled);
            if (neverShowEnabled) {
              setShowSetupPopup(false);
              setShowStartupNeverShowCheckbox(false);
              return;
            }
            const missingDetails = !hasBasicDetails(userData);
            if (
              requiresProfileSetup(userData) &&
              missingDetails &&
              !popupDismissedThisSession
            ) {
              let nextShowCount = 1;
              if (showCountKey) {
                const rawCount = await AsyncStorage.getItem(showCountKey);
                const parsedCount =
                  Number.parseInt(String(rawCount || '0'), 10) || 0;
                nextShowCount = parsedCount + 1;
                await AsyncStorage.setItem(showCountKey, String(nextShowCount));
              }
              setShowStartupNeverShowCheckbox(nextShowCount >= 3);
              setShowSetupPopup(true);
            } else {
              setShowStartupNeverShowCheckbox(false);
            }
          }
        } catch (error) {
          console.error('Error checking setup status:', error);
        }
      };

      checkSetupStatus();
    }, [popupDismissedThisSession])
  );

  const handleToggleStartupNeverShow = async () => {
    const nextValue = !startupNeverShowChecked;
    setStartupNeverShowChecked(nextValue);
    try {
      const key = startupNeverShowKeyRef.current;
      if (!key) {
        return;
      }
      await AsyncStorage.setItem(key, nextValue ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save startup popup never-show preference:', error);
    }
  };

  const handleOpenProfileSetup = async () => {
    setShowSetupPopup(false);
    try {
      const parsedUser = await readCachedSessionUser();
      navigation.navigate('ProfileSetup', {user: parsedUser || {}});
    } catch (error) {
      console.error('Failed to open profile setup from startup popup:', error);
      navigation.navigate('ProfileSetup', {user: {}});
    }
  };

  const handleRemindLater = () => {
    setShowSetupPopup(false);
    setPopupDismissedThisSession(true);
  };

  const handleToggleCreditCardNoticeDontShow = () => {
    setCreditCardNoticeDontShow(prev => !prev);
  };

  const handleCloseCreditCardNotice = async () => {
    setShowCreditCardNotice(false);
    if (!creditCardNoticeDontShow) {
      return;
    }
    try {
      await AsyncStorage.setItem(CREDIT_CARD_NOTICE_DISMISSED_KEY, 'true');
    } catch (error) {
      console.error('Failed to save credit card notice preference:', error);
    }
  };

  const normalizeMonthStartDay = value => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_MONTH_START_DAY;
    }
    return Math.min(28, Math.max(1, Math.floor(parsed)));
  };

  const loadMonthStartDay = useCallback(async () => {
    const perf = createPerfTimer('dashboard-screen', 'load-month-start-day');
    try {
      const stored = await AsyncStorage.getItem(MONTH_START_DAY_KEY);
      setMonthStartDay(normalizeMonthStartDay(stored));
      perf.end({
        storedValuePresent: Boolean(String(stored || '').trim()),
      });
    } catch (error) {
      console.error('Failed to load month start day:', error);
      perf.fail(error);
    }
  }, []);

  const scheduleMonthStartDayRefresh = useCallback(() => {
    if (monthStartDayTaskRef.current?.cancel) {
      monthStartDayTaskRef.current.cancel();
    }
    monthStartDayTaskRef.current = InteractionManager.runAfterInteractions(() => {
      void loadMonthStartDay();
    });
  }, [loadMonthStartDay]);

  const scheduleDashboardPreferenceRefresh = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      void loadShowSavingsBalancePreference();
      void loadHideSavingAccountsPreference();
    });
  }, [loadHideSavingAccountsPreference, loadShowSavingsBalancePreference]);

  // Load accounts from database with updated balances
  const loadAccounts = useCallback(() => {
    const startedAt = perfNow();
    try {
      const accountsList = getAllAccounts();
      hasLoadedAccountsOnceRef.current = true;
      pendingAccountsHydrationSignatureRef.current =
        buildAccountsSignature(accountsList);
      setAccounts(accountsList);
      dashboardPerf('load-accounts:sync-complete', {
        accountsCount: accountsList.length,
        durationMs: Math.max(0, perfNow() - startedAt),
      });
      if (transferPrefLoadTimerRef.current) {
        clearTimeout(transferPrefLoadTimerRef.current);
      }
      if (transferPrefInteractionTaskRef.current?.cancel) {
        transferPrefInteractionTaskRef.current.cancel();
        transferPrefInteractionTaskRef.current = null;
      }
      transferPrefLoadTimerRef.current = setTimeout(() => {
        transferPrefLoadTimerRef.current = null;
        transferPrefInteractionTaskRef.current = InteractionManager.runAfterInteractions(() => {
          transferPrefInteractionTaskRef.current = null;
          void (async () => {
            const asyncStartedAt = perfNow();
            const transferAccounts = accountsList.filter(account => {
              const type = String(account?.account_type || '').toLowerCase();
              return type === 'earning' || type === 'expenses';
            });
            if (transferAccounts.length === 0) {
              transferEntriesPreferenceRef.current = {};
              dashboardPerf('load-accounts:transfer-pref-skipped', {
                reason: 'no-transfer-accounts',
                durationMs: Math.max(0, perfNow() - asyncStartedAt),
              });
              return;
            }
            const keyMap = {};
            const pairs = transferAccounts.map(account => {
              const accountType = String(account.account_type).toLowerCase();
              const keyPrefix =
                accountType === 'earning'
                  ? EARNING_SHOW_TRANSFER_ENTRIES_KEY_PREFIX
                  : EXPENSES_SHOW_TRANSFER_ENTRIES_KEY_PREFIX;
              const key = `${keyPrefix}_${account.id}`;
              keyMap[key] = String(account.id);
              return key;
            });
            const storedPairs = [];
            for (let i = 0; i < pairs.length; i += TRANSFER_PREF_BATCH_SIZE) {
              const batch = pairs.slice(i, i + TRANSFER_PREF_BATCH_SIZE);
              // Keep JS thread responsive by splitting AsyncStorage reads in small batches.
              // This preserves behavior while reducing startup stalls on slower devices.
              // eslint-disable-next-line no-await-in-loop
              const batchPairs = await AsyncStorage.multiGet(batch);
              storedPairs.push(...batchPairs);
              // eslint-disable-next-line no-await-in-loop
              await new Promise(resolve => setTimeout(resolve, 0));
            }
            const nextPreferences = {};
            storedPairs.forEach(([key, value]) => {
              const accountId = keyMap[key];
              if (accountId) {
                nextPreferences[accountId] = value === '1';
              }
            });
            transferEntriesPreferenceRef.current = nextPreferences;
            dashboardPerf('load-accounts:transfer-pref-loaded', {
              transferAccountsCount: transferAccounts.length,
              preferenceCount: Object.keys(nextPreferences).length,
              durationMs: Math.max(0, perfNow() - asyncStartedAt),
            });
          })().catch(error => {
            console.error('Failed to preload transfer entry settings:', error);
            dashboardPerf('load-accounts:transfer-pref-error', {
              error: String(error?.message || error || 'unknown'),
            });
          });
        });
      }, TRANSFER_PREF_DEFER_MS);
      // Note: Filtered earning/withdrawal data will be calculated by updateFilteredData()
      return accountsList;
    } catch (error) {
      console.error('Failed to load accounts:', error);
      dashboardPerf('load-accounts:error', {
        error: String(error?.message || error || 'unknown'),
        durationMs: Math.max(0, perfNow() - startedAt),
      });
      return [];
    }
  }, [buildAccountsSignature, dashboardPerf]);

  const openAccount = useCallback(
    account => {
      if (!account?.id) {
        return;
      }
      const openStartedAt = perfNow();
      const type = String(account?.account_type || '').toLowerCase();
      const targetScreen =
        type === 'earning'
          ? 'AccountDetail'
          : type === 'credit'
          ? 'CreditCardAccountDetail'
          : 'ExpensesAccountDetail';
      dashboardPerf('account-open:start', {
        accountId: String(account.id),
        accountType: type || 'unknown',
        targetScreen,
      });
      const accountId = String(account.id);
      const initialShowTransferEntries =
        (type === 'earning' || type === 'expenses') &&
        transferEntriesPreferenceRef.current[accountId] === true;
      dashboardPerf('account-open:navigate', {
        accountId: String(account.id),
        accountType: type || 'unknown',
        targetScreen,
        initialShowTransferEntries,
        durationMs: Math.max(0, perfNow() - openStartedAt),
      });
      navigation.navigate(targetScreen, {
        account,
        initialShowTransferEntries,
        __perfOpenStartedAt: openStartedAt,
      });
    },
    [dashboardPerf, navigation]
  );


  const updateFilteredData = useCallback(
    (accountsSource = accounts, reason = 'state-effect') => {
      const effectiveAccounts = Array.isArray(accountsSource)
        ? accountsSource
        : accounts;
      if (!hasLoadedAccountsOnceRef.current) {
        dashboardPerf('update-filtered-data:skipped-awaiting-accounts', {
          reason,
        });
        return;
      }

      const runId = ++updateFilteredRunRef.current;
      const startedAt = perfNow();
      const signature = buildDashboardFilterSignature(effectiveAccounts);
      const allTransactions = readAllTransactionsWithPerf(
        dashboardPerf,
        'update-filtered-data',
      );
      const summary = calculateAccountsPeriodData({
        quickPeriod,
        selectedMonth,
        selectedYear,
        customStartDate,
        customEndDate,
        monthStartDay,
        accountsSource: effectiveAccounts,
        transactionsSource: allTransactions,
      });
      setFilteredEarning(summary.filteredEarning);
      setFilteredWithdrawals(summary.filteredWithdrawals);
      setHasRecords(summary.hasRecords);
      setPeriodAccountAmounts(summary.periodAccountAmounts);
      setPeriodAccountExpenses(summary.periodAccountExpenses);
      setClosingAccountBalances(summary.closingAccountBalances);
      lastAppliedFilterSignatureRef.current = signature;
      dashboardPerf('update-filtered-data:complete', {
        runId,
        reason,
        mode: summary.mode,
        accountsCount: effectiveAccounts.length,
        recordCount: summary.recordCount,
        durationMs: Math.max(0, perfNow() - startedAt),
      });
    },
    [
      accounts,
      customEndDate,
      customStartDate,
      buildDashboardFilterSignature,
      dashboardPerf,
      monthStartDay,
      quickPeriod,
      selectedMonth,
      selectedYear,
    ],
  );

  const refreshDashboardData = useCallback(
    ({
      reason = 'unknown',
      refreshMonthStartDay = false,
      refreshPreferences = false,
    } = {}) => {
      const startedAt = perfNow();
      lastDashboardRefreshAtRef.current = Date.now();
      const accountsList = loadAccounts();

      if (refreshMonthStartDay) {
        scheduleMonthStartDayRefresh();
      }
      if (refreshPreferences) {
        scheduleDashboardPreferenceRefresh();
      }

      updateFilteredData(accountsList, `refresh:${reason}`);
      dashboardPerf('dashboard-refresh:complete', {
        reason,
        accountsCount: accountsList.length,
        durationMs: Math.max(0, perfNow() - startedAt),
      });
      return accountsList;
    },
    [
      dashboardPerf,
      loadAccounts,
      scheduleDashboardPreferenceRefresh,
      scheduleMonthStartDayRefresh,
      updateFilteredData,
    ],
  );
  refreshDashboardDataRef.current = refreshDashboardData;

  const runSoftRefresh = useCallback(
    source => {
      const refreshSource = String(source || 'unknown');
      const now = Date.now();
      if (softRefreshInProgressRef.current) {
        dashboardPerf('soft-refresh:skipped-busy', {source: refreshSource});
        return;
      }
      if (now - softRefreshLastAtRef.current < SOFT_REFRESH_MIN_INTERVAL_MS) {
        dashboardPerf('soft-refresh:skipped-debounce', {
          source: refreshSource,
          sinceLastRefreshMs: Math.max(0, now - softRefreshLastAtRef.current),
        });
        return;
      }

      softRefreshInProgressRef.current = true;
      softRefreshLastAtRef.current = now;
      const startedAt = perfNow();
      setIsSoftRefreshing(true);

      try {
        refreshDashboardData({reason: `soft:${refreshSource}`});
      } catch (error) {
        console.error('Soft refresh failed:', error);
      }

      if (softRefreshHideTimerRef.current) {
        clearTimeout(softRefreshHideTimerRef.current);
      }
      softRefreshHideTimerRef.current = setTimeout(() => {
        softRefreshHideTimerRef.current = null;
        softRefreshInProgressRef.current = false;
        setIsSoftRefreshing(false);
        dashboardPerf('soft-refresh:complete', {
          source: refreshSource,
          durationMs: Math.max(0, perfNow() - startedAt),
        });
      }, SOFT_REFRESH_INDICATOR_MIN_MS);
    },
    [dashboardPerf, refreshDashboardData],
  );
  runSoftRefreshRef.current = runSoftRefresh;
  updateFilteredDataRef.current = updateFilteredData;

  // Handle Quick Period selection
  const handleQuickPeriodSelect = period => {
    setQuickPeriod(period);
    setSelectedMonth(null);
    setSelectedYear(null);
    setCustomStartDate(null);
    setCustomEndDate(null);
    saveAccountsPeriodState({
      scope: 'allAccounts',
      state: {
        quickPeriod: period,
        selectedMonth: null,
        selectedYear: null,
        customStartDate: null,
        customEndDate: null,
      },
    }).catch(error => {
      console.error('Failed to save accounts period preference:', error);
    });
    // Data will update via useEffect
  };


  const formatCurrency = amount => {
    return `${currencySymbol} ${amount.toLocaleString('en-IN')}`;
  };

  const formatCurrencyRupee = amount => {
    const sign = amount < 0 ? '-' : '';
    const absAmount = Math.abs(amount);
    return `${sign}${currencySymbol} ${absAmount.toLocaleString('en-IN')}`;
  };

  const formatCardPeriodDate = value =>
    new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const cardPeriodText = React.useMemo(() => {
    if (selectedMonth !== null && selectedYear !== null) {
      let startTime = null;
      let endTime = Date.now();
      const range = getMonthYearRange(selectedMonth, selectedYear, monthStartDay);
      startTime = range.startTime;
      endTime = range.endTime;
      return `Period: ${formatCardPeriodDate(startTime)} - ${formatCardPeriodDate(endTime)}`;
    }

    if (quickPeriod === '1month') {
      const now = new Date();
      const range = getMonthlyRangeFromStartDay(monthStartDay, now);
      return `Period: ${formatCardPeriodDate(range.startTime)} - ${formatCardPeriodDate(
        range.endTime
      )}`;
    }

    const quickPeriodTextMap = {
      '1week': 'Last 5 days transactions',
      '10days': 'Last 10 days transactions',
      '15days': 'Last 15 days transactions',
      '30days': 'Last 30 days transactions',
      '3months': 'Last 3 months transactions',
      '6months': 'Last 6 months transactions',
      '1year': 'Last 1 year transactions',
    };

    return quickPeriodTextMap[quickPeriod] || 'Recent transactions';
  }, [quickPeriod, selectedMonth, selectedYear, monthStartDay]);

  const getSortIndexValue = (account, fallback) => {
    const value = Number(account?.sort_index);
    return Number.isFinite(value) ? value : fallback;
  };

  const moveSelectedAccount = async direction => {
    const account = selectedAccountRef.current || selectedAccount;
    if (!account) {
      return;
    }
    if (!canMoveWithinType) {
      return;
    }
    const currentIndex =
      selectedAccountIndex >= 0
        ? selectedAccountIndex
        : accounts.findIndex(
            item => String(item.id) === String(account.id)
          );
    if (currentIndex < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= accounts.length) {
      return;
    }
    const currentAccount = accounts[currentIndex];
    const targetAccount = accounts[targetIndex];
    const currentSortIndex = getSortIndexValue(currentAccount, currentIndex);
    const targetSortIndex = getSortIndexValue(targetAccount, targetIndex);
    runPinReorderAnimation();
    try {
      await updateAccountSortIndex(currentAccount.id, targetSortIndex);
      await updateAccountSortIndex(targetAccount.id, currentSortIndex);
      loadAccounts();
      showToast(
        `Account moved ${direction === 'up' ? 'up' : 'down'}`,
        'success',
        3000
      );
    } catch (error) {
      console.error('Failed to move account:', error);
      showToast('Failed to move account', 'error', 3000);
    } finally {
      closeContextMenu();
    }
  };

  const openContextMenu = account => {
    selectedAccountRef.current = account;
    setSelectedAccount(account);
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
      setSelectedAccount(null);
      selectedAccountRef.current = null;
    });
  };
  const handleSetPrimary = async () => {
    const account = selectedAccountRef.current || selectedAccount;
    if (!account) {
      return;
    }
    if (account.account_type !== 'earning') {
      return;
    }
    if (Number(account.is_primary) === 1) {
      closeContextMenu();
      return;
    }
    try {
      await updateAccountPrimary(account.id, true);
      showToast('Primary account updated.', 'success', 3000);
      loadAccounts();
    } catch (error) {
      console.error('Failed to update primary status:', error);
      showToast('Failed to update primary account.', 'error', 3000);
    } finally {
      closeContextMenu();
    }
  };

  const handleDeleteAccount = () => {
    const account = selectedAccountRef.current || selectedAccount;
    if (!account) return;
    const isSavingAccount = account.account_type === 'saving';
    if (isSavingAccount) {
      themedAlert('Not Allowed', 'Saving account cannot be deleted.');
      closeContextMenu();
      return;
    }
    const isPrimaryEarning =
      account.account_type === 'earning' && Number(account.is_primary) === 1;
    if (isPrimaryEarning) {
      themedAlert(
        'Primary Account',
        'Primary earning account cannot be deleted. Set another earning account as primary first.'
      );
      closeContextMenu();
      return;
    }
    const balance = Number(account?.balance) || 0;
    if (Math.abs(balance) > 0.000001) {
      themedAlert(
        'Balance Not Settled',
        'This account balance is not settled. Please settle it to 0 before removing the account.'
      );
      return;
    }
    themedAlert(
      'Delete Account',
      `Are you sure you want to delete the account "${account.account_name}"? All associated transactions will also be deleted. This action cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel', onPress: closeContextMenu},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccountAndTransactions(account.id);
              showToast('Account deleted successfully', 'success', 3000);
              loadAccounts(); // Refresh the list
            } catch (e) {
              themedAlert('Error', 'Failed to delete account.');
            } finally {
              closeContextMenu();
            }
          },
        },
      ]
    );
  };

  const handleDeletePress = () => {
    if (deletePressGuardRef.current) {
      return;
    }
    deletePressGuardRef.current = true;
    handleDeleteAccount();
    setTimeout(() => {
      deletePressGuardRef.current = false;
    }, 400);
  };

  const openRenameModal = () => {
    const account = selectedAccountRef.current || selectedAccount;
    if (!account) return;
    setRenameTargetAccount(account);
    setNewAccountName(account?.account_name || ''); // Ensure newAccountName is always a string
    setRenameModalVisible(true);
    closeContextMenu();
    setTimeout(() => {
      renameInputRef.current?.focus();
    }, 600);
  };

  const handleContextMenuPersonalize = useCallback(() => {
    closeContextMenu();
    if (selectedAccount?.id) {
      navigation.navigate('PersonalizeAccount', {accountId: selectedAccount.id});
    }
  }, [closeContextMenu, navigation, selectedAccount?.id]);

  const handleAddToHomeScreen = useCallback(async () => {
    const account = selectedAccountRef.current || selectedAccount;
    const shortcutModule = NativeModules?.AccountShortcut;
    if (!account) {
      return;
    }
    if (!shortcutModule?.addToHomeScreen) {
      showToast('Shortcut feature is not available on this device.', 'error', 3000);
      closeContextMenu();
      return;
    }

    try {
      const created = await shortcutModule.addToHomeScreen(
        String(account.id),
        String(account.account_name || 'Account'),
        String(account.account_type || ''),
        String(account.icon || ''),
        String(account.icon_color || ''),
      );
      if (created) {
        showToast('Added to home screen', 'success', 3000);
      } else {
        showToast('Unable to add shortcut on this launcher.', 'error', 3000);
      }
    } catch (error) {
      console.error('Failed to create home screen shortcut:', error);
      showToast('Failed to add shortcut', 'error', 3000);
    } finally {
      closeContextMenu();
    }
  }, [closeContextMenu, selectedAccount, showToast]);

  const dashboardAccountMenuActions = React.useMemo(
    () =>
      buildDashboardAccountMenuActions({
        selectedAccount,
        onSetPrimary: handleSetPrimary,
        onRename: openRenameModal,
        onDelete: handleDeletePress,
        onPersonalize: handleContextMenuPersonalize,
        onAddToHomeScreen: handleAddToHomeScreen,
      }),
    [
      selectedAccount,
      handleSetPrimary,
      openRenameModal,
      handleDeletePress,
      handleContextMenuPersonalize,
      handleAddToHomeScreen,
    ]
  );

  const closeRenameModal = () => {
    setRenameModalVisible(false);
    setRenameTargetAccount(null);
    setNewAccountName('');
  };

  const handleSaveAccountName = async () => {
    const account = renameTargetAccount || selectedAccountRef.current || selectedAccount;
    if (!account || !newAccountName.trim()) {
      themedAlert('Invalid Name', 'Account name cannot be empty.');
      return;
    }
    try {
      await renameAccount(account.id, newAccountName.trim());
      showToast('Account renamed successfully', 'success', 3000);
      loadAccounts(); // Refresh the list
    } catch (e) {
      themedAlert('Error', 'Failed to rename account.');
    } finally {
      closeRenameModal();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <DashboardPeriodFilter
          quickPeriod={quickPeriod}
          onQuickPeriodChange={handleQuickPeriodSelect}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onCustomDateRange={(start, end) => {
            setCustomStartDate(start);
            setCustomEndDate(end);
            setSelectedMonth(null);
            setSelectedYear(null);
            saveAccountsPeriodState({
              scope: 'allAccounts',
              state: {
                quickPeriod,
                selectedMonth: null,
                selectedYear: null,
                customStartDate: start,
                customEndDate: end,
              },
            }).catch(error => {
              console.error('Failed to save calendar period preference:', error);
            });
          }}
          onClearAll={() => {
            setSelectedMonth(null);
            setSelectedYear(null);
            setCustomStartDate(null);
            setCustomEndDate(null);
            clearAccountsPeriodState({scope: 'allAccounts'}).catch(error => {
              console.error('Failed to clear accounts period preference:', error);
            });
          }}
          accounts={accounts}
          monthStartDay={monthStartDay}
          filteredEarning={filteredEarning}
          filteredWithdrawals={filteredWithdrawals}
          netBalance={netBalance}
          formatCurrencyRupee={formatCurrencyRupee}
          themeColor={themeAccent.accentPrimary}
          accentPalette={themeAccent}
          metricsLabels={metricsLabels}
        />
      </View>
      <View style={styles.contentArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}>
        {isSoftRefreshing ? (
          <View style={styles.softRefreshBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.softRefreshBannerText}>Refreshing data...</Text>
          </View>
        ) : null}
        {/* Combined Accounts Card */}
        <View style={styles.accountsSection}>
          {accounts.length > 0 ? (
            <CombinedAccountsCard
              sections={[
                {
                  title: 'Earning Accounts',
                  accounts: earningAccounts,
                  secondaryLabel: 'Balance',
                  getSecondaryValue: account => closingAccountBalances[account.id] ?? 0,
                  highlightSecondaryValue: true,
                  fallbackIcon: 'trending-up',
                  fallbackColor: '#22C55E',
                },
                ...(hideSavingAccountsOnDashboard
                  ? []
                  : [
                      {
                        title: 'Savings Accounts',
                        accounts: savingAccounts,
                        primaryLabel: 'Transferred',
                        secondaryLabel: 'Savings',
                        getPrimaryValue: account => periodAccountExpenses[account.id] ?? 0,
                        getSecondaryValue: account => closingAccountBalances[account.id] ?? 0,
                        highlightSecondaryValue: true,
                        fallbackIcon: 'wallet',
                        fallbackColor: '#F59E0B',
                      },
                    ]),
                ...(creditAccounts.length > 0
                  ? [
                      {
                        title: 'Credit Card Accounts',
                        accounts: creditAccounts,
                        primaryLabel: 'Credit',
                        secondaryLabel: 'Outstanding',
                        getPrimaryValue: account => periodAccountExpenses[account.id] ?? 0,
                        getSecondaryValue: account => closingAccountBalances[account.id] ?? 0,
                        highlightSecondaryValue: true,
                        fallbackIcon: 'card-outline',
                        fallbackColor: '#2563EB',
                      },
                    ]
                  : []),
                {
                  title: 'Expenses Accounts',
                  accounts: expenseAccounts,
                  primaryLabel: 'Expenses',
                  secondaryLabel: 'Expenses',
                  getPrimaryValue: account => periodAccountExpenses[account.id] ?? 0,
                  getSecondaryValue: account => periodAccountExpenses[account.id] ?? 0,
                  highlightSecondaryValue: true,
                  fallbackIcon: 'wallet',
                  fallbackColor: '#EF4444',
                },
              ]}
              colors={colors}
              isDark={isDark}
              cardPeriodText={cardPeriodText}
              formatCurrency={formatCurrency}
              onOpenAccount={account => {
                void openAccount(account);
              }}
              onOpenContextMenu={openContextMenu}
              renderAccountIcon={renderAccountIcon}
              hexToRgba={hexToRgba}
            />
          ) : !isInitialDashboardLoading ? (
            <View style={styles.emptyAccounts}>
              <Icon name="wallet-outline" size={48} color={colors.border} />
              <Text style={styles.emptyText}>No accounts yet</Text>
              <Text style={styles.emptySubtext}>
                Create your first account to get started
              </Text>
            </View>
          ) : null}
        </View>
        </ScrollView>
      </View>

      {isInitialDashboardLoading ? (
        <View style={styles.initialLoaderOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.initialLoaderText}>Loading dashboard...</Text>
        </View>
      ) : null}

      

      {fabExpanded && (
        <TouchableOpacity
          style={styles.fabBackdrop}
          activeOpacity={1}
          onPress={closeFabMenu}
        />
      )}

      <Animated.View
        pointerEvents={fabExpanded ? 'auto' : 'none'}
        style={[
          styles.fabActions,
          {bottom: fabActionsBottomOffset},
          {
            opacity: fabAnim,
            transform: [
              {
                translateY: fabAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}>
        <TouchableOpacity
          style={[styles.fabActionPill, styles.fabActionPillEarning]}
          onPress={() => openAddAccount('earning')}
          activeOpacity={0.85}>
          <View style={[styles.fabActionPillIconBox, {backgroundColor: 'rgba(22, 163, 74, 0.12)'}]}>
            <Icon name="trending-up-outline" size={20} color="#16A34A" />
          </View>
          <Text style={[styles.fabActionPillText, {color: colors.text.primary}]}>Add Earning Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fabActionPill, styles.fabActionPillCredit]}
          onPress={() => openAddAccount('credit')}
          activeOpacity={0.85}>
          <View style={[styles.fabActionPillIconBox, {backgroundColor: 'rgba(37, 99, 235, 0.12)'}]}>
            <Icon name="card-outline" size={20} color="#2563EB" />
          </View>
          <Text style={[styles.fabActionPillText, {color: colors.text.primary}]}>Add Credit Card Account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fabActionPill, styles.fabActionPillExpenses]}
          onPress={() => openAddAccount('expenses')}
          activeOpacity={0.85}>
          <View style={[styles.fabActionPillIconBox, {backgroundColor: 'rgba(239, 68, 68, 0.12)'}]}>
            <Icon name="wallet-outline" size={20} color="#EF4444" />
          </View>
          <Text style={[styles.fabActionPillText, {color: colors.text.primary}]}>Add Expenses Account</Text>
        </TouchableOpacity>
      </Animated.View>
      <TouchableOpacity
        ref={fabRef}
        style={[
          styles.fab,
          {
            bottom: fabBottomOffset,
            backgroundColor: `${fabThemeColor}B8`,
            borderColor: fabBorderTone,
          },
          fabExpanded && {backgroundColor: `${fabThemeColor}D4`},
        ]}
        onPress={handleAddAccountPress}>
        <Icon
          name={fabExpanded ? 'close' : 'add'}
          size={26}
          color={fabIconColor}
        />
      </TouchableOpacity>

      {/* Context Menu Modal */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="none"
        statusBarTranslucent
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
                {selectedAccount?.account_name}
              </Text>
            </View>
            {canMoveWithinType && (
              <>
                <TouchableOpacity
                  style={[
                    styles.contextMenuItem,
                    isMoveUpDisabled && styles.contextMenuItemDisabled,
                  ]}
                  hitSlop={{top: 6, bottom: 6, left: 8, right: 8}}
                  disabled={isMoveUpDisabled}
                  onPress={() => moveSelectedAccount('up')}>
                  <Icon
                    name="arrow-up"
                    size={22}
                    color={
                      isMoveUpDisabled ? colors.text.light : colors.text.primary
                    }
                  />
                  <Text
                    style={[
                      styles.contextMenuItemText,
                      isMoveUpDisabled && styles.contextMenuItemTextDisabled,
                    ]}>
                    Move Up
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.contextMenuItem,
                    isMoveDownDisabled && styles.contextMenuItemDisabled,
                  ]}
                  hitSlop={{top: 6, bottom: 6, left: 8, right: 8}}
                  disabled={isMoveDownDisabled}
                  onPress={() => moveSelectedAccount('down')}>
                  <Icon
                    name="arrow-down"
                    size={22}
                    color={
                      isMoveDownDisabled
                        ? colors.text.light
                        : colors.text.primary
                    }
                  />
                  <Text
                    style={[
                      styles.contextMenuItemText,
                      isMoveDownDisabled &&
                        styles.contextMenuItemTextDisabled,
                    ]}>
                    Move Down
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {dashboardAccountMenuActions.map(action => (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.contextMenuItem,
                  action.disabled && styles.contextMenuItemDisabled,
                ]}
                hitSlop={{top: 6, bottom: 6, left: 8, right: 8}}
                onPressIn={action.id === 'delete' ? handleDeletePress : undefined}
                onPress={action.onPress}
                disabled={action.disabled}>
                <Icon
                  name={action.icon}
                  size={22}
                  color={
                    action.variant === 'danger'
                      ? colors.error
                      : action.selected
                        ? '#10B981'
                        : colors.text.primary
                  }
                />
                <Text
                  style={[
                    styles.contextMenuItemText,
                    action.variant === 'danger' && {color: colors.error},
                    action.selected && styles.contextMenuItemTextSelected,
                  ]}>
                  {action.label}
                </Text>
                {action.trailingIcon ? (
                  <Icon name={action.trailingIcon} size={18} color="#10B981" />
                ) : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.contextMenuItem, styles.contextMenuItemCancel]}
              hitSlop={{top: 6, bottom: 6, left: 8, right: 8}}
              onPress={closeContextMenu}>
              <Icon name="close" size={22} color={colors.text.secondary} />
              <Text style={styles.contextMenuItemTextCancel}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Rename Account Modal */}
      <RenameAccountModal
        visible={renameModalVisible}
        value={newAccountName}
        onChange={setNewAccountName}
        onSave={handleSaveAccountName}
        onClose={closeRenameModal}
        loading={false}
        inputRef={renameInputRef}
        styles={renameModalStyles}
      />

      <SetupRequirePopup
        visible={showSetupPopup}
        title="Complete your basic details"
        description="Finish profile setup to unlock all features of app."
        primaryText="Update Profile Setup"
        secondaryText="Remind me later"
        showNeverShowCheckbox={showStartupNeverShowCheckbox}
        neverShowChecked={startupNeverShowChecked}
        neverShowLabel="Never show this msg again"
        onNeverShowToggle={handleToggleStartupNeverShow}
        onPrimaryPress={handleOpenProfileSetup}
        onSecondaryPress={handleRemindLater}
        onClose={handleRemindLater}
      />

      <SetupRequirePopup
        visible={showCreditCardNotice && !showSetupPopup}
        title="Credit Card Accounts are now available"
        description="You can now create and manage your credit card accounts from Add Account."
        primaryText="OK"
        secondaryText="Close"
        showNeverShowCheckbox
        neverShowChecked={creditCardNoticeDontShow}
        neverShowLabel="Don't show this message again"
        onNeverShowToggle={handleToggleCreditCardNoticeDontShow}
        onPrimaryPress={handleCloseCreditCardNotice}
        onSecondaryPress={() => setShowCreditCardNotice(false)}
        onClose={() => setShowCreditCardNotice(false)}
      />

    </View>
  );
};

const createCardBase = colors => ({
  backgroundColor: colors.card,
  borderRadius: 16,
  borderWidth: 0,
  borderColor: 'transparent',
  elevation: 3,
  shadowColor: colors.shadow,
  shadowOffset: {width: 0, height: 2},
  shadowOpacity: 0.09,
  shadowRadius: 6,
});

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: colors.card,
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    elevation: 0,
  },
  contentArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  scrollViewContent: {
    paddingBottom: spacing.xl + 88,
  },

  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  fabActions: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg + 64,
    alignItems: 'flex-end',
    gap: 10,
  },
  fabActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    elevation: 5,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabActionPillIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabActionPillEarning: {
    borderWidth: 1.5,
    borderColor: 'rgba(22, 163, 74, 0.35)',
  },
  fabActionPillExpenses: {
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  fabActionPillText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  // Accounts Section
  accountsSection: {
    marginTop: spacing.md,
    marginBottom: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.text.secondary,
    marginBottom: 6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  accountsList: {
    gap: 4,
  },
  accountsDivider: {
    height: 4,
  },
  accountItemShadow: {
    borderRadius: 16,
    backgroundColor: colors.panel,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  accountItem: {
    position: 'relative',
    flexDirection: 'column',
    padding: 13,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'stretch',
    borderWidth: 1.5,
  },
  accountRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  accountIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  accountDetails: {
    flex: 1,
    minWidth: 0,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  accountHeaderContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    marginRight: 8,
  },
  accountName: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    flexShrink: 1,
  },
  accountAmountsSection: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
  },
  accountAmountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountAmountLabel: {
    fontSize: 11,
    color: colors.text.light,
    fontWeight: fontWeight.medium,
  },
  accountAmountLabelDark: {
    color: colors.text.secondary,
  },
  accountAmountValue: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  accountSecondaryLabel: {
    fontSize: 10,
    color: colors.text.light,
    marginTop: 4,
  },
  accountSecondaryAmount: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
  },
  accountBalanceRow: {
    marginBottom: 2,
  },
  accountBalanceLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
  },
  accountBalanceLabelDark: {
    color: colors.text.secondary,
  },
  accountBalanceAmount: {
    fontSize: 18,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  accountDate: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  accountDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  accountDateAmount: {
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  accountNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty State
  emptyAccounts: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
  softRefreshBanner: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  softRefreshBannerText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  initialLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    zIndex: 20,
  },
  initialLoaderText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  // No Records Container
  noRecordsContainer: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  noRecordsText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginTop: 12,
  },
  noRecordsSubtext: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginTop: 4,
  },
  // Dropdown Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dropdownModal: {
    backgroundColor: colors.modal,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    maxHeight: 400,
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  dropdownModalScrollable: {
    backgroundColor: colors.modal,
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    maxHeight: 400,
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  // Context Menu Styles
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
    shadowColor: colors.shadow,
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
  contextMenuItemDisabled: {
    opacity: 0.45,
  },
  contextMenuItemText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
  contextMenuItemTextSelected: {
    color: '#10B981',
    fontWeight: fontWeight.semibold,
  },
  contextMenuItemTextDisabled: {
    color: colors.text.light,
  },
  contextMenuItemCancel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  contextMenuItemTextCancel: {
    fontSize: 15,
    color: colors.text.secondary,
    fontWeight: fontWeight.medium,
  },
  // Rename Modal (Dashboard)
  renameModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  renameModalBackdrop: {
    flex: 1,
  },
  renameModalSheet: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    position: 'relative',
  },
  renameModalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  renameModalTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  renameModalTextInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  renameModalAddButton: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  renameModalAddButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  setupSheetContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  setupSheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  setupSheetDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  setupPrimaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  setupPrimaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  setupSecondaryButton: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  setupSecondaryButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default AllAccountsScreen;
