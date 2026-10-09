// SCREEN: Earning Account (AccountDetailScreen)
import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  TouchableOpacity,
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
  Image, // Added Image import
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import RNBlobUtil from 'react-native-blob-util';
import ImageViewer from 'react-native-image-zoom-viewer';
import BsCashCoin from '../components/icons/BsCashCoin';
import {colors, spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import {useToast} from '../hooks/useToast';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import RenameAccountModal from '../components/RenameAccountModal';
import EditRemarkModalSheet from '../components/EditRemarkModalSheet';
import EditAmountModal from '../components/ui/editamount';
import DropdownPopup from '../components/ui/popups/DropdownPopup';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import CTAButton from '../components/ui/ctabuttons';
import {
  deletedUiStyles,
  getDeletedTapEffectProps,
  withDeletedStyle,
  renderDeletedBadge,
  renderDeletedNote,
} from '../components/ui/deleteui';
import {buildEarningAccountMenuActions} from '../components/actions/accountMenuActions';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AccountDetailHeader from '../ui/AccountDetailHeader';
import AccountTransactionRow from '../ui/AccountTransactionRow';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {calculateAccountsPeriodData} from '../services/accountsPeriodCore';
import {
  loadAccountsPeriodState,
  saveAccountsPeriodState,
} from '../services/accountsPeriodStateStorage';
import {
  buildCreditAccountDetailMetrics,
} from '../services/accountDetailMetrics';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
import BottomSheet from '../components/BottomSheet';
import {
  initTransactionsDatabase,
  createTransaction,
  deleteTransaction,
  getTransactionsByAccount,
  calculateAccountBalance,
  updateTransactionAmount,
  updateTransactionRemark,
  deleteTransactionsByAccount,
} from '../services/transactionsDatabase';
import {
  getActiveRecurringSchedules,
  SCHEDULE_EXECUTED_EVENT,
} from '../services/recurringDatabase';
import {
  canApplyAmountEditWithEntries,
  canWithdrawAtTimestampWithEntries,
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

const MONTH_START_DAY_KEY = 'monthStartDay';
const EARNING_ACCOUNT_PERIOD_STATE_SCOPE = 'earningAccount';
const SHOW_TRANSFER_ENTRIES_KEY_PREFIX = 'earningShowTransferEntries';
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';
const DEFAULT_MONTH_START_DAY = 1;
const ACCOUNT_FOCUS_REFRESH_COOLDOWN_MS = 450;
const TRANSFER_VISIBILITY_CACHE_MAX_ENTRIES = 20;
const transferEntriesVisibilityCache = new Map();

let hasInitializedEarningTransactionsDb = false;

const pruneTransferVisibilityCache = () => {
  while (transferEntriesVisibilityCache.size > TRANSFER_VISIBILITY_CACHE_MAX_ENTRIES) {
    const oldestKey = transferEntriesVisibilityCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    transferEntriesVisibilityCache.delete(oldestKey);
  }
};

const getCachedShowTransferEntries = accountId =>
  transferEntriesVisibilityCache.get(String(accountId)) === true;

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

const renderAccountHeaderIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }
  return <Icon name={iconName || 'wallet-outline'} size={size} color={color} />;
};

const METRIC_ICON_SIZE = 28;
const METRIC_LABEL_GAP = 6;
const METRIC_LABEL_OFFSET = METRIC_ICON_SIZE + METRIC_LABEL_GAP;
const TRANSFER_LAST_ACCOUNT_KEY = 'transferLastAccountId';
const EARNING_WITHDRAW_LOG_TOKEN = '[ewlog]';
const CREDIT_WITHDRAW_LOG_TOKEN = '[cwlog]';
const WITHDRAW_TIMELINE_VISIBLE_ENTRIES = 3;

const withAlpha = (hex, alpha) => {
  if (!hex || typeof hex !== 'string') {
    return hex;
  }
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const tintWithWhite = (hex, whiteRatio = 0.9) => {
  if (!hex || typeof hex !== 'string') {
    return hex;
  }
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const ratio = Math.min(1, Math.max(0, whiteRatio));
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const mix = channel => Math.round(255 * ratio + channel * (1 - ratio));
  const toHex = value => value.toString(16).padStart(2, '0');
  return `#${toHex(mix(red))}${toHex(mix(green))}${toHex(mix(blue))}`;
};

const darkenHex = (hex, ratio = 0.26) => {
  if (!hex || typeof hex !== 'string') {
    return hex;
  }
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return hex;
  }
  const clampRatio = Math.min(1, Math.max(0, ratio));
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const darken = channel => Math.round(channel * (1 - clampRatio));
  const toHex = value => value.toString(16).padStart(2, '0');
  return `#${toHex(darken(red))}${toHex(darken(green))}${toHex(darken(blue))}`;
};

const getReadableHeaderColor = hex => {
  if (!hex || typeof hex !== 'string') {
    return headerTexture.icon;
  }
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return headerTexture.icon;
  }
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.68 ? '#0F172A' : '#F8FAFC';
};

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

const AccountDetailScreen = ({route, navigation}) => {
  const insets = useSafeAreaInsets();
  const {isDark, colors: themeColors} = useTheme();
  const popupSurfaceColor = themeColors.modal || themeColors.card;
  const popupBorderColor = themeColors.border;
  const popupOverlayColor = themeColors.overlay || 'rgba(0,0,0,0.55)';
  const popupMutedColor = themeColors.surfaceMuted || themeColors.card;
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
  const {showToast} = useToast();
  const currencySymbol = useCurrencySymbol();

  const [amount, setAmount] = useState('');
  const [addNote, setAddNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({x: 0, y: 0, width: 36, height: 36});
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [editAmountVisible, setEditAmountVisible] = useState(false);
  const [editRemarkVisible, setEditRemarkVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [transferSelectVisible, setTransferSelectVisible] = useState(false);
  const [transferAccountModalVisible, setTransferAccountModalVisible] = useState(false);
  const [transferAccounts, setTransferAccounts] = useState([]);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferAmount, setTransferAmount] = useState(0);
  const [entryDate, setEntryDate] = useState(new Date());
  const [quickPeriod, setQuickPeriod] = useState('1month');
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [addReceiptSheetVisible, setAddReceiptSheetVisible] = useState(false);
  const [withdrawReceiptUri, setWithdrawReceiptUri] = useState('');
  const [receiptPreviewVisible, setReceiptPreviewVisible] = useState(false);
  const [receiptPreviewUri, setReceiptPreviewUri] = useState('');
  const [deferredUiReady, setDeferredUiReady] = useState(false);
  const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false);
  const [monthStartDay, setMonthStartDay] = useState(DEFAULT_MONTH_START_DAY);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [showTransferEntries, setShowTransferEntries] = useState(() =>
    routeInitialShowTransferEntries ?? getCachedShowTransferEntries(initialAccount.id)
  );
  const [withdrawTimelineExpanded, setWithdrawTimelineExpanded] = useState(true);
  const [scheduledEntriesCount, setScheduledEntriesCount] = useState(0);
  const normalizedAccountType = String(account?.account_type || '').toLowerCase();
  const isCreditAccount = normalizedAccountType === 'credit';

  const accountTypeLabel = useMemo(() => {
    const type = normalizedAccountType;
    if (type === 'earning') {
      return 'Earning Account';
    }
    if (type === 'credit') {
      return 'Credit Card Account';
    }
    if (type === 'saving') {
      return 'Savings Account';
    }
    if (type === 'expenses') {
      return 'Expenses Account';
    }
    return 'Account';
  }, [normalizedAccountType]);
  const metricsLabels = useMemo(
    () =>
      isCreditAccount
        ? {
            earning: 'Paid Bill',
            expenses: 'Credit',
            net: 'Balance',
          }
        : null,
    [isCreditAccount]
  );
  const renameInputRef = useRef(null);
  const modalSlideAnim = useRef(new Animated.Value(0)).current;
  const optionsOverlayOpacity = useRef(new Animated.Value(0)).current;
  const optionsContentTranslateY = useRef(new Animated.Value(300)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuButtonRef = useRef(null);
  const transactionsLoadInFlightRef = useRef(false);
  const lastTransactionsLoadAtRef = useRef(0);
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
    perfLog('earning-account-screen', event, payload);
  }, []);
  const {width: screenWidth} = Dimensions.get('window');
  const menuWidth = 280;
  const menuLeft = Math.min(
    Math.max(spacing.md, menuAnchor.x + menuAnchor.width - menuWidth),
    Math.max(spacing.md, screenWidth - menuWidth - spacing.md)
  );
  const menuTop = Math.max(spacing.md, menuAnchor.y + menuAnchor.height + spacing.xs);

  const isOverlayOpen =
    editAmountVisible ||
    editRemarkVisible ||
    renameModalVisible ||
    optionsVisible ||
    menuVisible ||
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
  const focusRenameInput = useCallback(() => {
    const focus = () => renameInputRef.current?.focus();
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(focus);
      setTimeout(focus, 120);
    });
  }, []);

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
      if (optionsVisible) {
        closeOptionsMenu(true);
        return true;
      }
      if (menuVisible) {
        closeAccountMenu();
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
    editAmountVisible,
    editRemarkVisible,
    renameModalVisible,
    optionsVisible,
    menuVisible,
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
    [ensureReceiptsDir],
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
    [],
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
        showToast('Download not supported on this device.', 'error');
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
            showToast('Storage permission denied.', 'error');
            return;
          }
          const destPath = `${RNBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
          await RNBlobUtil.fs.cp(sourcePath, destPath);
        }
        showToast('Saved to Download.', 'success');
      } catch (error) {
        console.error('Failed to download receipt:', error);
        showToast('Failed to download image.', 'error');
      }
    },
    [requestDownloadPermission, showToast]
  );

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
  const loadAccountDetails = useCallback(() => {
    const perf = createPerfTimer('earning-account-screen', 'load-account-details');
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

  const loadTransactions = useCallback(async () => {
    const perf = createPerfTimer('earning-account-screen', 'load-transactions');
    if (!account.id) {
      setTransactions([]);
      setTotalBalance(0);
      setHasLoadedTransactions(false);
      perf.end({skipped: true});
      return;
    }
    const now = Date.now();
    if (transactionsLoadInFlightRef.current) {
      perf.end({skipped: 'in-flight', accountId: String(account.id)});
      return;
    }
    if (now - lastTransactionsLoadAtRef.current < 220) {
      perf.end({skipped: 'cooldown', accountId: String(account.id)});
      return;
    }
    transactionsLoadInFlightRef.current = true;
    lastTransactionsLoadAtRef.current = now;
    try {
      const txns = getTransactionsByAccount(account.id);
      setTransactions(txns);
      const updatedAccount = getAllAccounts().find(
        item => String(item.id) === String(account.id)
      );
      setTotalBalance(Number(updatedAccount?.balance) || 0);
      setHasLoadedTransactions(true);
      perf.end({
        accountId: String(account.id),
        txnsCount: txns.length,
        balance: Number(updatedAccount?.balance) || 0,
      });
    } catch (error) {
      console.error('Failed to load transactions:', error);
      perf.fail(error, {accountId: String(account.id)});
    } finally {
      transactionsLoadInFlightRef.current = false;
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

  const loadShowTransferEntriesSetting = useCallback(async () => {
    if (!account?.id) {
      setShowTransferEntries(false);
      return;
    }
    const accountId = String(account.id);
    const cachedValue = getCachedShowTransferEntries(account.id);
    setShowTransferEntries(prev => (prev === cachedValue ? prev : cachedValue));
    if (transferSettingLoadInFlightRef.current === accountId) {
      return;
    }
    transferSettingLoadInFlightRef.current = accountId;
    try {
      const settingKey = `${SHOW_TRANSFER_ENTRIES_KEY_PREFIX}_${accountId}`;
      const storedValue = await AsyncStorage.getItem(settingKey);
      const nextValue = storedValue === '1';
      setCachedShowTransferEntries(account.id, nextValue);
      setShowTransferEntries(prev => (prev === nextValue ? prev : nextValue));
    } catch (error) {
      console.error('Failed to load transfer entries setting:', error);
    } finally {
      if (transferSettingLoadInFlightRef.current === accountId) {
        transferSettingLoadInFlightRef.current = null;
      }
    }
  }, [account?.id]);

  const canWithdrawAtTimestamp = useCallback(
    (withdrawValue, timestamp) => {
      const pendingEntries = [
        {
          id: 'pending',
          amount: -Math.abs(withdrawValue),
          transaction_date: timestamp,
          is_deleted: 0,
          orderIndex: 1,
        },
      ];
      return canWithdrawAtTimestampWithEntries(
        withdrawValue,
        timestamp,
        transactions,
        pendingEntries
      );
    },
    [transactions]
  );

  const canApplyAmountEdit = useCallback(
    (transactionId, nextAmount) =>
      canApplyAmountEditWithEntries(transactions, transactionId, nextAmount),
    [transactions]
  );

  useEffect(() => {
    if (!hasInitializedEarningTransactionsDb) {
      initTransactionsDatabase();
      hasInitializedEarningTransactionsDb = true;
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
    setShowTransferEntries(getCachedShowTransferEntries(account?.id));
  }, [account?.id]);

  useEffect(() => {
    setWithdrawTimelineExpanded(false);
    loadShowTransferEntriesSetting();
  }, [account?.id, loadShowTransferEntriesSetting]);



  useEffect(() => {
    const isAnyModalOpen =
      editAmountVisible ||
      editRemarkVisible ||
      renameModalVisible;
    if (isAnyModalOpen) {
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
    editAmountVisible,
    editRemarkVisible,
    renameModalVisible,
    modalSlideAnim,
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
    if (!optionsVisible) {
      return;
    }
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
  }, [optionsVisible, optionsOverlayOpacity, optionsContentTranslateY]);

  const showAccountMenu = useCallback(() => {
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
  }, [menuAnim]);

  const openAccountMenu = useCallback(() => {
    if (menuButtonRef.current?.measureInWindow) {
      menuButtonRef.current.measureInWindow((x, y, width, height) => {
        setMenuAnchor({x, y, width, height});
        showAccountMenu();
      });
      return;
    }
    showAccountMenu();
  }, [showAccountMenu]);

  const closeAccountMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
    });
  }, [menuAnim]);

  const isFutureEntryDate = value => {
    if (!(value instanceof Date)) {
      return false;
    }
    return value.getTime() > Date.now();
  };

  const handleAddEntry = async (overrides = {}) => {
    const nextAmount = overrides.amount ?? amount;
    const nextEntryDate = overrides.entryDate ?? entryDate;

    if (!nextAmount || parseFloat(nextAmount) <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return false;
    }

    const remark = (overrides.addNote ?? addNote).trim();

    setLoading(true);
    try {
      const hasConsent = await ensureEcoTransactionEntryAllowed();
      if (!hasConsent) {
        return false;
      }
      const amountValue = parseFloat(nextAmount);
      if (isFutureEntryDate(nextEntryDate)) {
        showToast('Future entry not allowed.', 'error');
        return false;
      }
      const entryTimestamp = nextEntryDate.getTime();

      await createTransaction(account.id, amountValue, remark, entryTimestamp);
      showToast('Amount added successfully', 'success');

      // Reset form
      setAmount('');
      setAddNote('');

      // Reload transactions
      loadTransactions();
      return true;
    } catch (error) {
      console.error('Failed to add entry:', error);
      themedAlert('Error', 'Failed to add entry. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (overrides = {}) => {
    const nextAmount = overrides.amount ?? withdrawAmount;
    const nextEntryDate = overrides.entryDate ?? entryDate;
    const nextReceiptUri = overrides.receiptUri ?? withdrawReceiptUri;

    if (!nextAmount || parseFloat(nextAmount) <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return false;
    }

    const remark = (overrides.note ?? withdrawNote).trim();

    setLoading(true);
    try {
      const hasConsent = await ensureEcoTransactionEntryAllowed();
      if (!hasConsent) {
        return false;
      }
      const strictEcoEnabled = await getStrictEcoEnabled();
      const amountValue = Math.abs(parseFloat(nextAmount));
      if (isFutureEntryDate(nextEntryDate)) {
        showToast('Future entry not allowed.', 'error');
        return false;
      }
      const entryTimestamp = nextEntryDate.getTime();
      if (strictEcoEnabled) {
        if (!canWithdrawAtTimestamp(amountValue, entryTimestamp)) {
          showToast(
            'Withdrawal not allowed. Balance was insufficient at that time.',
            'error'
          );
          return false;
        }
        if (amountValue > totalBalance) {
          showToast('Balance is low. Add amount first to withdraw.', 'error');
          return false;
        }
      }
      let receiptPath = '';
      if (nextReceiptUri) {
        try {
          receiptPath = await persistReceiptImage(nextReceiptUri);
        } catch (error) {
          console.error('Failed to save receipt image:', error);
          showToast('Failed to save bill photo.', 'error');
          return false;
        }
      }
      await createTransaction(account.id, -amountValue, remark, entryTimestamp, receiptPath);
      showToast('Withdrawal recorded successfully', 'success');

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

  const handleTransfer = async (targetAccount, overrides = {}) => {
    const nextTargetAccount = overrides.targetAccount ?? targetAccount;
    const nextAmount = overrides.amount ?? withdrawAmount;
    const nextEntryDate = overrides.entryDate ?? entryDate;

    if (!nextTargetAccount) {
      themedAlert('Select Account', 'Please select a transfer account.');
      return false;
    }
    if (!nextAmount || parseFloat(nextAmount) <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return false;
    }

    const strictEcoEnabled = await getStrictEcoEnabled();
    const amountValue = Math.abs(parseFloat(nextAmount));
    if (isFutureEntryDate(nextEntryDate)) {
      showToast('Future entry not allowed.', 'error');
      return false;
    }
    const entryTimestamp = nextEntryDate.getTime();
    if (strictEcoEnabled) {
      if (!canWithdrawAtTimestamp(amountValue, entryTimestamp)) {
        showToast(
          'Transfer not allowed. Balance was insufficient at that time.',
          'error'
        );
        return false;
      }
      if (amountValue > totalBalance) {
        showToast('Balance is low. Add amount first to withdraw.', 'error');
        return false;
      }
    }

    await handleTransferToAccount(nextTargetAccount, amountValue, overrides);
    return true;
  };

  const handleTransferToAccount = async (
    targetAccount,
    amountValueOverride,
    overrides = {},
  ) => {
    const amountValue = amountValueOverride ?? transferAmount;
    if (!targetAccount || !amountValue) {
      return;
    }
    const nextEntryDate = overrides.entryDate ?? entryDate;
    if (isFutureEntryDate(nextEntryDate)) {
      showToast('Future entry not allowed.', 'error');
      return;
    }
    const transferNote = (overrides.note ?? withdrawNote).trim();
    const toRemark = transferNote
      ? `Transferred to ${targetAccount.account_name} - ${transferNote}`
      : `Transferred to ${targetAccount.account_name}`;
    const fromRemark = transferNote
      ? `Transferred from ${account.account_name} - ${transferNote}`
      : `Transferred from ${account.account_name}`;
    setLoading(true);
    try {
      const hasConsent = await ensureEcoTransactionEntryAllowed();
      if (!hasConsent) {
        return;
      }
      const entryTimestamp = nextEntryDate.getTime();
      await createTransaction(
        account.id,
        -amountValue,
        toRemark,
        entryTimestamp
      );
      await createTransaction(
        targetAccount.id,
        amountValue,
        fromRemark,
        entryTimestamp
      );
      setWithdrawAmount('');
      setWithdrawNote('');
      setWithdrawReceiptUri('');
      setTransferAmount(0);
      setTransferSelectVisible(false);
      setTransferTarget(targetAccount);
      AsyncStorage.setItem(
        TRANSFER_LAST_ACCOUNT_KEY,
        String(targetAccount.id)
      ).catch(error => {
        console.error('Failed to save transfer account:', error);
      });
      loadTransactions();
      showToast('Transfer completed successfully', 'success');
    } catch (error) {
      console.error('Failed to transfer:', error);
      themedAlert('Error', 'Failed to transfer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const result = route.params?.amountEntryResult;
    if (!result) {
      return;
    }

    const clearResultParam = () => {
      navigation.setParams({amountEntryResult: undefined});
    };

    if (result.accountId != null && String(result.accountId) !== String(account.id)) {
      clearResultParam();
      return;
    }

    const nextEntryDate = result.entryDateIso
      ? new Date(result.entryDateIso)
      : entryDate;
    const nextAmount = result.amount ?? '';
    const nextNote = result.note ?? '';

    const applyResult = async () => {
      try {
        if (result.action === 'add') {
          await handleAddEntry({
            amount: nextAmount,
            addNote: nextNote,
            entryDate: nextEntryDate,
          });
          return;
        }

        if (result.action === 'withdraw') {
          await handleWithdraw({
            amount: nextAmount,
            note: nextNote,
            entryDate: nextEntryDate,
          });
          return;
        }

        if (result.action === 'transfer') {
          const accounts = getAllAccounts();
          const targetAccount = accounts.find(
            acc => acc.id === result.targetAccountId,
          );
          if (!targetAccount) {
            showToast('Please select a valid transfer account.', 'error');
            return;
          }
          await handleTransfer(targetAccount, {
            amount: nextAmount,
            note: nextNote,
            entryDate: nextEntryDate,
            targetAccount,
          });
        }
      } finally {
        clearResultParam();
      }
    };

    applyResult();
  }, [
    route.params?.amountEntryResult,
    navigation,
    account.id,
    entryDate,
    handleAddEntry,
    handleWithdraw,
    handleTransfer,
    showToast,
  ]);

  const isTransferTransaction = useCallback(txn => {
    const entryKind = String(txn?.entry_kind || '').trim().toLowerCase();
    if (entryKind) {
      return (
        entryKind === 'transfer' ||
        entryKind === 'legacy_transfer' ||
        entryKind === 'request'
      );
    }
    const remark = String(txn?.remark || '').trim().toLowerCase();
    return (
      remark.startsWith('transferred to ') ||
      remark.startsWith('transferred from ') ||
      remark.startsWith('requested to ') ||
      remark.startsWith('requested from ') ||
      remark.startsWith('requested by ')
    );
  }, []);

  const isSourceWithdrawLogTransaction = useCallback(txn => {
    const entryKind = String(txn?.entry_kind || '').trim().toLowerCase();
    if (entryKind) {
      return (
        entryKind === 'earning_withdraw_log' ||
        entryKind === 'credit_withdraw_log'
      );
    }
    const remark = String(txn?.remark || '').trim().toLowerCase();
    const amount = Number(txn?.amount) || 0;
    return (
      Math.abs(amount) < 0.000001 &&
      (remark.startsWith(EARNING_WITHDRAW_LOG_TOKEN) ||
        remark.startsWith(CREDIT_WITHDRAW_LOG_TOKEN))
    );
  }, []);

  const formatSourceWithdrawLogRemark = remarkValue => {
    const raw = String(remarkValue || '').trim();
    if (!raw) {
      return '';
    }
    const lower = raw.toLowerCase();
    const normalizedToken = lower.startsWith(CREDIT_WITHDRAW_LOG_TOKEN)
      ? CREDIT_WITHDRAW_LOG_TOKEN
      : EARNING_WITHDRAW_LOG_TOKEN;
    if (!lower.startsWith(normalizedToken)) {
      return raw;
    }
    return raw.slice(normalizedToken.length).trim();
  };

  const formatTransferTimelineRemark = txn => {
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
    const direction = directionByPrefix[matchedPrefix] || 'to';

    if (note) {
      return `Transfer ${amountLabel} ${direction} ${accountName} - ${note}`;
    }
    return `Transfer ${amountLabel} ${direction} ${accountName}`;
  };

  const formatTimelineEntryRemark = txn => {
    if (isSourceWithdrawLogTransaction(txn)) {
      return formatSourceWithdrawLogRemark(txn?.remark);
    }
    if (isTimelineTransferTransaction(txn)) {
      return formatTransferTimelineRemark(txn);
    }
    return String(txn?.remark || '').trim();
  };

  const isTimelineTransferTransaction = txn => {
    const entryKind = String(txn?.entry_kind || '').trim().toLowerCase();
    if (entryKind) {
      return (
        entryKind === 'transfer' ||
        entryKind === 'legacy_transfer' ||
        entryKind === 'request'
      );
    }
    const remark = String(txn?.remark || '').trim().toLowerCase();
    return (
      remark.startsWith('transferred to ') ||
      remark.startsWith('transferred from ') ||
      remark.startsWith('requested to ') ||
      remark.startsWith('requested from ') ||
      remark.startsWith('requested by ')
    );
  };



  const isLockedTransaction = txn => isTransferTransaction(txn);

  const openRenameModal = useCallback(() => {
    setNewAccountName(account.account_name || '');
    setRenameModalVisible(true);
    setTimeout(() => {
      renameInputRef.current?.focus();
    }, 600);
  }, [account.account_name]);

  const closeRenameModal = () => {
    setRenameModalVisible(false);
    setNewAccountName('');
  };

  const emitDashboardDataChanged = useCallback(
    source => {
      DeviceEventEmitter.emit(DASHBOARD_DATA_CHANGED_EVENT, {
        source: String(source || 'earning-account'),
        accountId: account?.id ? String(account.id) : null,
      });
    },
    [account?.id],
  );

  const handleAccountMenuRename = useCallback(() => {
    closeAccountMenu();
    openRenameModal();
  }, [closeAccountMenu, openRenameModal]);

  const handleAccountMenuPersonalize = useCallback(() => {
    closeAccountMenu();
    navigation.navigate('PersonalizeAccount', {
      accountId: account.id,
    });
  }, [closeAccountMenu, navigation, account.id]);

  const handleAccountMenuDelete = useCallback(() => {
    closeAccountMenu();
    if (account.account_type === 'saving') {
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
              emitDashboardDataChanged('earning-account:delete');
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
    account.account_type,
    account.id,
    closeAccountMenu,
    emitDashboardDataChanged,
    isCreditAccount,
    navigation,
    themedAlert,
    totalBalance,
  ]);

  const handleToggleShowTransferEntries = useCallback(async nextFromSwitch => {
    const nextValue =
      typeof nextFromSwitch === 'boolean'
        ? nextFromSwitch
        : !showTransferEntries;
    setCachedShowTransferEntries(account?.id, nextValue);
    setShowTransferEntries(nextValue);
    if (account?.id) {
      try {
        const settingKey = `${SHOW_TRANSFER_ENTRIES_KEY_PREFIX}_${account.id}`;
        await AsyncStorage.setItem(settingKey, nextValue ? '1' : '0');
      } catch (error) {
        console.error('Failed to save transfer entries setting:', error);
      }
    }
  }, [showTransferEntries, account?.id]);

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
      buildEarningAccountMenuActions({
        onRename: handleAccountMenuRename,
        onPersonalize: handleAccountMenuPersonalize,
        onTransfer: handleAccountMenuTransfer,
        showTransferAction: !isCreditAccount,
        showTransferEntries,
        onToggleShowTransferEntries: handleToggleShowTransferEntries,
        onDelete: handleAccountMenuDelete,
      }),
    [
      handleAccountMenuRename,
      handleAccountMenuPersonalize,
      isCreditAccount,
      handleAccountMenuTransfer,
      showTransferEntries,
      handleToggleShowTransferEntries,
      handleAccountMenuDelete,
    ]
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
      const nextAccount = {
        ...account,
        account_name: nextName,
      };
      setAccount(nextAccount);
      navigation.setParams({account: nextAccount});
      emitDashboardDataChanged('earning-account:rename');
      showToast('Account renamed successfully', 'success');
      closeRenameModal();
    } catch (error) {
      console.error('Failed to rename account:', error);
      themedAlert('Error', 'Failed to rename account.');
    } finally {
      setLoading(false);
    }
  };

  const canEditRemark = txn => {
    if (!txn) {
      return false;
    }
    if (isSourceWithdrawLogTransaction(txn)) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    const amount = Number(txn.amount);
    return Number.isFinite(amount);
  };

  const canEditAmount = txn => {
    if (!txn) {
      return false;
    }
    if (isSourceWithdrawLogTransaction(txn)) {
      return false;
    }
    if (Number(txn.is_deleted) === 1) {
      return false;
    }
    if (isTransferTransaction(txn)) {
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
      if (isSourceWithdrawLogTransaction(txn)) {
        return false;
      }
      if (Number(txn?.is_deleted) === 1) {
        return false;
      }
      const amount = Number(txn?.amount);
      return Number.isFinite(amount);
    },
    [isSourceWithdrawLogTransaction]
  );

  const openTransactionMenu = useCallback(txn => {
    setSelectedTransaction(txn);
    setOptionsVisible(true);
  }, []);

  const isDeletedTransaction = txn => Number(txn?.is_deleted) === 1;

  const handleUpdateAmount = async () => {
    if (!selectedTransaction) {
      return;
    }
    const parsedAmount = parseFloat(
      String(editAmount).replace(/[^0-9.]/g, '')
    );
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return;
    }
    const editCount = Number(selectedTransaction.edit_count) || 0;
    if (editCount >= 3) {
      showToast('Edit limit reached.', 'error');
      return;
    }
    if (Number(selectedTransaction.amount) < 0) {
      const currentAbs = Math.abs(Number(selectedTransaction.amount) || 0);
      const availableBalance = totalBalance + currentAbs;
      if (parsedAmount > availableBalance) {
        showToast('Balance is low. Add amount first to withdraw.', 'error');
        return;
      }
    }
    setLoading(true);
    try {
      const nextAmount =
        Number(selectedTransaction.amount) < 0 ? -parsedAmount : parsedAmount;
      if (!canApplyAmountEdit(selectedTransaction.id, nextAmount)) {
        showToast(
          'Edit not allowed. Balance was insufficient at that time.',
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
      showToast(`${remainingEdits} edits remaining.`, 'success');
      setEditAmountVisible(false);
      setSelectedTransaction(null);
      setEditAmount('');
      loadTransactions();
    } catch (error) {
      if (error?.code === 'CREDIT_LIMIT_EXCEEDED') {
        showToast(
          error?.message || 'Selected credit limit reached.',
          'error'
        );
        return;
      }
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

  const getDeleteBlockedMessage = deleteEvaluation => {
    const dependency = deleteEvaluation?.dependency;
    if (!dependency?.blockingEntry) {
      return "Can't delete this entry because balance depends on it.";
    }
    const balanceValue = Number(dependency.runningBalance) || 0;
    return `Can't delete this entry. Depended balance becomes ${formatCurrency(balanceValue)} on ${formatDateTime(
      dependency.blockingEntry.transaction_date
    )}.`;
  };

  const formatCurrency = useCallback(value => {
    return `${currencySymbol} ${value.toLocaleString('en-IN')}`;
  }, [currencySymbol]);

  const formatDateTime = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDateLabel = useCallback(timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const formatTimeLabel = useCallback(timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const formatEditHistoryValue = useCallback(value => {
    if (value === 'Deleted') {
      return 'Deleted';
    }
    return formatCurrency(Number(value) || 0);
  }, [formatCurrency]);

  const handleQuickPeriodSelect = useCallback(period => {
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
      console.error('Failed to save earning account period preference:', error);
    });
  }, [savePersistedPeriodState]);


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
          style={[styles.receiptSheetCancel, {backgroundColor: popupMutedColor}]}
          onPress={() => setAddReceiptSheetVisible(false)}>
          <Text style={[styles.receiptSheetCancelText, {color: popupPrimaryText}]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
          scope: EARNING_ACCOUNT_PERIOD_STATE_SCOPE,
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
        console.error('Failed to load earning account period preference:', error);
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
        scope: EARNING_ACCOUNT_PERIOD_STATE_SCOPE,
        accountId: account.id,
        state,
      });
    },
    [account?.id],
  );

  const {filteredAdded, filteredWithdrawals} = useMemo(() => {
    const summary = calculateAccountsPeriodData({
      quickPeriod,
      customStartDate,
      customEndDate,
      monthStartDay,
      accountsSource: account?.id ? [account] : [],
      transactionsSource: transactions,
    });

    if (normalizedAccountType === 'credit') {
      const detailMetrics = buildCreditAccountDetailMetrics({
        transactions,
        periodRange: {
          startTime: summary.startTime,
          endTime: summary.endTime,
        },
        balance: totalBalance,
      });

      return {
        filteredAdded: detailMetrics.paidBill,
        filteredWithdrawals: detailMetrics.credit,
      };
    }

    return {
      filteredAdded: summary.filteredEarning,
      filteredWithdrawals: summary.filteredWithdrawals,
    };
  }, [
    account,
    customEndDate,
    customStartDate,
    monthStartDay,
    normalizedAccountType,
    quickPeriod,
    transactions,
    totalBalance,
  ]);

  const activityTimelineEntries = useMemo(() => {
    return transactions
      .filter(
        txn =>
          Number(txn?.is_deleted) !== 1 &&
          (isSourceWithdrawLogTransaction(txn) ||
            (!showTransferEntries && isTimelineTransferTransaction(txn)))
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
  }, [transactions, showTransferEntries, isSourceWithdrawLogTransaction]);

  const ledgerTransactions = useMemo(
    () => transactions.filter(txn => !isSourceWithdrawLogTransaction(txn)),
    [transactions, isSourceWithdrawLogTransaction]
  );

  const transactionList = useMemo(() => {
    const filteredEntries = ledgerTransactions.filter(
      txn => showTransferEntries || !isTimelineTransferTransaction(txn)
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
  }, [ledgerTransactions, showTransferEntries]);

  const renderWithdrawTimelineBlock = () => {
    if (activityTimelineEntries.length === 0) {
      return null;
    }

    const latestEntry = activityTimelineEntries[0];
    const olderEntries = withdrawTimelineExpanded
      ? activityTimelineEntries.slice(1)
      : [];
    const shouldScrollWithdrawTimeline =
      withdrawTimelineExpanded &&
      olderEntries.length > WITHDRAW_TIMELINE_VISIBLE_ENTRIES - 1;

    return (
      <View
        style={[
          styles.withdrawTimelineCard,
          isDark && {
            backgroundColor: themeColors.card,
            borderWidth: 1,
            borderColor: themeColors.border,
            borderRadius: 12,
          },
        ]}>
        <TouchableOpacity
          style={styles.withdrawTimelineInlineHeader}
          activeOpacity={0.85}
          onPress={() => setWithdrawTimelineExpanded(prev => !prev)}>
          <View style={styles.withdrawTimelineContent}>
            <Text
              style={[
                styles.withdrawTimelineText,
                isDark && {color: themeColors.text?.primary || '#F3F4F6'},
              ]}>
              {formatTimelineEntryRemark(latestEntry)}
            </Text>
            <Text
              style={[
                styles.withdrawTimelineMeta,
                isDark && {color: themeColors.text?.secondary || '#9CA3AF'},
              ]}>
              {`${formatDateLabel(latestEntry.transaction_date)} ${formatTimeLabel(
                latestEntry.transaction_date
              )}`}
            </Text>
          </View>
          <Icon
            name={withdrawTimelineExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={isDark ? themeColors.text?.secondary || '#9CA3AF' : '#334155'}
          />
        </TouchableOpacity>

        {olderEntries.length > 0 ? (
          <ScrollView
            style={styles.withdrawTimelineBody}
            contentContainerStyle={styles.withdrawTimelineBodyContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            scrollEnabled={shouldScrollWithdrawTimeline}>
            {olderEntries.map((entry, index) => (
              <View key={String(entry.id)} style={styles.withdrawTimelineItem}>
                <View style={styles.withdrawTimelineMarkerWrap}>
                  <View
                    style={[
                      styles.withdrawTimelineDot,
                      isSourceWithdrawLogTransaction(entry)
                        ? styles.withdrawTimelineDotWithdraw
                        : styles.withdrawTimelineDotTransfer,
                    ]}
                  />
                  {index < olderEntries.length - 1 ? (
                    <View
                      style={[
                        styles.withdrawTimelineConnector,
                        isDark && {backgroundColor: themeColors.border},
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.withdrawTimelineContent}>
                  <Text
                    style={[
                      styles.withdrawTimelineText,
                      isDark && {color: themeColors.text?.primary || '#F3F4F6'},
                    ]}>
                    {formatTimelineEntryRemark(entry)}
                  </Text>
                  <Text
                    style={[
                      styles.withdrawTimelineMeta,
                      isDark && {color: themeColors.text?.secondary || '#9CA3AF'},
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
    const hasMainEntries = transactionList.length > 0;

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
            color={isDark ? themeColors.text?.light || '#9CA3AF' : '#D1D5DB'}
          />
          <Text
            style={[
              styles.emptyText,
              isDark && {color: themeColors.text?.secondary || '#9CA3AF'},
            ]}>
            No transactions yet
          </Text>
        </View>
      );
    }

    if (!hasMainEntries) {
      return null;
    }

    return (
      <FlatList
        data={transactionList}
        keyExtractor={transactionKeyExtractor}
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
        windowSize={7}
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
        renderItem={renderTransactionItem}
      />
    );
  };

  const headerGradientStart = account.icon_color || '#2563EB';
  const headerGradientEnd = darkenHex(headerGradientStart);
  const headerForegroundColor = getReadableHeaderColor(headerGradientStart);
  const headerSubtitleColor = withAlpha(headerForegroundColor, 0.82);
  const headerIconColor = account.icon_color || headerTexture.icon;
  const headerAvatarToneStyle = useMemo(() => {
    if (!isDark) {
      return null;
    }
    return {
      backgroundColor: themeColors.panel || themeColors.card,
      borderColor: themeColors.border,
    };
  }, [isDark, themeColors.panel, themeColors.card, themeColors.border]);
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

  const handleOpenPersonalize = useCallback(() => {
    navigation.navigate('PersonalizeAccount', {accountId: account.id});
  }, [navigation, account.id]);

  const handleCustomDateRange = useCallback((start, end) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    savePersistedPeriodState({
      quickPeriod,
      selectedMonth: null,
      selectedYear: null,
      customStartDate: start,
      customEndDate: end,
    }).catch(error => {
      console.error('Failed to save earning account period preference:', error);
    });
  }, [quickPeriod, savePersistedPeriodState]);

  const handleClearDateRange = useCallback(() => {
    setCustomStartDate(null);
    setCustomEndDate(null);
    savePersistedPeriodState({
      quickPeriod,
      selectedMonth: null,
      selectedYear: null,
      customStartDate: null,
      customEndDate: null,
    }).catch(error => {
      console.error('Failed to clear earning account period preference:', error);
    });
  }, [quickPeriod, savePersistedPeriodState]);

  const transactionKeyExtractor = useCallback(item => String(item.txn.id), []);

  const renderTransactionItem = useCallback(
    ({item}) => (
      <AccountTransactionRow
        item={item}
        styles={styles}
        isDark={isDark}
        themeColors={themeColors}
        formatCurrency={formatCurrency}
        formatDateLabel={formatDateLabel}
        formatTimeLabel={formatTimeLabel}
        parseEditHistory={parseEditHistory}
        formatEditHistoryValue={formatEditHistoryValue}
        isTransferTransaction={isTransferTransaction}
        withDeletedStyle={withDeletedStyle}
        deletedUiStyles={deletedUiStyles}
        renderDeletedBadge={renderDeletedBadge}
        renderDeletedNote={renderDeletedNote}
        getDeletedTapEffectProps={getDeletedTapEffectProps}
        normalizeImageUri={normalizeImageUri}
        openTransactionMenu={openTransactionMenu}
        openReceiptPreview={openReceiptPreview}
      />
    ),
    [
      formatCurrency,
      formatDateLabel,
      formatEditHistoryValue,
      formatTimeLabel,
      isDark,
      isTransferTransaction,
      openReceiptPreview,
      openTransactionMenu,
      themeColors,
    ]
  );

  return (
    <View
      style={[
        styles.container,
        isDark && {backgroundColor: themeColors.background},
        !isDark &&
          account.icon_color && {
            backgroundColor: tintWithWhite(account.icon_color, 0.94),
          },
      ]}>
      {isDark && account.icon_color ? (
        <View
          pointerEvents="none"
          style={[
            styles.accountDarkTintOverlay,
            {backgroundColor: withAlpha(account.icon_color, 0.09)},
          ]}
        />
      ) : null}
      <AccountDetailHeader
        styles={styles}
        insets={insets}
        account={account}
        handleBackNavigation={handleBackNavigation}
        handleStickyHeaderLayout={handleStickyHeaderLayout}
        headerGradientStart={headerGradientStart}
        headerGradientEnd={headerGradientEnd}
        withAlpha={withAlpha}
        headerForegroundColor={headerForegroundColor}
        headerSubtitleColor={headerSubtitleColor}
        accountTypeLabel={accountTypeLabel}
        headerAvatarToneStyle={headerAvatarToneStyle}
        renderAccountHeaderIcon={renderAccountHeaderIcon}
        headerIconColor={headerIconColor}
        menuButtonRef={menuButtonRef}
        openAccountMenu={openAccountMenu}
        handleOpenPersonalize={handleOpenPersonalize}
        headerTexture={headerTexture}
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
            backgroundColor: themeColors.card || colors.white,
            paddingBottom: spacing.md + insets.bottom,
          },
          account.icon_color && {
            borderTopColor: withAlpha(account.icon_color, 0.3),
          },
        ]}>
        {deferredUiReady ? renderWithdrawTimelineBlock() : null}
        {/* Action Buttons */}
        <View style={styles.actionButtons}>
            <CTAButton
              label="Withdraw"
              kind="withdraw"
              compact
              style={styles.earningTopCtaButton}
              onPress={() => {
                navigation.navigate('AmountEntry', {
                  mode: 'withdraw',
                  account,
                  hideTransferAction: true,
                  withdrawFromExpensesOnly: true,
                  prevRouteKey: route.key,
                  initialEntryDate: entryDate.toISOString(),
                });
              }}
            />
            <CTAButton
              label={isCreditAccount ? 'Paid Bill' : 'Add Amount'}
              kind="add"
              compact
              style={styles.earningTopCtaButton}
              onPress={() => {
                navigation.navigate('AmountEntry', {
                  mode: isCreditAccount ? 'payBill' : 'add',
                  account,
                  prevRouteKey: route.key,
                  initialEntryDate: entryDate.toISOString(),
                  enableCalculator: isCreditAccount,
                });
              }}
            />
        </View>
      </View>

      {scheduledEntriesCount > 0 ? (
        <TouchableOpacity
          style={[
            styles.scheduledFab,
            {
              bottom: spacing.md + insets.bottom + 88,
              backgroundColor: 'rgba(15, 118, 110, 0.78)',
            },
          ]}
          activeOpacity={0.9}
          onPress={handleOpenScheduledEntries}>
          <Icon name="time-outline" size={22} color="#FFFFFF" />
          <View style={styles.scheduledFabBadge}>
            <Text style={styles.scheduledFabBadgeText}>
              {scheduledEntriesCount > 99 ? '99+' : String(scheduledEntriesCount)}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {deferredUiReady ||
      addReceiptSheetVisible ||
      receiptPreviewVisible ||
      optionsVisible ||
      editAmountVisible ||
      editRemarkVisible ||
      menuVisible ||
      renameModalVisible ? (
        <>
      <BottomSheet
        visible={addReceiptSheetVisible}
        onClose={() => setAddReceiptSheetVisible(false)}>
        {renderAddReceiptSheet()}
      </BottomSheet>

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
              {isDeletedTransaction(selectedTransaction) && (
                <Text style={styles.optionsSubtitle}>
                  Deleted entry can�t be edited.
                </Text>
              )}
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
              style={[
                styles.optionButton,
                !canEditRemark(selectedTransaction) &&
                  styles.optionButtonDisabled,
              ]}
              disabled={!canEditRemark(selectedTransaction)}
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
                  color={
                    canEditRemark(selectedTransaction)
                      ? popupPrimaryText
                      : themeColors.text?.light || colors.text.light
                  }
                />
                <Text
                  style={[
                    styles.optionText,
                    {color: popupPrimaryText},
                    !canEditRemark(selectedTransaction) &&
                      styles.optionTextDisabled,
                  ]}>
                  Edit Remark
                </Text>
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
                themedAlert(
                  'Delete Entry',
                  isLockedTransaction(selectedTransaction)
                    ? 'Deleting here will also delete the linked entry from your linked account. This may cause confusion in your accounts.'
                    : 'Are you sure you want to delete this entry?',
                  [
                    {text: 'Cancel', style: 'cancel'},
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        const deleteHistory = buildDeleteHistory(
                          selectedTransaction
                        );
                        closeOptionsMenu(true);
                        try {
                          if (__DEV__) {
                            console.log('[EARN-DELETE][DELETE-TAP]', {
                              accountId: account?.id,
                              selectedId: selectedTransaction?.id,
                              selectedAmount: Number(selectedTransaction?.amount) || 0,
                              selectedTs:
                                Number(selectedTransaction?.transaction_date) || 0,
                              transactionsCount: transactions.length,
                            });
                          }
                          const deleteEvaluation =
                            evaluateAccountTransactionDelete({
                              txn: selectedTransaction,
                              transactions,
                              currentAccountId: account.id,
                              strictEcoEnabled: await getStrictEcoEnabled(),
                              isLockedTransaction,
                              isBlockedTransaction:
                                isSourceWithdrawLogTransaction,
                              debugTag: 'EARN-DELETE',
                            });
                          if (!deleteEvaluation.allowed) {
                            themedAlert(
                              "Can't delete this entry",
                              getDeleteBlockedMessage(deleteEvaluation)
                            );
                            return;
                          }
                          if (isLockedTransaction(selectedTransaction)) {
                            const linked = deleteEvaluation.linkedTransaction;
                            if (!linked) {
                              showToast(
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

      <EditAmountModal
        visible={editAmountVisible}
        value={editAmount}
        onChangeText={setEditAmount}
        onSave={handleUpdateAmount}
        onClose={() => setEditAmountVisible(false)}
        loading={loading}
      />

      <EditRemarkModalSheet
        visible={editRemarkVisible}
        onClose={() => setEditRemarkVisible(false)}
        value={editRemark}
        onChangeText={setEditRemark}
        onSave={handleUpdateRemark}
        loading={loading}
      />
      <DropdownPopup
        visible={menuVisible}
        onClose={closeAccountMenu}
        cardStyle={[
          styles.menuCard,
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
            {accountMenuActions.map(action => {
              if (action.type === 'switch') {
                return (
                  <View
                    key={action.id}
                    style={[
                      styles.optionButton,
                      styles.optionRow,
                      action.disabled && styles.optionButtonDisabled,
                    ]}>
                    <View style={styles.optionItemRow}>
                      <Icon
                        name={action.icon}
                        size={20}
                        color={
                          action.disabled
                            ? themeColors.text?.light || colors.text.light
                            : popupPrimaryText
                        }
                      />
                      <Text
                        style={[
                          styles.optionText,
                          {color: popupPrimaryText},
                          action.disabled && {
                            color: themeColors.text?.light || colors.text.light,
                          },
                        ]}>
                        {action.label}
                      </Text>
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
                  {action.layout === 'split' ? (
                    <View style={styles.optionRow}>
                      <View style={styles.optionItemRow}>
                        <Icon
                          name={action.icon}
                          size={20}
                          color={action.selected ? '#10B981' : popupPrimaryText}
                        />
                        <Text
                          style={[
                            styles.optionText,
                            {color: popupPrimaryText},
                            action.selected && styles.optionTextSelected,
                          ]}>
                          {action.label}
                        </Text>
                      </View>
                      {action.trailingIcon ? (
                        <Icon name={action.trailingIcon} size={18} color="#10B981" />
                      ) : null}
                    </View>
                  ) : (
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
                  )}
                </TouchableOpacity>
              );
            })}
      </DropdownPopup>

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
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  accountDarkTintOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  stickyHeader: {
    backgroundColor: colors.headerBg,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 4,
  },
  header: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: headerTexture.border,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 78,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
    textAlign: 'left',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: spacing.md - 2,
    paddingRight: spacing.xs,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: headerTexture.title,
    textAlign: 'left',
    opacity: 0.92,
  },
  headerMetaPill: {
    marginTop: spacing.xs + 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    gap: 8,
  },
  accountAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
    shadowColor: '#04140d',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 2,
  },
  accountAvatarTap: {
    marginLeft: 0,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    padding: 0,
  },
  backupIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupSpinner: {
    position: 'absolute',
    width: 30,
    height: 30,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerMetricsSection: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  accountMetricsWrapper: {
    paddingTop: spacing.sm,
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
    color: '#4B5563',
    marginBottom: 4,
  },
  dropdown: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: '#1F2937',
    flex: 1,
  },
  dropdownDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  dropdownTextDisabled: {
    color: '#9CA3AF',
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
    backgroundColor: '#CBD5E1',
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
    backgroundColor: '#EF4444',
  },
  accountMetricLabel: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'left',
  },
  accountMetricValue: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: '#1F2937',
    textAlign: 'left',
  },
  accountMetricNegative: {
    color: '#EF4444',
  },
  periodOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  periodDropdownModal: {
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    borderBottomColor: '#F3F4F6',
  },
  periodDropdownOptionActive: {
    backgroundColor: '#F0F9FF',
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
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  periodDropdownOptionClearText: {
    fontSize: fontSize.medium,
    color: '#EF4444',
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
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  receiptSheetOption: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minWidth: 120,
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
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  receiptSheetCancelText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
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
  },
  attachButtonDisabled: {
    opacity: 0.5,
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
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  receiptThumb: {
    width: '100%',
    height: '100%',
  },
  receiptRemoveButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  receiptRemoveText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: '#B91C1C',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalBackdrop: {
    flex: 1,
  },
  addFullScreen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: spacing.lg,
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  addHeaderButton: {
    padding: 6,
  },
  addHeaderTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  addHeaderSpacer: {
    width: 34,
  },
  addContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'flex-end',
  },
  addCenterBlock: {
    marginBottom: spacing.lg,
  },
  addAmountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  addCurrencySymbol: {
    fontSize: 28,
    color: '#9CA3AF',
    marginRight: 6,
  },
  addAmountInput: {
    fontSize: 48,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 4,
  },
  addNoteInput: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    textAlign: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  addScheduleSection: {
    width: '100%',
  },
  addBottomBlock: {
    paddingBottom: spacing.lg,
  },
  addCtaContainer: {
    marginTop: spacing.md,
  },
  addCtaButton: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 0.4,
    borderColor: '#4ADE80',
  },
  addCtaText: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#16A34A',
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
  setDefaultGlow: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
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
  defaultToast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  defaultToastText: {
    color: colors.white,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  modalAmountInput: {
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    borderBottomColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingAccountItemSelected: {
    backgroundColor: '#F3F4F6',
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
  modalAddButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.bold,
    color: colors.white,
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
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.lg,
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuCard: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(11,42,27,0.12)',
    paddingBottom: spacing.sm,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    shadowRadius: 10,
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
  optionsSubtitle: {
    marginTop: 4,
    fontSize: fontSize.small,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  optionButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  optionTextSelected: {
    color: '#10B981',
    fontWeight: fontWeight.semibold,
  },
  optionDelete: {
    backgroundColor: 'transparent',
  },
  optionDeleteText: {
    color: '#B91C1C',
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
  section: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  amountInput: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  pickerContainer: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  addButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: spacing.md,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  totalSection: {
    backgroundColor: '#10B981',
    padding: 20,
    borderRadius: 12,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: fontSize.medium,
    color: 'rgba(255,255,255,0.9)',
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: fontWeight.bold,
    color: colors.white,
    marginTop: 4,
  },
  historySection: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  listSpacer: {

    flex: 1,

    minHeight: 280,

  },

  historyTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  chatList: {
    gap: spacing.md,
  },
  datePill: {
    alignSelf: 'center',
    backgroundColor: '#D9E7E3',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  datePillText: {
    fontSize: fontSize.small,
    color: '#4B5563',
    fontWeight: fontWeight.semibold,
  },
  withdrawTimelineCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: 0,
    overflow: 'hidden',
  },
  withdrawTimelineInlineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  withdrawTimelineBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    maxHeight: 156,
  },
  withdrawTimelineBodyContent: {
    gap: spacing.xs,
  },
  withdrawTimelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  withdrawTimelineMarkerWrap: {
    width: 18,
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  withdrawTimelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  withdrawTimelineDotTransfer: {
    backgroundColor: '#2563EB',
  },
  withdrawTimelineDotWithdraw: {
    backgroundColor: '#DC2626',
  },
  withdrawTimelineConnector: {
    width: 1,
    flex: 1,
    marginTop: 3,
    backgroundColor: '#CBD5E1',
    minHeight: 18,
  },
  withdrawTimelineContent: {
    flex: 1,
    paddingBottom: spacing.xs,
  },
  withdrawTimelineText: {
    fontSize: fontSize.small,
    color: '#334155',
    fontWeight: fontWeight.medium,
    lineHeight: 18,
  },
  withdrawTimelineMeta: {
    fontSize: fontSize.small,
    color: '#64748B',
    marginTop: 2,
  },
  chatRow: {
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  chatRowDebit: {
    alignItems: 'flex-start',
  },
  chatBubble: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    minWidth: '70%',
    overflow: 'hidden',
  },
  chatBubbleCredit: {
    backgroundColor: colors.white,
    borderColor: colors.border,
  },
  chatBubbleDebit: {
    backgroundColor: colors.white,
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
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatIconDebit: {
    backgroundColor: '#FEE2E2',
  },
  chatIconTransfer: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
  },
  chatAmount: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: '#10B981',
    flex: 1,
  },
  chatAmountDebit: {
    color: '#EF4444',
  },
  chatAmountTransfer: {
    color: '#3B82F6',
  },
  chatTime: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  editedTag: {
    marginLeft: 8,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  toastContainer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  toastText: {
    color: colors.white,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  moreDots: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  emptyHistory: {
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bottomNavIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  moreText: {
    fontSize: 10,
    color: colors.text.secondary,
    marginTop: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
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
    fontSize: fontSize.xlarge,
    fontWeight: fontWeight.bold,
    color: '#10B981',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  earningTopActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  earningTopCtaButton: {
    flex: 1,
  },
  earningBottomActionRow: {
    marginTop: spacing.xs,
  },
  earningBottomFullButton: {
    flex: 0,
    width: '100%',
  },
  receivedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingVertical: spacing.md,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  receivedButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: '#EF4444',
  },
  givenButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingVertical: spacing.md,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  givenButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: '#10B981',
  },
  earningPrimaryButton: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  earningPrimaryText: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#EF4444',
    marginLeft: spacing.xs,
  },
  earningTransferButton: {
    flex: 1,
  },
  earningTransferText: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#2563EB',
    marginLeft: spacing.xs,
  },
  earningSecondaryButton: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 0.6,
    borderColor: '#4ADE80',
  },
  earningSecondaryText: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#10B981',
  },
  earningSecondaryTextDark: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#16A34A',
    marginLeft: spacing.xs,
  },
  earningActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Styles for Withdraw/Transfer Modal
  withdrawScrollContainer: {
    flexGrow: 1,
    paddingHorizontal: spacing.sm,
    justifyContent: 'flex-end',
  },
  withdrawCenterBlock: {
    marginBottom: spacing.lg,
  },
  withdrawAmountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  withdrawNoteInput: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    textAlign: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  withdrawBottomBlock: {
    paddingBottom: spacing.lg,
  },
  withdrawActionButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  withdrawPrimaryButton: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  withdrawPrimaryText: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#EF4444',
  },
  withdrawSecondaryButton: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  withdrawSecondaryText: {
    fontSize: fontSize.regular - 1,
    fontWeight: fontWeight.bold,
    color: '#1D4ED8',
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
    shadowColor: '#000',
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
    backgroundColor: '#FFFFFF',
  },
  scheduledFabBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: '#0F172A',
  },
});

export default AccountDetailScreen;
