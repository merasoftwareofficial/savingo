import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Keyboard,
  BackHandler,
  InteractionManager,
  Platform,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import {CommonActions} from '@react-navigation/native';
import {Picker} from '@react-native-picker/picker';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import BsCashCoin from '../components/icons/BsCashCoin';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useToast} from '../hooks/useToast';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import AmountActionButton from '../components/AmountActionButton';
import AmountCalculatorPad from '../components/AmountCalculatorPad';
import CTAButton from '../components/ui/ctabuttons';
import DropdownPopup from '../components/ui/popups/DropdownPopup';
import {getAllAccounts, getPrimaryEarningAccount} from '../services/accountsDatabase';
import {createTransaction, calculateAccountBalance, getTransactionsByAccount} from '../services/transactionsDatabase';
import {createScheduledEntry} from '../services/recurringDatabase';
import {
  canScheduleExactAlarms,
  openExactAlarmSettings,
} from '../services/scheduledAlarmService';
import {canWithdrawAtTimestampWithEntries, getBalanceAtTimestampWithEntries} from '../services/transactionTimeline';
import {
  clearSoftInputModeOverride,
  setSoftInputAdjustPan,
} from '../services/softInputModeService';
import {evaluateAmountExpression, formatAmountValue} from '../utils/amountExpression';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getStrictEcoEnabled} from '../services/strictEcoService';
import {ensureEcoTransactionEntryAllowed} from '../services/strictEcoCoordinator';
import {useAppAlert} from '../context/AppAlertContext';
import {useTheme} from '../context/ThemeContext';
import {evaluateCreditLimitDelta} from '../services/creditLimitPolicy';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const LIST_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const LIST_PADDING = (LIST_HEIGHT - ITEM_HEIGHT) / 2;

const LAST_TRANSFER_ACCOUNT_KEY = 'lastTransferAccountId';
const CALCULATOR_OPERATOR_RE = /[+\-*/]/;
const EARNING_WITHDRAW_LOG_TOKEN = '[ewlog]';
const CREDIT_WITHDRAW_LOG_TOKEN = '[cwlog]';
const REPEAT_OPTIONS = ['Once', 'Daily', 'Weekly', 'Monthly'];
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';
const NOTE_INPUT_LINE_HEIGHT = 20;
const NOTE_INPUT_SINGLE_LINE_HEIGHT = NOTE_INPUT_LINE_HEIGHT;
const NOTE_INPUT_DOUBLE_LINE_HEIGHT = NOTE_INPUT_LINE_HEIGHT * 2;

const normalizeRepeatTypeValue = value =>
  String(value || 'Once')
    .trim()
    .toLowerCase();

const renderAccountIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }
  return <Icon name={iconName} size={size} color={color} />;
};


const getAccountTypeLabel = type => {
  if (type === 'earning') {
    return 'Earning account';
  }
  if (type === 'saving') {
    return 'Savings account';
  }
  if (type === 'credit') {
    return 'Credit card account';
  }
  if (type === 'expenses') {
    return 'Expenses account';
  }
  return 'Bank account';
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

const AmountEntryScreen = ({route, navigation}) => {
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const themedAlert = useCallback((title, message, actions) => {
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
  }, [showAlert]);
  const {showToast} = useToast();
  const currencySymbol = useCurrencySymbol();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    mode = 'add',
    account,
    prevRouteKey,
    initialEntryDate,
    transferOnly = false,
    withdrawFromExpensesOnly = false,
    hideTransferAction = false,
    returnOnly = false,
    ledgerAction = null,
    ledgerContactRecordId = null,
    ledgerContactName = '',
    enableCalculator = false,
  } = route?.params ?? {};

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [noteInputHeight, setNoteInputHeight] = useState(
    NOTE_INPUT_SINGLE_LINE_HEIGHT,
  );
  const [withdrawReceiptUri, setWithdrawReceiptUri] = useState('');
  const [entryDate, setEntryDate] = useState(
    initialEntryDate ? new Date(initialEntryDate) : new Date(),
  );
  const [scheduleApplied, setScheduleApplied] = useState(false);
  const [schedulePopupVisible, setSchedulePopupVisible] = useState(false);
  const [repeatType, setRepeatType] = useState('Once');
  const [draftRepeatType, setDraftRepeatType] = useState('Once');
  const [repeatMenuVisible, setRepeatMenuVisible] = useState(false);
  const [attachPanelVisible, setAttachPanelVisible] = useState(false);
  const [draftEntryDate, setDraftEntryDate] = useState(null);

  const [transferAccounts, setTransferAccounts] = useState([]);
  const [transferTargetId, setTransferTargetId] = useState(null);
  const [transferSelected, setTransferSelected] = useState(false);
  const [transferPopupVisible, setTransferPopupVisible] = useState(false);
  const [selectedTransferAccount, setSelectedTransferAccount] = useState(null);
  const [transferListExpanded, setTransferListExpanded] = useState(false);

  const amountInputRef = useRef(null);
  const noteInputRef = useRef(null);
  const dateListRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const lastDateIndexRef = useRef(-1);
  const lastHourIndexRef = useRef(-1);
  const lastMinuteIndexRef = useRef(-1);

  const isWithdrawMode = mode === 'withdraw';
  const isRequestMode = mode === 'request';
  const isCreditMode = mode === 'credit';
  const isPayBillMode = mode === 'payBill';
  const isRequestLikeMode = isRequestMode || isPayBillMode;
  const isLedgerFlow = returnOnly && (ledgerAction === 'paid' || ledgerAction === 'get');
  const isExpenseAccount = account?.account_type === 'expenses';
  const isSavingAccount = account?.account_type === 'saving';
  const isCreditAccount = account?.account_type === 'credit';
  const isEarningWithdrawViaExpensesFlow =
    isWithdrawMode &&
    withdrawFromExpensesOnly &&
    String(account?.account_type || '').toLowerCase() === 'earning';
  const isCreditWithdrawViaExpensesFlow =
    isWithdrawMode &&
    withdrawFromExpensesOnly &&
    String(account?.account_type || '').toLowerCase() === 'credit';
  const isSourceWithdrawViaExpensesFlow =
    isEarningWithdrawViaExpensesFlow || isCreditWithdrawViaExpensesFlow;
  const showWithdrawCamera = (isWithdrawMode || isCreditMode) && !transferOnly;
  const canShowTransferAction =
    !isCreditMode && !hideTransferAction && (!isExpenseAccount || transferOnly);
  const isLedgerCalculatorMode =
    isLedgerFlow && (ledgerAction === 'paid' || ledgerAction === 'get');
  const isEffectiveCalculatorMode =
    enableCalculator || (!isRequestMode && (isLedgerCalculatorMode || !isLedgerFlow));

  const [calculatorExpression, setCalculatorExpression] = useState('');
  const [calculatorPreview, setCalculatorPreview] = useState('');
  const centerAreaTopPadding = useMemo(
    () => Math.max(spacing.sm, spacing.xl - Math.round((insets.bottom || 0) / 2)),
    [insets.bottom],
  );
  useEffect(() => {
    navigation.setOptions({headerShown: false, gestureEnabled: false});
  }, [navigation]);

  useEffect(() => {
    if (!isEffectiveCalculatorMode) {
      return undefined;
    }

    setSoftInputAdjustPan();

    const focusSub = navigation.addListener('focus', () => {
      setSoftInputAdjustPan();
    });
    const blurSub = navigation.addListener('blur', () => {
      clearSoftInputModeOverride();
    });

    return () => {
      focusSub();
      blurSub();
      clearSoftInputModeOverride();
    };
  }, [isEffectiveCalculatorMode, navigation]);

  useEffect(() => {
    const onBackPress = () => {
      if (attachPanelVisible) {
        setAttachPanelVisible(false);
        return true;
      }
      if (transferPopupVisible) {
        closeTransferPopup();
        return true;
      }
      if (schedulePopupVisible) {
        closeSchedulePopup();
        return true;
      }
      return false;
    };

    const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    const navSub = navigation.addListener('beforeRemove', e => {
      if (attachPanelVisible || transferPopupVisible || schedulePopupVisible) {
        e.preventDefault();
        if (attachPanelVisible) {
          setAttachPanelVisible(false);
        }
        if (transferPopupVisible) {
          closeTransferPopup();
        }
        if (schedulePopupVisible) {
          closeSchedulePopup();
        }
      }
    });

    return () => {
      backSub.remove();
      navSub();
    };
  }, [navigation, attachPanelVisible, transferPopupVisible, schedulePopupVisible]);

  useEffect(() => {
    const focus = () => amountInputRef.current?.focus();
    requestAnimationFrame(focus);
    const t1 = setTimeout(focus, 120);
    return () => clearTimeout(t1);
  }, []);



  useEffect(() => {
    if ((!isWithdrawMode && !isRequestLikeMode) || !account?.id) {
      return;
    }
    const loadTransferAccounts = async () => {
      try {
        const accounts = getAllAccounts()
          .filter(acc => {
            if (isRequestLikeMode) {
              return (
                acc.account_type === 'earning' &&
                String(acc.id) !== String(account.id)
              );
            }
            if (isWithdrawMode && withdrawFromExpensesOnly) {
              return acc.account_type === 'expenses';
            }
            return acc.id !== account.id;
          })
          .sort((a, b) => String(a.account_name).localeCompare(String(b.account_name)));
        setTransferAccounts(accounts);

        let preferredAccount = null;
        if (isWithdrawMode) {
          try {
            const preferredId = await AsyncStorage.getItem(LAST_TRANSFER_ACCOUNT_KEY);
            preferredAccount = accounts.find(
              acc => String(acc.id) === String(preferredId)
            );
          } catch (error) {
            console.warn('Failed to read last transfer account:', error);
          }
        }

        const nextAccount = preferredAccount || accounts[0] || null;
        setSelectedTransferAccount(nextAccount);
        setTransferTargetId(nextAccount?.id ?? null);
      } catch (error) {
        console.error('Failed to load transfer accounts:', error);
      }
    };

    loadTransferAccounts();
  }, [
    isWithdrawMode,
    isRequestLikeMode,
    isSourceWithdrawViaExpensesFlow,
    withdrawFromExpensesOnly,
    account?.id,
  ]);


  const title = useMemo(() => {
    if (isLedgerFlow) {
      return ledgerAction === 'paid' ? 'Paid' : 'Get';
    }
    if (isCreditMode) {
      return transferOnly ? 'Transfer' : 'Credit';
    }
    if (isWithdrawMode) {
      if (transferOnly) {
        return 'Transfer';
      }
      if (isSourceWithdrawViaExpensesFlow) {
        return 'Withdraw';
      }
      if (isExpenseAccount) {
        return 'Withdraw';
      }
      return 'Withdraw / Transfer';
    }
    if (isPayBillMode) {
      return 'Paid Bill';
    }
    if (isRequestMode) {
      return isExpenseAccount ? 'Add Budget' : 'Request Amount';
    }
    return 'Add Amount';
  }, [
    isLedgerFlow,
    ledgerAction,
    isWithdrawMode,
    isCreditMode,
    isRequestMode,
    isPayBillMode,
    isSourceWithdrawViaExpensesFlow,
    isExpenseAccount,
    transferOnly,
  ]);


  const primaryLedgerAccount = useMemo(() => {
    if (!isLedgerFlow) {
      return null;
    }
    return getPrimaryEarningAccount();
  }, [isLedgerFlow]);

  const targetInfo = useMemo(() => {
    if (isLedgerFlow) {
      const resolvedContactName = String(ledgerContactName || '').trim() || 'Ledger Contact';
      const linkedAccountName = String(primaryLedgerAccount?.account_name || '').trim();
      return {
        type: 'contact',
        title: resolvedContactName,
        subtitle: linkedAccountName ? `Primary account: ${linkedAccountName}` : '',
      };
    }

    if (account?.account_name) {
      return {
        type: 'account',
        title: account.account_name,
        subtitle: getAccountTypeLabel(account.account_type),
      };
    }

    return null;
  }, [isLedgerFlow, ledgerContactName, primaryLedgerAccount?.account_name, account]);

  const isFutureEntryDate = value => {
    if (!(value instanceof Date)) {
      return false;
    }
    return value.getTime() > Date.now();
  };

  const sendResultAndGoBack = payload => {
    if (payload?.action === 'paid' || payload?.action === 'get') {
      DeviceEventEmitter.emit('ledger:amountEntryResult', payload);
    }
    let didSet = false;
    if (prevRouteKey) {
      try {
        navigation.dispatch(
          CommonActions.setParams({
            params: {amountEntryResult: payload},
            source: prevRouteKey,
          }),
        );
        didSet = true;
      } catch (error) {
        console.warn('Failed to set params on prev route:', error);
      }
    }

    if (!didSet) {
      const state = navigation.getState?.();
      const routes = state?.routes ?? [];
      const prevRoute = routes.length > 1 ? routes[routes.length - 2] : null;
      if (prevRoute?.name) {
        navigation.navigate({
          name: prevRoute.name,
          params: {amountEntryResult: payload},
          merge: true,
        });
      }
    }

    navigation.goBack();
  };

  const emitDashboardDataChanged = useCallback(
    source => {
      DeviceEventEmitter.emit(DASHBOARD_DATA_CHANGED_EVENT, {
        source: String(source || 'amount-entry'),
        accountId: account?.id ? String(account.id) : null,
      });
    },
    [account?.id],
  );

  const openLowBalancePrompt = lowBalanceAccount => {
    const contextAccount = lowBalanceAccount || account;
    const isContextExpense = contextAccount?.account_type === 'expenses';
    const message = isContextExpense
      ? 'Add amount first or enable Auto Get option.'
      : 'Add amount first.';
    if (isContextExpense) {
      themedAlert(
        'Balance is low',
        message,
        [
          {
            text: 'Open Auto Get option',
            onPress: () => {
              if (contextAccount?.id) {
                navigation.navigate('PersonalizeAccount', {
                  accountId: contextAccount.id,
                });
              }
            },
          },
          {text: 'OK', style: 'cancel'},
        ],
        {cancelable: false},
      );
      return;
    }
    themedAlert(
      'Balance is low',
      message,
      [{text: 'OK', style: 'cancel'}],
      {cancelable: false},
    );
  };

  const canDebitCreditAccount = useCallback(
    async (creditAccount, debitAmount) => {
      if (!creditAccount || String(creditAccount.account_type || '').trim().toLowerCase() !== 'credit') {
        return true;
      }
      const evaluation = evaluateCreditLimitDelta({
        account: creditAccount,
        currentBalance: calculateAccountBalance(creditAccount.id),
        delta: -Math.abs(Number(debitAmount) || 0),
      });
      if (!evaluation.allowed) {
        showToast(evaluation.message || 'Selected credit limit reached.', 'error');
        return false;
      }
      return true;
    },
    [showToast],
  );

  const showTransactionLimitError = useCallback(
    error => {
      if (error?.code !== 'CREDIT_LIMIT_EXCEEDED') {
        return false;
      }
      showToast(
        error?.message || 'Selected credit limit reached.',
        'error',
      );
      return true;
    },
    [showToast],
  );

  const ensureReceiptsDir = useCallback(async () => {
    const receiptsDir = `${RNFS.DocumentDirectoryPath}/receipts`;
    const exists = await RNFS.exists(receiptsDir);
    if (!exists) {
      await RNFS.mkdir(receiptsDir);
    }
    return receiptsDir;
  }, []);

  const persistReceiptImage = useCallback(
    async sourceUri => {
      if (!sourceUri) {
        return '';
      }
      const sourcePath = stripFileScheme(sourceUri);
      const extension = getFileExtension(sourcePath);
      const receiptsDir = await ensureReceiptsDir();
      const fileName = `receipt_${Date.now()}.${extension}`;
      const destination = `${receiptsDir}/${fileName}`;
      await RNFS.copyFile(sourcePath, destination);
      return destination;
    },
    [ensureReceiptsDir],
  );

  const pickReceipt = useCallback(
    async source => {
      try {
        const pickerOptions = {
          mediaType: 'photo',
          selectionLimit: 1,
          quality: 0.8,
          maxWidth: 1600,
          maxHeight: 1600,
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
        showToast('Failed to add bill photo.', 'error');
      }
    },
    [showToast],
  );

  const openWithdrawCameraOptions = useCallback(() => {
    setAttachPanelVisible(prev => !prev);
  }, []);

  const handleAttachSourceSelect = useCallback(
    async source => {
      setAttachPanelVisible(false);
      setTimeout(() => {
        pickReceipt(source);
      }, 80);
    },
    [pickReceipt],
  );

  const handleScreenPress = () => {
    if (attachPanelVisible) {
      setAttachPanelVisible(false);
      return;
    }
    Keyboard.dismiss();
  };

  const buildSourceWithdrawLogRemark = useCallback(
    (amountValue, destinationAccount, noteText = '') => {
      const formattedAmount = Math.abs(amountValue).toLocaleString('en-IN');
      const destinationName =
        String(destinationAccount?.account_name || '').trim() ||
        'Expenses account';
      const token = isCreditWithdrawViaExpensesFlow
        ? CREDIT_WITHDRAW_LOG_TOKEN
        : EARNING_WITHDRAW_LOG_TOKEN;
      const trimmedNote = String(noteText || '').trim();
      return trimmedNote
        ? `${token} Withdraw ${currencySymbol} ${formattedAmount} in ${destinationName} - ${trimmedNote}`
        : `${token} Withdraw ${currencySymbol} ${formattedAmount} in ${destinationName}`;
    },
    [currencySymbol, isCreditWithdrawViaExpensesFlow]
  );

  const handleSubmit = async action => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return;
    }
    const futureEntrySelected = isFutureEntryDate(entryDate);
    if (
      (action === 'transfer' ||
        action === 'request' ||
        action === 'payBill' ||
        (action === 'withdraw' && isSourceWithdrawViaExpensesFlow)) &&
      !transferTargetId
    ) {
      showToast('Please select an account.', 'error');
      return;
    }

    if (!isLedgerFlow && !account?.id) {
      showToast('Account not found.', 'error');
      return;
    }

    const noteText = note?.trim?.() ?? note ?? '';
    const entryTimestamp = entryDate?.getTime?.() ?? Date.now();
    const normalizedRepeatType = normalizeRepeatTypeValue(repeatType);
    const shouldSchedule = futureEntrySelected || normalizedRepeatType !== 'once';
    const strictEcoEnabled = await getStrictEcoEnabled();

    if (isLedgerFlow) {
      sendResultAndGoBack({
        resultId: Date.now(),
        action: ledgerAction,
        amount: parsedAmount,
        note: noteText,
        entryDateIso: entryDate?.toISOString?.() || null,
        contactRecordId: ledgerContactRecordId ? String(ledgerContactRecordId) : null,
      });
      return;
    }

    const hasConsent = await ensureEcoTransactionEntryAllowed();
    if (!hasConsent) {
      return;
    }

    if (shouldSchedule) {
      const exactAlarmAllowed = await canScheduleExactAlarms();
      if (!exactAlarmAllowed) {
        themedAlert(
          'Allow exact alarms',
          'Exact alarm permission is off. Please allow it or future entries may not run at the correct time.',
          [
            {
              text: 'Open Settings',
              onPress: async () => {
                try {
                  console.log('[SCHEDULE_ALARM][ALERT] Open Settings pressed');
                  const opened = await openExactAlarmSettings();
                  console.log('[SCHEDULE_ALARM][ALERT] Open Settings result:', opened);
                  if (!opened) {
                    showToast('Could not open settings.', 'error');
                  }
                } catch (error) {
                  console.error('Failed to open exact alarm settings:', error);
                  showToast('Could not open settings.', 'error');
                }
              },
            },
            {text: 'Cancel', style: 'cancel'},
          ],
        );
        return;
      }
    }

    const requestFromPrimaryEarning = async (
      amountValue,
      destinationAccount = account,
      options = {}
    ) => {
      if (!destinationAccount?.id) {
        showToast('Target account not found.', 'error');
        return false;
      }
      const primary = getPrimaryEarningAccount();
      if (!primary) {
        showToast(
          'Please set a primary earning account first.',
          'error'
        );
        return false;
      }
      try {
        if (strictEcoEnabled) {
          const earningEntries = getTransactionsByAccount(primary.id);
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
              Math.abs(amountValue),
              entryTimestamp,
              earningEntries,
              earningPending
            )
          ) {
            showToast(
              `Request not allowed. ${primary.account_name} had insufficient balance at that time.`,
              'error'
            );
            return false;
          }
          const earningBalance = calculateAccountBalance(primary.id);
          if (earningBalance < Math.abs(amountValue)) {
            showToast(`Low balance on ${primary.account_name}.`, 'error');
            return false;
          }
        }

        const trimmedNote = noteText.trim();
        const transferMode = String(options?.mode || '').toLowerCase() === 'transfer';
        const destinationAccountName =
          String(destinationAccount?.account_name || '').trim() ||
          'Expenses account';
        const fromRemark = transferMode
          ? trimmedNote
            ? `Transferred to ${destinationAccountName} - ${trimmedNote}`
            : `Transferred to ${destinationAccountName}`
          : trimmedNote
            ? `Requested by ${destinationAccountName} - ${trimmedNote}`
            : `Requested by ${destinationAccountName}`;
        const toRemark = transferMode
          ? trimmedNote
            ? `Transferred from ${primary.account_name} - ${trimmedNote}`
            : `Transferred from ${primary.account_name}`
          : trimmedNote
            ? `Requested from ${primary.account_name} - ${trimmedNote}`
            : `Requested from ${primary.account_name}`;

        await createTransaction(
          primary.id,
          -Math.abs(amountValue),
          fromRemark,
          entryTimestamp
        );
        await createTransaction(
          destinationAccount.id,
          Math.abs(amountValue),
          toRemark,
          entryTimestamp
        );
        return true;
      } catch (error) {
        console.error('Failed to request amount:', error);
        showToast('Failed to request amount. Please try again.', 'error');
        return false;
      }
    };

    const saveScheduledAction = async ({
      actionType,
      scheduledAmount,
      scheduledRemark = noteText,
      targetAccountId = null,
      actionPayload = null,
    }) => {
      await createScheduledEntry({
        accountId: account.id,
        amount: scheduledAmount,
        remark: scheduledRemark,
        repeatType: normalizedRepeatType,
        actionType,
        targetAccountId,
        actionPayload,
        startAt: entryTimestamp,
      });
      showToast('Schedule saved successfully', 'success');
      navigation.goBack();
    };

    if (action === 'add') {
      try {
        if (shouldSchedule) {
          await saveScheduledAction({
            actionType: 'add',
            scheduledAmount: parsedAmount,
            actionPayload: {
              note: noteText,
            },
          });
          return;
        }

        await createTransaction(
          account.id,
          parsedAmount,
          noteText,
          entryTimestamp
        );
        showToast('Amount added successfully', 'success');
        emitDashboardDataChanged('amount-entry:add');
        navigation.goBack();
      } catch (error) {
        console.error('Failed to add amount:', error);
        showToast('Failed to add amount. Please try again.', 'error');
      }
      return;
    }

    if (
      strictEcoEnabled &&
      (action === 'withdraw' || action === 'transfer') &&
      !isSourceWithdrawViaExpensesFlow &&
      !isCreditAccount
    ) {
      const accountEntries = getTransactionsByAccount(account.id);
      const balanceAtTimestamp = getBalanceAtTimestampWithEntries(
        accountEntries,
        entryTimestamp
      );
      const freshAccount = getAllAccounts().find(
        acc => String(acc.id) === String(account.id)
      );
      const autoFundEnabled =
        action === 'withdraw' &&
        isExpenseAccount &&
        Number((freshAccount || account)?.auto_fund_primary) === 1;
      const needsAutoFund = autoFundEnabled && parsedAmount > balanceAtTimestamp;
      const shortfall = needsAutoFund
        ? Math.max(0, parsedAmount - balanceAtTimestamp)
        : 0;
      const pendingEntries = needsAutoFund
        ? [
            {
              id: 'pending-auto-fund',
              amount: shortfall,
              transaction_date: entryTimestamp,
              is_deleted: 0,
              orderIndex: 0,
            },
            {
              id: 'pending-entry',
              amount: -Math.abs(parsedAmount),
              transaction_date: entryTimestamp,
              is_deleted: 0,
              orderIndex: 1,
            },
          ]
        : [
            {
              id: 'pending-entry',
              amount: -Math.abs(parsedAmount),
              transaction_date: entryTimestamp,
              is_deleted: 0,
              orderIndex: 1,
            },
          ];
      if (
        !canWithdrawAtTimestampWithEntries(
          Math.abs(parsedAmount),
          entryTimestamp,
          accountEntries,
          pendingEntries
        )
      ) {
        if (action === 'withdraw' && isExpenseAccount && !autoFundEnabled) {
          openLowBalancePrompt();
          return;
        }
        const actionLabel = action === 'transfer' ? 'Transfer' : 'Withdrawal';
        showToast(
          `${actionLabel} not allowed. Balance was insufficient at that time.`,
          'error'
        );
        return;
      }
      if (!needsAutoFund) {
        const balance = calculateAccountBalance(account.id);
        if (parsedAmount > balance) {
          if (action === 'withdraw' && isExpenseAccount && !autoFundEnabled) {
            openLowBalancePrompt();
            return;
          }
          showToast('Balance is low. Add amount first to withdraw.', 'error');
          return;
        }
      }
    }

    if (action === 'withdraw' || action === 'credit') {
      try {
        let withdrawAccount = account;
        if (isSourceWithdrawViaExpensesFlow) {
          const accounts = getAllAccounts();
          withdrawAccount =
            accounts.find(acc => String(acc.id) === String(transferTargetId)) ||
            null;
          if (!withdrawAccount || withdrawAccount.account_type !== 'expenses') {
            showToast('Please select a valid expenses account.', 'error');
            return;
          }
        }

        let receiptPath = '';
        if (showWithdrawCamera && withdrawReceiptUri) {
          try {
            receiptPath = await persistReceiptImage(withdrawReceiptUri);
          } catch (error) {
            console.error('Failed to save receipt image:', error);
            showToast('Failed to save bill photo.', 'error');
            return;
          }
        }

        if (shouldSchedule) {
          let logRemark = null;
          if (isSourceWithdrawViaExpensesFlow) {
            logRemark = buildSourceWithdrawLogRemark(
              parsedAmount,
              withdrawAccount,
              noteText
            );
          }

          await saveScheduledAction({
            actionType: 'withdraw',
            scheduledAmount: Math.abs(parsedAmount),
            scheduledRemark: noteText,
            targetAccountId:
              withdrawAccount.id !== account.id ? withdrawAccount.id : null,
            actionPayload: {
              note: noteText,
              imageUri: receiptPath,
              targetAccountId:
                withdrawAccount.id !== account.id ? withdrawAccount.id : null,
              isEarningWithdrawViaExpensesFlow,
              isCreditWithdrawViaExpensesFlow,
              logRemark,
            },
          });
          return;
        }

        if ((isCreditWithdrawViaExpensesFlow || (isCreditMode && isCreditAccount)) && account?.id) {
          const creditDebitAllowed = await canDebitCreditAccount(account, parsedAmount);
          if (!creditDebitAllowed) {
            return;
          }
        }

        if (
          strictEcoEnabled &&
          withdrawAccount.account_type !== 'credit' &&
          !isCreditWithdrawViaExpensesFlow
        ) {
          const accountEntries = getTransactionsByAccount(withdrawAccount.id);
          const balanceAtTimestamp = getBalanceAtTimestampWithEntries(
            accountEntries,
            entryTimestamp
          );
          const freshAccount = getAllAccounts().find(
            acc => String(acc.id) === String(withdrawAccount.id)
          );
          const autoFundEnabled =
            withdrawAccount.account_type === 'expenses' &&
            Number((freshAccount || withdrawAccount)?.auto_fund_primary) === 1;
          const needsAutoFund =
            autoFundEnabled && parsedAmount > balanceAtTimestamp;
          const shortfall = needsAutoFund
            ? Math.max(0, parsedAmount - balanceAtTimestamp)
            : 0;
          const pendingEntries = needsAutoFund
            ? [
                {
                  id: 'pending-auto-fund',
                  amount: shortfall,
                  transaction_date: entryTimestamp,
                  is_deleted: 0,
                  orderIndex: 0,
                },
                {
                  id: 'pending-entry',
                  amount: -Math.abs(parsedAmount),
                  transaction_date: entryTimestamp,
                  is_deleted: 0,
                  orderIndex: 1,
                },
              ]
            : [
                {
                  id: 'pending-entry',
                  amount: -Math.abs(parsedAmount),
                  transaction_date: entryTimestamp,
                  is_deleted: 0,
                  orderIndex: 1,
                },
              ];
          if (
            !canWithdrawAtTimestampWithEntries(
              Math.abs(parsedAmount),
              entryTimestamp,
              accountEntries,
              pendingEntries
            )
          ) {
            if (
              withdrawAccount.account_type === 'expenses' &&
              !autoFundEnabled
            ) {
              openLowBalancePrompt(withdrawAccount);
              return;
            }
            showToast(
              'Withdrawal not allowed. Balance was insufficient at that time.',
              'error'
            );
            return;
          }
          if (!needsAutoFund) {
            const balance = calculateAccountBalance(withdrawAccount.id);
            if (parsedAmount > balance) {
              if (
                withdrawAccount.account_type === 'expenses' &&
                !autoFundEnabled
              ) {
                openLowBalancePrompt(withdrawAccount);
                return;
              }
              showToast('Balance is low. Add amount first to withdraw.', 'error');
              return;
            }
          }
          if (needsAutoFund) {
            const autoFunded = await requestFromPrimaryEarning(
              shortfall,
              withdrawAccount,
              {mode: 'transfer'}
            );
            if (!autoFunded) {
              return;
            }
          }
        }
        if (isCreditWithdrawViaExpensesFlow) {
          const transferOutRemark = noteText
            ? `Transferred to ${withdrawAccount.account_name} - ${noteText}`
            : `Transferred to ${withdrawAccount.account_name}`;
          const transferInRemark = noteText
            ? `Transferred from ${account.account_name} - ${noteText}`
            : `Transferred from ${account.account_name}`;
          await createTransaction(
            account.id,
            -Math.abs(parsedAmount),
            transferOutRemark,
            entryTimestamp
          );
          await createTransaction(
            withdrawAccount.id,
            Math.abs(parsedAmount),
            transferInRemark,
            entryTimestamp
          );
        }

        await createTransaction(
          withdrawAccount.id,
          -Math.abs(parsedAmount),
          noteText,
          entryTimestamp,
          receiptPath
        );
        if (isSourceWithdrawViaExpensesFlow) {
          const logRemark = buildSourceWithdrawLogRemark(
            parsedAmount,
            withdrawAccount,
            noteText
          );
          await createTransaction(
            account.id,
            0,
            logRemark,
            entryTimestamp,
            null,
            isCreditWithdrawViaExpensesFlow
              ? 'credit_withdraw_log'
              : 'earning_withdraw_log'
          );
          try {
            await AsyncStorage.setItem(
              LAST_TRANSFER_ACCOUNT_KEY,
              String(withdrawAccount.id)
            );
          } catch (error) {
            console.warn('Failed to store last withdraw account:', error);
          }
          showToast(
            `Withdrawal recorded in ${withdrawAccount.account_name}.`,
            'success'
          );
        } else {
          showToast(
            action === 'credit'
              ? 'Credit recorded successfully'
              : 'Withdrawal recorded successfully',
            'success'
          );
        }
        setWithdrawReceiptUri('');
        emitDashboardDataChanged(
          action === 'credit' ? 'amount-entry:credit' : 'amount-entry:withdraw'
        );
        navigation.goBack();
      } catch (error) {
        if (showTransactionLimitError(error)) {
          return;
        }
        console.error('Failed to add debit entry:', error);
        showToast(
          action === 'credit'
            ? 'Failed to record credit. Please try again.'
            : 'Failed to add withdrawal. Please try again.',
          'error'
        );
      }
      return;
    }

    if (action === 'request' || action === 'payBill') {
      try {
        const accounts = getAllAccounts();
        const targetAccount = accounts.find(
          acc => String(acc.id) === String(transferTargetId)
        );
        if (!targetAccount || targetAccount.account_type !== 'earning') {
          showToast('Please select a valid earning account.', 'error');
          return;
        }
        const trimmedNote = noteText.trim();
        const isPayBillAction = action === 'payBill';
        const fromRemark = isPayBillAction
          ? trimmedNote
            ? `Paid bill to ${account.account_name} - ${trimmedNote}`
            : `Paid bill to ${account.account_name}`
          : trimmedNote
            ? `Requested by ${account.account_name} - ${trimmedNote}`
            : `Requested by ${account.account_name}`;
        const toRemark = isPayBillAction
          ? trimmedNote
            ? `Paid bill from ${targetAccount.account_name} - ${trimmedNote}`
            : `Paid bill from ${targetAccount.account_name}`
          : trimmedNote
            ? `Requested from ${targetAccount.account_name} - ${trimmedNote}`
            : `Requested from ${targetAccount.account_name}`;

        if (shouldSchedule) {
          await saveScheduledAction({
            actionType: 'request',
            scheduledAmount: Math.abs(parsedAmount),
            scheduledRemark: noteText,
            targetAccountId: targetAccount.id,
            actionPayload: {
              note: noteText,
              targetAccountId: targetAccount.id,
              requestKind: isPayBillAction ? 'payBill' : 'request',
            },
          });
          return;
        }
        const entryTimestamp = entryDate?.getTime?.() ?? Date.now();
        if (strictEcoEnabled) {
          const earningEntries = getTransactionsByAccount(targetAccount.id);
          const earningPending = [
            {
              id: 'pending-earning-request',
              amount: -Math.abs(parsedAmount),
              transaction_date: entryTimestamp,
              is_deleted: 0,
              orderIndex: 1,
            },
          ];
          if (
            !canWithdrawAtTimestampWithEntries(
              Math.abs(parsedAmount),
              entryTimestamp,
              earningEntries,
              earningPending
            )
          ) {
            showToast(
              `Request not allowed. ${targetAccount.account_name} had insufficient balance at that time.`,
              'error'
            );
            return;
          }
          const earningBalance = calculateAccountBalance(targetAccount.id);
          if (earningBalance < Math.abs(parsedAmount)) {
            showToast(`Low balance on ${targetAccount.account_name}.`, 'error');
            return;
          }
        }
        await createTransaction(
          targetAccount.id,
          -Math.abs(parsedAmount),
          fromRemark,
          entryTimestamp,
          null,
          isPayBillAction ? 'pay_bill' : null
        );
        await createTransaction(
          account.id,
          Math.abs(parsedAmount),
          toRemark,
          entryTimestamp,
          null,
          isPayBillAction ? 'pay_bill' : null
        );
        showToast(
          isPayBillAction
            ? `Bill paid from ${targetAccount.account_name}.`
            : `Amount requested from ${targetAccount.account_name}.`,
          'success'
        );
        emitDashboardDataChanged(
          isPayBillAction ? 'amount-entry:pay-bill' : 'amount-entry:request'
        );
        navigation.goBack();
      } catch (error) {
        console.error('Failed to request amount:', error);
        showToast(
          action === 'payBill'
            ? 'Failed to pay bill. Please try again.'
            : 'Failed to request amount. Please try again.',
          'error'
        );
      }
      return;
    }

    if (action === 'transfer') {
      try {
        const accounts = getAllAccounts();
        const targetAccount = accounts.find(acc => acc.id === transferTargetId);
        if (!targetAccount) {
          showToast('Please select a valid transfer account.', 'error');
          return;
        }
        const toRemark = noteText
          ? `Transferred to ${targetAccount.account_name} - ${noteText}`
          : `Transferred to ${targetAccount.account_name}`;
        const fromRemark = noteText
          ? `Transferred from ${account.account_name} - ${noteText}`
          : `Transferred from ${account.account_name}`;
        if (isCreditAccount && account?.id) {
          const creditDebitAllowed = await canDebitCreditAccount(account, parsedAmount);
          if (!creditDebitAllowed) {
            return;
          }
        }
        if (shouldSchedule) {
          await saveScheduledAction({
            actionType: 'transfer',
            scheduledAmount: Math.abs(parsedAmount),
            scheduledRemark: noteText,
            targetAccountId: targetAccount.id,
            actionPayload: {
              note: noteText,
              targetAccountId: targetAccount.id,
            },
          });
          return;
        }
        await createTransaction(
          account.id,
          -Math.abs(parsedAmount),
          toRemark,
          entryTimestamp
        );
        await createTransaction(
          targetAccount.id,
          Math.abs(parsedAmount),
          fromRemark,
          entryTimestamp
        );
        try {
          await AsyncStorage.setItem(
            LAST_TRANSFER_ACCOUNT_KEY,
            String(targetAccount.id)
          );
        } catch (error) {
          console.warn('Failed to store last transfer account:', error);
        }
        showToast('Transfer completed successfully', 'success');
        emitDashboardDataChanged('amount-entry:transfer');
        navigation.goBack();
      } catch (error) {
        if (showTransactionLimitError(error)) {
          return;
        }
        console.error('Failed to transfer:', error);
        showToast('Failed to transfer. Please try again.', 'error');
      }
    }
  };

  const focusAmountInput = () => {
    if (isEffectiveCalculatorMode) {
      Keyboard.dismiss();
      return;
    }
    amountInputRef.current?.focus();
  };

  const focusNoteInput = () => {
    noteInputRef.current?.focus();
  };

  const handleNoteContentSizeChange = useCallback(event => {
    const contentHeight = event?.nativeEvent?.contentSize?.height || 0;
    const nextHeight = Math.min(
      Math.max(contentHeight, NOTE_INPUT_SINGLE_LINE_HEIGHT),
      NOTE_INPUT_DOUBLE_LINE_HEIGHT,
    );
    setNoteInputHeight(current =>
      Math.abs(current - nextHeight) < 1 ? current : nextHeight,
    );
  }, []);

  const applyCalculatorExpression = useCallback(nextExpression => {
    const sanitized = String(nextExpression || '');
    setCalculatorExpression(sanitized);

    if (!sanitized) {
      setCalculatorPreview('');
      setAmount('');
      return;
    }

    const evaluation = evaluateAmountExpression(sanitized);
    if (evaluation.ok) {
      const formatted = formatAmountValue(evaluation.value);
      setCalculatorPreview(formatted);
      setAmount(formatted);
      return;
    }

    setCalculatorPreview('');
    setAmount('');
  }, []);

  const calculatorExpressionRef = useRef(calculatorExpression);
  useEffect(() => {
    calculatorExpressionRef.current = calculatorExpression;
  }, [calculatorExpression]);

  const handleAmountChange = useCallback(
    text => {
      if (isEffectiveCalculatorMode) {
        return;
      }
      setAmount(text);
    },
    [isEffectiveCalculatorMode],
  );

  const handleCalculatorKeyPress = useCallback(
    key => {
      if (!isEffectiveCalculatorMode) {
        return;
      }

      const currentExpression = calculatorExpressionRef.current || '';

      if (key === 'C') {
        setCalculatorExpression('');
        setCalculatorPreview('');
        setAmount('');
        return;
      }

      if (key === 'DEL') {
        applyCalculatorExpression(currentExpression.slice(0, -1));
        return;
      }

      if (key === '=') {
        if (!currentExpression) {
          showToast('Please enter a valid amount.', 'error');
          return;
        }

        const evaluation = evaluateAmountExpression(currentExpression);
        if (!evaluation.ok) {
          showToast('Invalid calculation.', 'error');
          return;
        }

        const formatted = formatAmountValue(evaluation.value);
        setCalculatorExpression(formatted);
        setCalculatorPreview(formatted);
        setAmount(formatted);
        return;
      }

      const isOperator = CALCULATOR_OPERATOR_RE.test(key);
      const lastChar = currentExpression.slice(-1);
      const lastIsOperator = CALCULATOR_OPERATOR_RE.test(lastChar);
      let nextExpression = currentExpression;

      if (isOperator) {
        if (!nextExpression) {
          return;
        }
        if (lastIsOperator) {
          nextExpression = `${nextExpression.slice(0, -1)}${key}`;
        } else {
          nextExpression = `${nextExpression}${key}`;
        }
      } else if (key === '.') {
        const tail = nextExpression.split(/[+\-*/]/).pop() || '';
        if (tail.includes('.')) {
          return;
        }
        nextExpression = `${nextExpression}${key}`;
      } else {
        nextExpression = `${nextExpression}${key}`;
      }

      applyCalculatorExpression(nextExpression);
    },
    [applyCalculatorExpression, isEffectiveCalculatorMode, showToast],
  );

  const now = new Date();
  now.setSeconds(0, 0);
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();

  const dateOptions = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 365);
    const totalDays = 730;
    const items = [];
    for (let i = 0; i <= totalDays; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      items.push(d);
    }
    return items;
  }, []);

  const isSameDate = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isSameTime = (date, hour, minute) =>
    date.getHours() === hour && date.getMinutes() === minute;

  const formatDateDisplay = value => {
    const day = String(value.getDate()).padStart(2, '0');
    const month = value.toLocaleDateString([], {month: 'short'});
    return `${day} ${month}`;
  };

  const formatTimeDisplay = value => {
    const hours = value.getHours();
    const minutes = value.getMinutes();
    const suffix = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`;
  };

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const clampToNow = value => {
    if (!value) {
      return value;
    }
    const base = new Date(value);
    const minute = base.getMinutes();
    base.setMinutes(minute - (minute % 5), 0, 0);
    return base;
  };

  const pickerValue = draftEntryDate ?? entryDate;
  const hourOptions = useMemo(() => {
    const items = [];
    for (let hour = 0; hour <= 23; hour += 1) {
      const label = String(hour).padStart(2, '0');
      items.push({hour, label});
    }
    return items;
  }, []);

  const minuteOptions = useMemo(() => {
    const items = [];
    for (let minute = 0; minute <= 59; minute += 5) {
      const label = String(minute).padStart(2, '0');
      items.push({minute, label});
    }
    return items;
  }, []);

  const findDateIndex = useCallback(
    target =>
      dateOptions.findIndex(option => isSameDate(option, target)),
    [dateOptions],
  );

  const findHourIndex = useCallback(
    hour => hourOptions.findIndex(option => option.hour === hour),
    [hourOptions],
  );

  const findMinuteIndex = useCallback(
    minute => minuteOptions.findIndex(option => option.minute === minute),
    [minuteOptions],
  );

  const scrollToIndexSafe = (ref, index) => {
    if (!ref?.current || index < 0) {
      return;
    }
    try {
      ref.current.scrollToIndex({index, animated: false});
    } catch {
      // ignore scroll errors for short lists
    }
  };

  const openTransferPopup = () => {
    setAttachPanelVisible(false);
    Keyboard.dismiss();
    if (!selectedTransferAccount && transferAccounts.length > 0) {
      setSelectedTransferAccount(transferAccounts[0]);
      setTransferTargetId(transferAccounts[0].id);
    }
    setTransferListExpanded(false);
    setTransferPopupVisible(true);
  };

  const closeTransferPopup = () => setTransferPopupVisible(false);

  const openSchedulePopup = () => {
    setAttachPanelVisible(false);
    setDraftEntryDate(clampToNow(new Date(entryDate)));
    setDraftRepeatType(repeatType);
    setRepeatMenuVisible(false);
    setSchedulePopupVisible(true);
    InteractionManager.runAfterInteractions(() => {
      const base = clampToNow(new Date(entryDate));
      scrollToIndexSafe(dateListRef, findDateIndex(base));
      scrollToIndexSafe(hourListRef, findHourIndex(base.getHours()));
      scrollToIndexSafe(minuteListRef, findMinuteIndex(base.getMinutes()));
    });
  };
  const closeSchedulePopup = () => {
    setSchedulePopupVisible(false);
    setRepeatMenuVisible(false);
  };

  const applyDateSelection = selectedDate => {
    const base = draftEntryDate ? new Date(draftEntryDate) : new Date(entryDate);
    const updated = new Date(base);
    updated.setFullYear(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    );
    setDraftEntryDate(clampToNow(updated));
  };

  const applyTimeSelection = (hour, minute) => {
    const base = draftEntryDate ? new Date(draftEntryDate) : new Date(entryDate);
    const updated = new Date(base);
    updated.setHours(hour, minute, 0, 0);
    setDraftEntryDate(clampToNow(updated));
  };

  const updateDraftDate = nextDate => {
    setDraftEntryDate(clampToNow(nextDate));
  };

  const handleDateScrollEnd = event => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const next = dateOptions[index];
    if (!next) {
      return;
    }
    const base = draftEntryDate ? new Date(draftEntryDate) : new Date(entryDate);
    base.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
    updateDraftDate(base);
  };

  const handleHourScrollEnd = event => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const option = hourOptions[index];
    if (!option) {
      return;
    }
    applyTimeSelection(option.hour, pickerValue.getMinutes());
  };

  const handleMinuteScrollEnd = event => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const option = minuteOptions[index];
    if (!option) {
      return;
    }
    applyTimeSelection(pickerValue.getHours(), option.minute);
  };

  const handleDateScroll = event => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (index === lastDateIndexRef.current) {
      return;
    }
    lastDateIndexRef.current = index;
    const next = dateOptions[index];
    if (!next) {
      return;
    }
    const base = draftEntryDate ? new Date(draftEntryDate) : new Date(entryDate);
    base.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
    updateDraftDate(base);
  };

  const handleHourScroll = event => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (index === lastHourIndexRef.current) {
      return;
    }
    lastHourIndexRef.current = index;
    const option = hourOptions[index];
    if (!option) {
      return;
    }
    applyTimeSelection(option.hour, pickerValue.getMinutes());
  };

  const handleMinuteScroll = event => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (index === lastMinuteIndexRef.current) {
      return;
    }
    lastMinuteIndexRef.current = index;
    const option = minuteOptions[index];
    if (!option) {
      return;
    }
    applyTimeSelection(pickerValue.getHours(), option.minute);
  };

  const guardTransferOpen = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid amount.', 'error');
      return false;
    }
    if (isSourceWithdrawViaExpensesFlow && transferAccounts.length === 0) {
      showToast('No expenses account available.', 'error');
      return false;
    }
    return true;
  };

  const handleScheduleDone = () => {
    if (draftEntryDate) {
      setEntryDate(clampToNow(new Date(draftEntryDate)));
    }
    setRepeatType(draftRepeatType);
    setScheduleApplied(true);
    setSchedulePopupVisible(false);
    setRepeatMenuVisible(false);
  };

  const scheduleCtaLabel = scheduleApplied
    ? `${formatDateDisplay(entryDate)} ${formatTimeDisplay(entryDate)}`
    : 'Schedule';

  const scheduleDoneLabel = `Set at ${formatDateDisplay(pickerValue)} ${formatTimeDisplay(
    pickerValue,
  )}`;

  const transferPopupTitleText = isPayBillMode
    ? 'Select earning account to pay bill from'
    : isRequestMode
    ? 'Select account to request from'
    : isSourceWithdrawViaExpensesFlow
    ? 'Select expenses account'
    : 'Select account to transfer from';

  const transferPopupCtaLabel = isPayBillMode
    ? amount
      ? `Paid Bill ${currencySymbol}${amount}`
      : 'Paid Bill'
    : isRequestMode
    ? amount
      ? `Request ${currencySymbol}${amount}`
      : 'Request'
    : isSourceWithdrawViaExpensesFlow
    ? amount
      ? `Withdraw ${currencySymbol}${amount}`
      : 'Withdraw'
    : amount
    ? `Transfer ${currencySymbol}${amount}`
    : 'Transfer';

  const transferActionLabel = isPayBillMode
    ? 'Paid Bill'
    : isRequestMode
    ? (isSavingAccount ? 'Add Savings' : (isExpenseAccount ? 'Add Budget' : 'Request'))
    : transferSelected
    ? 'Transfer Now'
    : 'Transfer';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={undefined}
      keyboardVerticalOffset={0}>
      <Pressable style={styles.screen} onPress={handleScreenPress} pointerEvents="box-none">
        <View style={styles.container}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerSpacer} />
            </View>

            <View style={[styles.centerArea, {paddingTop: centerAreaTopPadding}]}>
          {targetInfo && (
            <View style={styles.targetInfoCard}>
              <View style={styles.targetInfoIconWrap}>
                {targetInfo.type === 'account'
                  ? renderAccountIcon(
                      account?.icon || 'wallet',
                      30,
                      account?.icon_color || colors.text.primary,
                    )
                  : (
                    <Icon name="person-circle-outline" size={34} color="#1D4ED8" />
                  )}
              </View>
              <View style={styles.targetInfoTextWrap}>
                <Text style={styles.targetInfoTitle} numberOfLines={1}>
                  {targetInfo.title}
                </Text>
                {!!targetInfo.subtitle && (
                  <Text style={styles.targetInfoSubtitle} numberOfLines={1}>
                    {targetInfo.subtitle}
                  </Text>
                )}
              </View>
            </View>
          )}
          <Pressable style={styles.tapZone} onPress={focusAmountInput}>
            <View style={styles.amountBlock}>
              <Text style={styles.currencySymbol}>{currencySymbol}</Text>
              <TextInput
                ref={amountInputRef}
                style={styles.amountInput}
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#C0C4CC"
                showSoftInputOnFocus={!isEffectiveCalculatorMode}
                editable={!isEffectiveCalculatorMode}
                caretHidden={isEffectiveCalculatorMode}
                />
            </View>
          </Pressable>
          <Pressable style={styles.noteField} onPress={focusNoteInput}>
            <TextInput
              ref={noteInputRef}
              style={[styles.noteInput, {height: noteInputHeight}]}
              value={note}
              onChangeText={setNote}
              onContentSizeChange={handleNoteContentSizeChange}
              placeholder="Add note"
              placeholderTextColor={colors.text.light}
              multiline
              numberOfLines={2}
              scrollEnabled
            />
          </Pressable>
          <View style={styles.centerScheduleBlock}>
            <TouchableOpacity
              style={styles.scheduleCta}
              onPress={openSchedulePopup}
              activeOpacity={0.9}>
              <Text style={styles.scheduleCtaText}>{scheduleCtaLabel}</Text>
            </TouchableOpacity>
          </View>
            </View>

          </ScrollView>

          {isEffectiveCalculatorMode && (
            <View style={styles.bottomCalculatorArea}>
              <View style={styles.calculatorWrapper}>
                <AmountCalculatorPad
                  expression={calculatorExpression}
                  preview={calculatorPreview}
                  onKeyPress={handleCalculatorKeyPress}
                />
              </View>
            </View>
          )}

          <View
            style={[
              styles.bottomArea,
              {paddingBottom: spacing.lg + insets.bottom},
            ]}
>
          {isLedgerFlow ? (
            <CTAButton
              label={ledgerAction === 'paid' ? 'Paid' : 'Get'}
              kind="add"
              iconName="checkmark"
              compact
              style={[styles.singleActionButton, styles.ctaFullWidth]}
              textStyle={styles.addText}
              onPress={() => handleSubmit('add')}
            />
          ) : isWithdrawMode || isCreditMode ? (
            <>
              {showWithdrawCamera && !!withdrawReceiptUri && (
                <View style={styles.attachmentHintRow}>
                  <Text style={styles.attachmentHintText}>Bill attached</Text>
                  <TouchableOpacity
                    style={styles.attachmentRemoveButton}
                    onPress={() => setWithdrawReceiptUri('')}>
                    <Icon name="close" size={14} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              )}
              {showWithdrawCamera && attachPanelVisible && (
                <View style={styles.attachInlineWrap}>
                  <View style={styles.attachInlinePanel}>
                    <TouchableOpacity
                      style={styles.attachInlineOption}
                      activeOpacity={0.85}
                      onPress={() => handleAttachSourceSelect('camera')}>
                      <View style={[styles.attachInlineIconWrap, styles.attachInlineCameraBg]}>
                        <Icon name="camera-outline" size={20} color="#0B57D0" />
                      </View>
                      <Text style={styles.attachInlineText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.attachInlineOption}
                      activeOpacity={0.85}
                      onPress={() => handleAttachSourceSelect('gallery')}>
                      <View style={[styles.attachInlineIconWrap, styles.attachInlineGalleryBg]}>
                        <Icon name="images-outline" size={20} color="#0A7A43" />
                      </View>
                      <Text style={styles.attachInlineText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.actionRow}>
                {!transferOnly && (
                  <View style={styles.withdrawMainActionWrap}>
                    <CTAButton
                      label={isCreditMode ? 'Credit' : 'Withdraw'}
                      kind={isCreditMode ? 'transfer' : 'withdraw'}
                      compact
                      style={styles.actionButton}
                      textStyle={isCreditMode ? styles.transferText : styles.withdrawText}
                      onPress={() => {
                        if (isSourceWithdrawViaExpensesFlow) {
                          if (!guardTransferOpen()) {
                            return;
                          }
                          openTransferPopup();
                          return;
                        }
                        handleSubmit(isCreditMode ? 'credit' : 'withdraw');
                      }}
                    />
                    <TouchableOpacity
                      style={styles.withdrawCameraButton}
                      onPress={openWithdrawCameraOptions}>
                      <Icon name="camera-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                )}
                {canShowTransferAction && (
                  <CTAButton
                    label={transferActionLabel}
                    kind={
                      isRequestLikeMode && (isSavingAccount || isExpenseAccount || isCreditAccount)
                        ? 'add'
                        : 'transfer'
                    }
                    compact
                    style={styles.actionButton}
                    textStyle={
                      isPayBillMode
                        ? styles.addText
                        : isRequestMode && isSavingAccount
                        ? styles.addText
                        : isRequestMode && isExpenseAccount
                        ? styles.expenseText
                        : styles.transferText
                    }
                    onPress={() => {
                      if (!guardTransferOpen()) {
                        return;
                      }
                      if (!transferSelected) {
                        setTransferSelected(true);
                        openTransferPopup();
                        return;
                      }
                      openTransferPopup();
                    }}
                  />
                )}
              </View>
            </>
          ) : isRequestLikeMode ? (
            <View style={styles.actionRow}>
              <CTAButton
                label={transferActionLabel}
                kind={
                  isRequestLikeMode && (isSavingAccount || isExpenseAccount || isCreditAccount)
                    ? 'add'
                    : 'transfer'
                }
                compact
                style={styles.actionButton}
                textStyle={
                  isPayBillMode
                    ? styles.addText
                    : isRequestMode && isSavingAccount
                    ? styles.addText
                    : isRequestMode && isExpenseAccount
                    ? styles.expenseText
                    : styles.transferText
                }
                onPress={() => {
                  if (!guardTransferOpen()) {
                    return;
                  }
                  openTransferPopup();
                }}
              />
            </View>
          ) : (
            <CTAButton
              label="Add Amount"
              kind="add"
              compact
              style={[styles.singleActionButton, styles.ctaFullWidth]}
              onPress={() => handleSubmit('add')}
            />
          )}
          </View>

          {transferPopupVisible && (
          <View style={styles.transferOverlay}>
            <Pressable style={styles.transferBackdrop} onPress={closeTransferPopup} />
            <View style={styles.transferSheet}>
              <View style={styles.transferSheetHeader}>
                <TouchableOpacity
                  onPress={closeTransferPopup}
                  style={styles.transferSheetClose}>
                  <Icon name="arrow-back" size={22} color={colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.transferSheetTitle}>{transferPopupTitleText}</Text>
              </View>

              <TouchableOpacity
                style={styles.transferSelectedRow}
                activeOpacity={0.85}
                onPress={() => setTransferListExpanded(prev => !prev)}>
                <View
                  style={[
                    styles.transferAccountIconWrap,
                    {
                      backgroundColor:
                        selectedTransferAccount?.icon_color || colors.secondary,
                    },
                  ]}>
                  {renderAccountIcon(
                    selectedTransferAccount?.icon || 'wallet',
                    22,
                    selectedTransferAccount?.icon_color ? colors.white : colors.text.primary
                  )}
                </View>
                <View style={styles.transferAccountText}>
                  <Text style={styles.transferAccountName}>
                    {selectedTransferAccount?.account_name || 'Select account'}
                  </Text>
                  <Text style={styles.transferAccountSub}>
                    {selectedTransferAccount
                      ? getAccountTypeLabel(selectedTransferAccount.account_type)
                      : 'Tap to choose account'}
                  </Text>
                </View>
                <Icon
                  name={transferListExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>

              {transferListExpanded && (
                <View style={styles.transferListBox}>
                  <FlatList
                    data={transferAccounts}
                    keyExtractor={item => String(item.id)}
                    showsVerticalScrollIndicator={false}
                    renderItem={({item}) => {
                      const selected = selectedTransferAccount?.id === item.id;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.transferListRow,
                            selected && styles.transferListRowSelected,
                          ]}
                          onPress={() => {
                            setSelectedTransferAccount(item);
                            setTransferTargetId(item.id);
                            setTransferListExpanded(false);
                          }}>
                          <View
                            style={[
                              styles.transferAccountIconWrap,
                              {backgroundColor: item.icon_color || colors.secondary},
                            ]}>
                            {renderAccountIcon(
                              item.icon || 'wallet',
                              20,
                              item.icon_color ? colors.white : colors.text.primary
                            )}
                          </View>
                          <View style={styles.transferAccountText}>
                            <Text style={styles.transferAccountName}>{item.account_name}</Text>
                            <Text style={styles.transferAccountSub}>
                              {getAccountTypeLabel(item.account_type)}
                            </Text>
                          </View>
                          {selected && (
                            <View style={styles.transferSelectedTick}>
                              <Icon name="checkmark" size={14} color="#FFFFFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              )}

              <TouchableOpacity
                style={styles.transferPrimaryButton}
                activeOpacity={0.85}
                disabled={!selectedTransferAccount}
                onPress={() => {
                  if (!selectedTransferAccount) {
                    showToast('Please select an account.', 'error');
                    return;
                  }
                  setTransferTargetId(selectedTransferAccount.id);
                  closeTransferPopup();
                  handleSubmit(
                    isPayBillMode
                      ? 'payBill'
                      : isRequestMode
                      ? 'request'
                      : isSourceWithdrawViaExpensesFlow
                      ? 'withdraw'
                      : 'transfer'
                  );
                }}>
                <Text style={styles.transferPrimaryButtonText}>
                  {transferPopupCtaLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

          {schedulePopupVisible && (
          <View style={styles.scheduleOverlay}>
            <Pressable style={styles.scheduleBackdrop} onPress={closeSchedulePopup} />
            <View style={[styles.schedulePanel, {marginBottom: Math.max(insets.bottom, spacing.sm) + 40}]}>
              <View style={styles.scheduleHeader}>
                <TouchableOpacity
                  onPress={closeSchedulePopup}
                  style={styles.scheduleCloseButton}>
                  <Icon name="close" size={20} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

                <View style={styles.schedulePickerBox}>
                <View style={styles.schedulePickerSelectionBarTop} />
                <View style={styles.schedulePickerSelectionBarBottom} />
                <View style={styles.schedulePickerColumn}>
                  <FlatList
                    ref={dateListRef}
                    data={dateOptions}
                    keyExtractor={item => item.toISOString()}
                    style={styles.schedulePickerList}
                    contentContainerStyle={styles.schedulePickerListContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={24}
                    maxToRenderPerBatch={24}
                    windowSize={7}
                    removeClippedSubviews
                    getItemLayout={(_, index) => ({
                      length: ITEM_HEIGHT,
                      offset: ITEM_HEIGHT * index,
                      index,
                    })}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleDateScrollEnd}
                    onScrollEndDrag={handleDateScrollEnd}
                    onScroll={handleDateScroll}
                    scrollEventThrottle={16}
                    renderItem={({item: optionDate}) => {
                      const selected = isSameDate(pickerValue, optionDate);
                      return (
                        <Pressable
                          style={[
                            styles.inlinePickerItem,
                            selected && styles.inlinePickerItemSelected,
                          ]}
                          onPress={() => applyDateSelection(optionDate)}>
                          <Text
                            style={[
                              styles.inlinePickerItemText,
                              selected && styles.inlinePickerItemTextSelected,
                            ]}>
                            {formatDateDisplay(optionDate)}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                </View>
                <View style={styles.schedulePickerColumn}>
                  <FlatList
                    ref={hourListRef}
                    data={hourOptions}
                    keyExtractor={item => `${item.hour}`}
                    style={styles.schedulePickerList}
                    contentContainerStyle={styles.schedulePickerListContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={24}
                    maxToRenderPerBatch={24}
                    windowSize={7}
                    removeClippedSubviews
                    getItemLayout={(_, index) => ({
                      length: ITEM_HEIGHT,
                      offset: ITEM_HEIGHT * index,
                      index,
                    })}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleHourScrollEnd}
                    onScrollEndDrag={handleHourScrollEnd}
                    onScroll={handleHourScroll}
                    scrollEventThrottle={16}
                    renderItem={({item}) => {
                      const selected = pickerValue.getHours() === item.hour;
                      return (
                        <Pressable
                          style={[
                            styles.inlinePickerItem,
                            selected && styles.inlinePickerItemSelected,
                          ]}
                          onPress={() =>
                            applyTimeSelection(item.hour, pickerValue.getMinutes())
                          }>
                          <Text
                            style={[
                              styles.inlinePickerItemText,
                              selected && styles.inlinePickerItemTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                </View>
                <View style={styles.schedulePickerColumn}>
                  <FlatList
                    ref={minuteListRef}
                    data={minuteOptions}
                    keyExtractor={item => `${item.minute}`}
                    style={styles.schedulePickerList}
                    contentContainerStyle={styles.schedulePickerListContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={24}
                    maxToRenderPerBatch={24}
                    windowSize={7}
                    removeClippedSubviews
                    getItemLayout={(_, index) => ({
                      length: ITEM_HEIGHT,
                      offset: ITEM_HEIGHT * index,
                      index,
                    })}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    onMomentumScrollEnd={handleMinuteScrollEnd}
                    onScrollEndDrag={handleMinuteScrollEnd}
                    onScroll={handleMinuteScroll}
                    scrollEventThrottle={16}
                    renderItem={({item}) => {
                      const selected = pickerValue.getMinutes() === item.minute;
                      return (
                        <Pressable
                          style={[
                            styles.inlinePickerItem,
                            selected && styles.inlinePickerItemSelected,
                          ]}
                          onPress={() =>
                            applyTimeSelection(pickerValue.getHours(), item.minute)
                          }>
                          <Text
                            style={[
                              styles.inlinePickerItemText,
                              selected && styles.inlinePickerItemTextSelected,
                            ]}>
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                </View>
              </View>

              <View style={styles.scheduleControls}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.repeatChip}
                  onPress={() => setRepeatMenuVisible(prev => !prev)}>
                  <Text style={styles.repeatChipText}>{`Repeat: ${draftRepeatType}`}</Text>
                  <Icon
                    name={repeatMenuVisible ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.text.primary}
                  />
                </TouchableOpacity>
              </View>

              <AmountActionButton
                label={scheduleDoneLabel}
                variant="primaryOutline"
                style={styles.scheduleDoneButton}
                textStyle={styles.scheduleDoneText}
                onPress={handleScheduleDone}
              />
            </View>
          </View>
        )}

        <DropdownPopup
          visible={repeatMenuVisible}
          onClose={() => setRepeatMenuVisible(false)}
          cardStyle={styles.repeatPopupCard}
          animationType="fade">
          <View style={styles.repeatMenu}>
            {REPEAT_OPTIONS.map(option => {
              const selected = draftRepeatType === option;
              return (
                <TouchableOpacity
                  key={option}
                  activeOpacity={0.88}
                  style={[
                    styles.repeatMenuItem,
                    selected && styles.repeatMenuItemSelected,
                  ]}
                  onPress={() => {
                    setDraftRepeatType(option);
                    setRepeatMenuVisible(false);
                  }}>
                  <Text
                    style={[
                      styles.repeatMenuItemText,
                      selected && styles.repeatMenuItemTextSelected,
                    ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </DropdownPopup>

        </View>
      </Pressable>
    </KeyboardAvoidingView>
  );
};

const createStyles = colors => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerButton: {
    padding: 6,
  },
  headerTitle: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 34,
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  targetInfoCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  targetInfoIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  targetInfoTextWrap: {
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  targetInfoTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  targetInfoSubtitle: {
    marginTop: 2,
    fontSize: fontSize.medium,
    fontWeight: fontWeight.medium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  tapZone: {
    alignItems: 'center',
  },
  noteField: {
    width: '88%',
    minHeight: 40,
    maxHeight: 58,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  centerScheduleBlock: {
    width: '100%',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  scheduleCta: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  scheduleCtaText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  amountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 28,
    color: '#9CA3AF',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 4,
  },
  calculatorWrapper: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
  },
  bottomCalculatorArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
  bottomArea: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  panel: {
    backgroundColor: colors.modal,
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
    elevation: 8,
    gap: spacing.sm,
  },
  entryDateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  entryDateTimeButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  entryDateTimeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  entryDateTimeLabel: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  entryDateTimeValue: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  inlinePickerList: {
    marginTop: spacing.xs,
    maxHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.modal,
  },
  inlinePickerItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 0,
    borderRadius: 10,
    marginHorizontal: 6,
  },
  inlinePickerItemSelected: {
    backgroundColor: 'transparent',
    transform: [{scale: 1.1}],
  },
  inlinePickerItemText: {
    fontSize: 16,
    color: colors.text.secondary,
    fontWeight: '500',
    textAlign: 'center',
    opacity: 0.4,
  },
  inlinePickerItemTextSelected: {
    color: colors.primary,
    fontWeight: '700',
    opacity: 1,
    fontSize: 18,
  },
  scheduleOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: colors.overlay,
  },
  transferOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: colors.overlay,
  },
  transferBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  scheduleBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  schedulePanel: {
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: colors.modal,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    maxHeight: '62%',
    marginBottom: 0,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.25,
    shadowRadius: 32,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: spacing.xs,
  },
  scheduleCloseButton: {
    padding: 4,
  },
  scheduleControls: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  repeatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  repeatChipText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  repeatMenu: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    minWidth: 220,
  },
  repeatPopupCard: {
    position: 'absolute',
    left: '50%',
    bottom: 210,
    transform: [{translateX: -110}],
  },
  repeatMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  repeatMenuItemSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  repeatMenuItemText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  repeatMenuItemTextSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  schedulePickerBox: {
    position: 'relative',
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    maxHeight: 260,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  schedulePickerSelectionBarTop: {
    position: 'absolute',
    top: '50%',
    left: spacing.xs,
    right: spacing.xs,
    height: 2,
    marginTop: -(ITEM_HEIGHT / 2) - 2,
    backgroundColor: colors.primary,
    borderRadius: 2,
    opacity: 0.7,
  },
  schedulePickerSelectionBarBottom: {
    position: 'absolute',
    top: '50%',
    left: spacing.xs,
    right: spacing.xs,
    height: 2,
    marginTop: (ITEM_HEIGHT / 2) + 8,
    backgroundColor: colors.primary,
    borderRadius: 2,
    opacity: 0.7,
  },
  transferPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.xs,
  },
  transferPopupCloseButton: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  transferPopupPanel: {
    transform: [{translateY: 56}],
  },
  transferPopupTitle: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  transferList: {
    maxHeight: 320,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  transferListContent: {
    paddingVertical: spacing.xs,
  },
  transferListItem: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transferListItemSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  transferListItemText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  transferListItemTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  transferConfirmButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderWidth: 0,
    borderRadius: 20,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  transferConfirmText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  transferSheet: {
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: colors.modal,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    marginBottom: 0,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  transferSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  transferSheetClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  transferSheetTitle: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  transferSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transferAccountIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferAccountText: {
    flex: 1,
  },
  transferAccountName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  transferAccountSub: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  transferListBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 240,
    overflow: 'hidden',
  },
  transferListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transferListRowSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  transferSelectedTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferAddBank: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  transferAddBankText: {
    fontSize: 13,
    color: '#93C5FD',
    fontWeight: '600',
  },
  transferPrimaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  transferPrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  schedulePickerColumn: {
    flex: 1,
    zIndex: 10,
    position: 'relative',
    elevation: 10,
  },
  schedulePickerList: {
    height: LIST_HEIGHT,
  },
  schedulePickerListContent: {
    paddingVertical: LIST_PADDING,
  },
  scheduleDoneButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderWidth: 0,
    borderRadius: 20,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  scheduleDoneText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  transferPickerBlock: {
    gap: 6,
  },
  transferLabel: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  noteInput: {
    flex: 1,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    lineHeight: NOTE_INPUT_LINE_HEIGHT,
    paddingVertical: 0,
    paddingHorizontal: 0,
    textAlign: 'center',
    minHeight: NOTE_INPUT_SINGLE_LINE_HEIGHT,
    maxHeight: NOTE_INPUT_DOUBLE_LINE_HEIGHT,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ctaFullWidth: {
    alignSelf: 'stretch',
  },
  withdrawMainActionWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  withdrawCameraButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  attachmentHintRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: spacing.xs,
    gap: 6,
  },
  attachmentHintText: {
    color: '#991B1B',
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  attachmentRemoveButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
  },
  attachInlineWrap: {
    width: '100%',
    marginBottom: spacing.xs,
    alignItems: 'flex-end',
  },
  attachInlinePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  attachInlineOption: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 78,
    gap: 4,
  },
  attachInlineIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachInlineCameraBg: {
    backgroundColor: '#E8F0FE',
  },
  attachInlineGalleryBg: {
    backgroundColor: '#EAF9F1',
  },
  attachInlineText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  actionButton: {
    flex: 1,
  },
  singleActionButton: {},
  addText: {
    color: '#16A34A',
  },
  withdrawText: {
    color: '#EF4444',
  },
  transferText: {
    color: '#1D4ED8',
  },
  expenseText: {
    color: '#10B981',
  },
});

export default AmountEntryScreen;

