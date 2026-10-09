import {useCallback, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter, InteractionManager} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {getTransactionsByAccountInRange} from '../services/transactionsDatabase';
import {
  applyHistoryTypeFilter,
  buildAccountHistory,
  normalizeMonthStartDay,
  resolveQuickPeriodRange,
} from '../services/transactionHistorySelectors';

const MONTH_START_DAY_KEY = 'monthStartDay';
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';

const resolvePeriodFilter = ({
  quickPeriod,
  customStartDate,
  customEndDate,
  monthStartDay,
}) => {
  if (Number.isFinite(customStartDate) && Number.isFinite(customEndDate)) {
    return {
      startTs: customStartDate,
      endTs: customEndDate,
    };
  }
  return resolveQuickPeriodRange(quickPeriod, monthStartDay);
};

const useTransactionHistoryController = ({
  account,
  initialQuickPeriod = '1month',
  initialShowTransferEntries = false,
  initialCustomStartDate = null,
  initialCustomEndDate = null,
}) => {
  const [quickPeriod, setQuickPeriod] = useState(initialQuickPeriod || '1month');
  const [customStartDate, setCustomStartDate] = useState(
    Number.isFinite(initialCustomStartDate) ? initialCustomStartDate : null,
  );
  const [customEndDate, setCustomEndDate] = useState(
    Number.isFinite(initialCustomEndDate) ? initialCustomEndDate : null,
  );
  const [historyFilterType, setHistoryFilterType] = useState('all');
  const [showTransferEntries, setShowTransferEntries] = useState(
    initialShowTransferEntries === true,
  );
  const [loading, setLoading] = useState(true);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const loadMonthStartDay = async () => {
      try {
        const stored = await AsyncStorage.getItem(MONTH_START_DAY_KEY);
        if (!isMounted) {
          return;
        }
        setMonthStartDay(normalizeMonthStartDay(stored));
      } catch (error) {
        console.error('Failed to load month start day in transaction history:', error);
      }
    };

    loadMonthStartDay();
    return () => {
      isMounted = false;
    };
  }, []);

  const periodFilter = useMemo(
    () =>
      resolvePeriodFilter({
        quickPeriod,
        customStartDate,
        customEndDate,
        monthStartDay,
      }),
    [quickPeriod, customStartDate, customEndDate, monthStartDay],
  );

  const loadTransactions = useCallback(async () => {
    if (!account?.id) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = getTransactionsByAccountInRange(
        account.id,
        periodFilter?.startTs,
        periodFilter?.endTs,
      );
      setTransactions(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load transaction history:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [account?.id, periodFilter?.endTs, periodFilter?.startTs]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadTransactions();
      });
      return () => {
        task.cancel();
      };
    }, [loadTransactions]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      DASHBOARD_DATA_CHANGED_EVENT,
      payload => {
        const eventAccountId = payload?.accountId ? String(payload.accountId) : '';
        if (!eventAccountId || String(account?.id || '') === eventAccountId) {
          loadTransactions();
        }
      },
    );

    return () => {
      sub.remove();
    };
  }, [account?.id, loadTransactions]);

  const history = useMemo(
    () =>
      buildAccountHistory({
        account,
        transactions,
        showTransferEntries,
        periodFilter,
      }),
    [account, transactions, showTransferEntries, periodFilter],
  );

  const filteredItems = useMemo(
    () => applyHistoryTypeFilter(history.items, historyFilterType),
    [history.items, historyFilterType],
  );

  const handleQuickPeriodChange = useCallback(period => {
    setQuickPeriod(period);
    setCustomStartDate(null);
    setCustomEndDate(null);
  }, []);

  const handleCustomDateRange = useCallback((startTs, endTs) => {
    setCustomStartDate(startTs);
    setCustomEndDate(endTs);
  }, []);

  const handleClearDateRange = useCallback(() => {
    setCustomStartDate(null);
    setCustomEndDate(null);
  }, []);

  return {
    loading,
    quickPeriod,
    customStartDate,
    customEndDate,
    monthStartDay,
    historyFilterType,
    showTransferEntries,
    filteredItems,
    periodTotals: history.periodTotals,
    setHistoryFilterType,
    setShowTransferEntries,
    handleQuickPeriodChange,
    handleCustomDateRange,
    handleClearDateRange,
    reload: loadTransactions,
  };
};

export default useTransactionHistoryController;
