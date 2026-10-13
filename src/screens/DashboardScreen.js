import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  InteractionManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme} from '../context/ThemeContext';
import {spacing, radius, typography} from '../utils/theme';
import {withAlpha} from '../utils/color';
import Card from '../components/ui/Card';
import IconCircle from '../components/ui/IconCircle';
import SectionHeader from '../components/ui/SectionHeader';
import EmptyState from '../components/ui/EmptyState';
import {useFocusEffect} from '@react-navigation/native';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import RecentTransactionsPreview from '../components/RecentTransactionsPreview';
import {getRecentGlobalAddWithdrawEntries, getAllTransactions} from '../services/transactionsDatabase';
import {getAllAccounts} from '../services/accountsDatabase';
import AccountIcon from '../components/account/AccountIcon';
import {QUICK_PERIODS} from '../components/DashboardQuickPeriodSheet';
import DashboardQuickPeriodSheet from '../components/DashboardQuickPeriodSheet';
import DashboardCalendarSheet from '../components/DashboardCalendarSheet';
import DashboardReportSheet from '../components/DashboardReportSheet';
import DashboardBalanceDonutCard from '../components/ui/DashboardBalanceDonutCard';
import {calculateAccountsNetBalance} from '../utils/dashboardNetBalance';
import {
  clearAccountsPeriodState,
  loadAccountsPeriodState,
  saveAccountsPeriodState,
} from '../services/accountsPeriodStateStorage';
import {
  calculateAccountsPeriodData,
  isDashboardExpenseExcludedTransaction,
} from '../services/accountsPeriodCore';
import {subscribeToAccountsChanged} from '../services/accountsChangeBus';

const DASHBOARD_SHOW_SAVINGS_BALANCE_KEY = 'dashboard_show_savings_balance_in_net';
const DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY = 'dashboard_hide_saving_accounts';
const MONTH_START_DAY_KEY = 'monthStartDay';
const DASHBOARD_PERIOD_STATE_SCOPE = 'allAccounts';
const DEFAULT_MONTH_START_DAY = 1;
const VALID_QUICK_PERIODS = new Set(QUICK_PERIODS.map(item => item.value));

const MONTHS_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

const formatDateRange = (startTs, endTs) => {
  if (!startTs || !endTs) return 'Calendar';
  const start = new Date(startTs);
  const end = new Date(endTs);
  return `${MONTHS_SHORT[start.getMonth()]}${start.getDate()}-${MONTHS_SHORT[end.getMonth()]}${end.getDate()}`;
};

const formatPeriodSummaryLabel = summary => {
  if (!summary) {
    return 'Period';
  }
  if (summary.mode === 'custom' || summary.mode === 'month-year') {
    return `Period: ${formatDateRange(summary.startTime, summary.endTime)}`;
  }
  const quickLabel = QUICK_PERIODS.find(item => item.value === summary.quickPeriod);
  return quickLabel?.label || 'Period';
};

const DashboardScreen = ({navigation}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const currencySymbol = useCurrencySymbol();
  const [recentEntries, setRecentEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [quickPeriod, setQuickPeriod] = useState('10days');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [activeSheet, setActiveSheet] = useState(null);
  const [filteredEarning, setFilteredEarning] = useState(0);
  const [filteredWithdrawals, setFilteredWithdrawals] = useState(0);
  const [dashboardNetBalance, setDashboardNetBalance] = useState(0);
  const [savingCutAmount, setSavingCutAmount] = useState(0);

  const formatCurrency = amount => `${currencySymbol} ${Math.abs(amount).toLocaleString('en-IN')}`;
  const formatSignedCurrency = amount => {
    const normalizedAmount = Number(amount) || 0;
    return `${currencySymbol} ${normalizedAmount.toLocaleString('en-IN')}`;
  };
  const applyDashboardPeriodState = useCallback(
    async ({
      allAccountsRaw,
      transactions,
      nextQuickPeriod,
      nextSelectedMonth,
      nextSelectedYear,
      nextCustomStartDate,
      nextCustomEndDate,
      monthStartDay,
    }) => {
      const safeAccounts = Array.isArray(allAccountsRaw) ? allAccountsRaw : [];
      const safeTransactions = Array.isArray(transactions) ? transactions : [];
      const periodSummary = calculateAccountsPeriodData({
        quickPeriod: nextQuickPeriod,
        selectedMonth: nextSelectedMonth,
        selectedYear: nextSelectedYear,
        customStartDate: nextCustomStartDate,
        customEndDate: nextCustomEndDate,
        monthStartDay,
        accountsSource: safeAccounts,
        transactionsSource: safeTransactions,
        transferPredicate: isDashboardExpenseExcludedTransaction,
      });
      setFilteredEarning(Number(periodSummary?.filteredEarning) || 0);
      setFilteredWithdrawals(Number(periodSummary?.filteredWithdrawals) || 0);

      const showSavingsBalanceStored = await AsyncStorage.getItem(
        DASHBOARD_SHOW_SAVINGS_BALANCE_KEY,
      );
      const shouldShowSavingsBalance = showSavingsBalanceStored !== '0';
      const hideSavingsStored = await AsyncStorage.getItem(
        DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY,
      );
      const shouldHideSavings = hideSavingsStored === '1';
      const savingsAccountsAll = safeAccounts.filter(
        account => String(account?.account_type || '').toLowerCase() === 'saving',
      );

      const nextNetBalance = calculateAccountsNetBalance({
        accounts: safeAccounts,
        showSavingsBalanceInNet: shouldShowSavingsBalance,
      });
      setDashboardNetBalance(nextNetBalance);

      let savingAccounts = [];
      if (!shouldHideSavings) {
        savingAccounts = savingsAccountsAll.map(account => ({
          ...account,
          periodExpenses: periodSummary.periodAccountExpenses[account.id] ?? 0,
          periodSavedAmount: Math.max(
            0,
            Number(periodSummary?.periodAccountAmounts?.[account.id]) || 0,
          ),
        }));
      }
      setSavingCutAmount(
        shouldHideSavings
          ? 0
          : savingAccounts.reduce(
              (sum, account) => sum + (Number(account?.periodSavedAmount) || 0),
              0,
            ),
      );

      const periodLabel = formatPeriodSummaryLabel(periodSummary);
      const earningWithPeriod = safeAccounts
        .filter(account => String(account?.account_type || '').toLowerCase() === 'earning')
        .map(account => ({
          ...account,
          periodLabel,
          periodExpenses: periodSummary.periodAccountExpenses[account.id] ?? 0,
        }));
      const creditWithPeriod = safeAccounts
        .filter(account => String(account?.account_type || '').toLowerCase() === 'credit')
        .map(account => ({
          ...account,
          periodLabel,
          periodExpenses: periodSummary.periodAccountExpenses[account.id] ?? 0,
        }));
      const expensesWithPeriod = safeAccounts
        .filter(account => String(account?.account_type || '').toLowerCase() === 'expenses')
        .map(account => ({
          ...account,
          periodLabel,
          periodExpenses: periodSummary.periodAccountExpenses[account.id] ?? 0,
        }));

      setAccounts([
        ...earningWithPeriod,
        ...savingAccounts,
        ...creditWithPeriod,
        ...expensesWithPeriod,
      ]);
    },
    [],
  );

  const loadData = useCallback(async () => {
    try {
      const rows = getRecentGlobalAddWithdrawEntries(5);
      setRecentEntries(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setRecentEntries([]);
    }
    try {
      const storedState = await loadAccountsPeriodState({
        scope: DASHBOARD_PERIOD_STATE_SCOPE,
      });
      const validQuickPeriods = VALID_QUICK_PERIODS;
      const nextQuickPeriod =
        storedState?.quickPeriod && validQuickPeriods.has(storedState.quickPeriod)
          ? storedState.quickPeriod
          : '10days';
      const nextSelectedMonth = storedState?.selectedMonth ?? null;
      const nextSelectedYear = storedState?.selectedYear ?? null;
      const nextCustomStartDate = storedState?.customStartDate ?? null;
      const nextCustomEndDate = storedState?.customEndDate ?? null;

      setQuickPeriod(nextQuickPeriod);
      setSelectedMonth(nextSelectedMonth);
      setSelectedYear(nextSelectedYear);
      setCustomStartDate(nextCustomStartDate);
      setCustomEndDate(nextCustomEndDate);

      const monthStartDayStored = await AsyncStorage.getItem(MONTH_START_DAY_KEY);
      const monthStartDay = monthStartDayStored ? parseInt(monthStartDayStored, 10) : DEFAULT_MONTH_START_DAY;
      const transactions = getAllTransactions();
      const rawAccounts = getAllAccounts();
      const allAccountsRaw = Array.isArray(rawAccounts) ? rawAccounts : [];
      await applyDashboardPeriodState({
        allAccountsRaw,
        transactions,
        nextQuickPeriod,
        nextSelectedMonth,
        nextSelectedYear,
        nextCustomStartDate,
        nextCustomEndDate,
        monthStartDay,
      });
    } catch (e) {
      setAccounts([]);
      setFilteredEarning(0);
      setFilteredWithdrawals(0);
      setDashboardNetBalance(0);
      setSavingCutAmount(0);
    }
  }, [applyDashboardPeriodState]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadData();
      });
      return () => task.cancel();
    }, [loadData]),
  );

  React.useEffect(() => {
    const sub = subscribeToAccountsChanged(() => {
      InteractionManager.runAfterInteractions(() => {
        loadData();
      });
    });
    return () => {
      sub.remove();
    };
  }, [loadData]);

  const donutSegments = React.useMemo(() => {
    let otherExpenses = 0;
    const expenseCutSegments = accounts.reduce((segments, account) => {
      const value = Math.abs(Number(account?.periodExpenses) || 0);
      if (value <= 0) {
        return segments;
      }
      const accountType = String(account?.account_type || '').toLowerCase();
      if (accountType === 'earning') {
        otherExpenses += value;
        return segments;
      }
      segments.push({
        key: `expense-${account.id}`,
        color: account?.icon_color || colors.error,
        value,
      });
      return segments;
    }, []);
    if (otherExpenses > 0) {
      expenseCutSegments.push({
        key: 'other-expenses',
        color: colors.error,
        value: otherExpenses,
      });
    }
    const balanceGreen = Math.max(Number(dashboardNetBalance) || 0, 0);
    const savingsShown = Math.max(0, Number(savingCutAmount) || 0);

    return [
      {key: 'earning-left', color: colors.success, value: balanceGreen},
      ...expenseCutSegments,
      {key: 'saving-cut', color: colors.warning, value: savingsShown},
    ].filter(segment => segment.value > 0);
  }, [accounts, dashboardNetBalance, savingCutAmount, colors]);
  const earningRemainingPercent = React.useMemo(() => {
    const balanceGreen = Number(
      donutSegments.find(segment => segment.key === 'earning-left')?.value || 0,
    );
    const donutTotal = donutSegments.reduce(
      (sum, segment) => sum + (Number(segment?.value) || 0),
      0,
    );
    if (donutTotal <= 0) {
      return 0;
    }
    return (balanceGreen / donutTotal) * 100;
  }, [donutSegments]);

  const handleOpenRecentEntry = useCallback(
    entry => {
      const accountId = String(entry?.account_id || '').trim();
      if (!accountId) return;
      const targetAccount = accounts.find(account => String(account?.id) === accountId);
      if (!targetAccount) return;
      const type = String(targetAccount?.account_type || '').toLowerCase();
      const targetScreen =
        type === 'earning'
          ? 'AccountDetail'
          : type === 'credit'
          ? 'CreditCardAccountDetail'
          : 'ExpensesAccountDetail';
      navigation.navigate(targetScreen, {account: targetAccount});
    },
    [accounts, navigation],
  );

  const openGlobalHistory = useCallback(() => {
    navigation.navigate('GlobalTransactionHistory');
  }, [navigation]);

  const saveDashboardPeriodState = useCallback(
    state => {
      return saveAccountsPeriodState({
        scope: DASHBOARD_PERIOD_STATE_SCOPE,
        state,
      });
    },
    [],
  );

  const getPeriodButtonLabel = useCallback(() => {
    if (customStartDate || selectedMonth !== null) {
      return 'Period';
    }
    const periodOption = QUICK_PERIODS.find(p => p.value === quickPeriod);
    return periodOption?.label || 'Period';
  }, [quickPeriod, selectedMonth, customStartDate]);

  const periodButtonLabel = getPeriodButtonLabel();
  const isPeriodCalendarSelected = customStartDate || selectedMonth !== null;

  const handlePromoAction = useCallback(
    action => {
      switch (action) {
        case 'quickPeriod':
          setActiveSheet('quick');
          break;
        case 'calendar':
          setActiveSheet('calendar');
          break;
        case 'report':
          setActiveSheet('report');
          break;
        case 'history':
          openGlobalHistory();
          break;
        default:
          break;
      }
    },
    [openGlobalHistory],
  );

  const handleQuickPeriodSelect = period => {
    setQuickPeriod(period);
    setSelectedMonth(null);
    setSelectedYear(null);
    setCustomStartDate(null);
    setCustomEndDate(null);
    const transactions = getAllTransactions();
    const rawAccounts = getAllAccounts();
    void AsyncStorage.getItem(MONTH_START_DAY_KEY).then(value => {
      const monthStartDay = value ? parseInt(value, 10) : DEFAULT_MONTH_START_DAY;
      return applyDashboardPeriodState({
        allAccountsRaw: Array.isArray(rawAccounts) ? rawAccounts : [],
        transactions,
        nextQuickPeriod: period,
        nextSelectedMonth: null,
        nextSelectedYear: null,
        nextCustomStartDate: null,
        nextCustomEndDate: null,
        monthStartDay,
      });
    });
    saveDashboardPeriodState({
      quickPeriod: period,
      selectedMonth: null,
      selectedYear: null,
      customStartDate: null,
      customEndDate: null,
    }).catch(error => {
      console.error('Failed to save dashboard period preference:', error);
    });
  };

  const handleCustomDateRange = (start, end) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    const transactions = getAllTransactions();
    const rawAccounts = getAllAccounts();
    void AsyncStorage.getItem(MONTH_START_DAY_KEY).then(value => {
      const monthStartDay = value ? parseInt(value, 10) : DEFAULT_MONTH_START_DAY;
      return applyDashboardPeriodState({
        allAccountsRaw: Array.isArray(rawAccounts) ? rawAccounts : [],
        transactions,
        nextQuickPeriod: quickPeriod,
        nextSelectedMonth: null,
        nextSelectedYear: null,
        nextCustomStartDate: start,
        nextCustomEndDate: end,
        monthStartDay,
      });
    });
    saveDashboardPeriodState({
      quickPeriod,
      selectedMonth: null,
      selectedYear: null,
      customStartDate: start,
      customEndDate: end,
    }).catch(error => {
      console.error('Failed to save dashboard period preference:', error);
    });
  };

  const handleClearAll = () => {
    setSelectedMonth(null);
    setSelectedYear(null);
    setCustomStartDate(null);
    setCustomEndDate(null);
    const transactions = getAllTransactions();
    const rawAccounts = getAllAccounts();
    void AsyncStorage.getItem(MONTH_START_DAY_KEY).then(value => {
      const monthStartDay = value ? parseInt(value, 10) : DEFAULT_MONTH_START_DAY;
      return applyDashboardPeriodState({
        allAccountsRaw: Array.isArray(rawAccounts) ? rawAccounts : [],
        transactions,
        nextQuickPeriod: quickPeriod,
        nextSelectedMonth: null,
        nextSelectedYear: null,
        nextCustomStartDate: null,
        nextCustomEndDate: null,
        monthStartDay,
      });
    });
    clearAccountsPeriodState({
      scope: DASHBOARD_PERIOD_STATE_SCOPE,
    }).catch(error => {
      console.error('Failed to clear dashboard period preference:', error);
    });
  };

  const handleAccountBoxPress = useCallback(
    account => {
      const type = String(account?.account_type || '').toLowerCase();
      const targetScreen =
        type === 'earning'
          ? 'AccountDetail'
          : type === 'credit'
          ? 'CreditCardAccountDetail'
          : 'ExpensesAccountDetail';
      navigation.navigate(targetScreen, {account});
    },
    [navigation],
  );

  const expensesBreakdown = React.useMemo(() => {
    const expensesAccounts = accounts.filter(acc => acc.account_type === 'expenses');
    const total = expensesAccounts.reduce(
      (sum, acc) => sum + Math.abs(acc.periodExpenses || 0),
      0,
    );
    if (total <= 0) {
      return {total: 0, items: []};
    }
    return {
      total,
      items: expensesAccounts
        .map(acc => {
          const amount = Math.abs(acc.periodExpenses || 0);
          return {
            id: acc.id,
            name: acc.account_name,
            amount,
            color: acc.icon_color || colors.text.light,
            percentage: (amount / total) * 100,
          };
        })
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    };
  }, [accounts, colors.text.light]);

  const quickActions = [
    {key: 'quickPeriod', label: 'Period', icon: 'time-outline', active: !isPeriodCalendarSelected},
    {key: 'calendar', label: 'Calendar', icon: 'calendar-outline', active: Boolean(isPeriodCalendarSelected)},
    {key: 'report', label: 'Reports', icon: 'document-text-outline', active: false},
    {key: 'history', label: 'History', icon: 'receipt-outline', active: false},
  ];
  const heroPeriodLabel = isPeriodCalendarSelected
    ? formatDateRange(customStartDate, customEndDate)
    : periodButtonLabel;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Card style={styles.heroCard}>
        <DashboardBalanceDonutCard
          balanceAmount={dashboardNetBalance}
          earningAmount={filteredEarning}
          expenseAmount={filteredWithdrawals}
          earningRemainingPercent={earningRemainingPercent}
          segments={donutSegments}
          formatAmount={formatCurrency}
          formatBalanceAmount={formatSignedCurrency}
          periodLabel={heroPeriodLabel}
          onPeriodPress={() =>
            handlePromoAction(isPeriodCalendarSelected ? 'calendar' : 'quickPeriod')
          }
        />
      </Card>

      <View style={styles.quickActions}>
        {quickActions.map(action => (
          <Pressable
            key={action.key}
            style={({pressed}) => [styles.quickAction, pressed && styles.pressed]}
            onPress={() => handlePromoAction(action.key)}
            accessibilityRole="button"
            accessibilityLabel={action.label}>
            <IconCircle
              name={action.icon}
              size={52}
              iconSize={22}
              color={action.active ? colors.onPrimary : colors.text.primary}
              background={action.active ? colors.primary : colors.card}
              style={!action.active && styles.quickActionIdle}
            />
            <Text style={styles.quickActionLabel} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Expenses by account" />
      <Card style={styles.sectionCard}>
        {expensesBreakdown.items.length === 0 ? (
          <EmptyState
            compact
            icon="pie-chart-outline"
            title="No expenses in this period"
            message="Spending from your expense accounts will be split here."
          />
        ) : (
          <>
            <View style={styles.stackedBar}>
              {expensesBreakdown.items.map(item => (
                <View
                  key={`expense-${item.id}`}
                  style={[
                    styles.stackedSegment,
                    {flex: item.percentage, backgroundColor: item.color},
                  ]}
                />
              ))}
            </View>
            {expensesBreakdown.items.map(item => (
              <View key={item.id} style={styles.breakdownRow}>
                <View style={[styles.breakdownDot, {backgroundColor: item.color}]} />
                <Text style={styles.breakdownName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.breakdownPercent}>{`${item.percentage.toFixed(0)}%`}</Text>
                <Text style={styles.breakdownAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))}
          </>
        )}
      </Card>

      <SectionHeader
        title="Your accounts"
        actionLabel={accounts.length > 0 ? 'See all' : undefined}
        onAction={() => navigation.navigate('Accounts')}
      />
      {accounts.length === 0 ? (
        <Card padded={false} style={styles.sectionCard}>
          <EmptyState
            compact
            icon="wallet-outline"
            title="No accounts yet"
            message="Create your first account to start tracking."
            actionLabel="Add account"
            onAction={() => navigation.navigate('Accounts')}
          />
        </Card>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.accountsScroll}
          contentContainerStyle={styles.accountsScrollContent}>
          {accounts.map(account => {
            const accountColor =
              String(account?.icon_color || '').trim() || colors.text.secondary;
            return (
              <Pressable
                key={account.id}
                style={({pressed}) => [styles.accountCard, pressed && styles.pressed]}
                onPress={() => handleAccountBoxPress(account)}>
                <IconCircle size={38} background={withAlpha(accountColor, 0.14)}>
                  <AccountIcon
                    name={account.icon || 'wallet-outline'}
                    size={19}
                    color={accountColor}
                  />
                </IconCircle>
                <Text style={styles.accountName} numberOfLines={1}>
                  {account.account_name}
                </Text>
                <Text style={styles.accountBalance} numberOfLines={1} adjustsFontSizeToFit>
                  {account.account_type === 'expenses'
                    ? formatCurrency(account.periodExpenses || 0)
                    : formatCurrency(account.balance || 0)}
                </Text>
                {account.periodLabel ? (
                  <Text style={styles.periodLabel} numberOfLines={1}>
                    {account.periodLabel}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <RecentTransactionsPreview
        entries={recentEntries}
        formatCurrency={formatCurrency}
        onPressEntry={handleOpenRecentEntry}
        onPressFullHistory={openGlobalHistory}
      />

      <DashboardQuickPeriodSheet
        visible={activeSheet === 'quick'}
        onClose={() => setActiveSheet(null)}
        quickPeriod={quickPeriod}
        onSelect={handleQuickPeriodSelect}
      />

      <DashboardCalendarSheet
        visible={activeSheet === 'calendar'}
        onClose={() => setActiveSheet(null)}
        onCustomDateRange={handleCustomDateRange}
        onClearAll={handleClearAll}
        accounts={accounts}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
      />

      <DashboardReportSheet
        visible={activeSheet === 'report'}
        onClose={() => setActiveSheet(null)}
        accounts={accounts}
        formatCurrencyRupee={formatCurrency}
      />
    </ScrollView>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xl * 3,
    },
    heroCard: {
      borderRadius: radius.xl,
      padding: spacing.md + 4,
      marginBottom: spacing.md + 4,
    },
    quickActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.xs,
    },
    quickAction: {
      alignItems: 'center',
      width: '23%',
    },
    quickActionIdle: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickActionLabel: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 6,
    },
    pressed: {
      opacity: 0.75,
      transform: [{scale: 0.97}],
    },
    sectionCard: {
      marginBottom: spacing.lg,
    },
    stackedBar: {
      height: 12,
      flexDirection: 'row',
      borderRadius: radius.pill,
      overflow: 'hidden',
      gap: 2,
      marginBottom: spacing.sm,
    },
    stackedSegment: {
      height: '100%',
    },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    breakdownDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: spacing.sm + 2,
    },
    breakdownName: {
      ...typography.label,
      flex: 1,
      color: colors.text.primary,
    },
    breakdownPercent: {
      ...typography.caption,
      color: colors.text.secondary,
      marginRight: spacing.sm + 4,
    },
    breakdownAmount: {
      ...typography.label,
      fontWeight: '700',
      color: colors.text.primary,
    },
    accountsScroll: {
      marginHorizontal: -spacing.md,
      marginBottom: spacing.lg,
    },
    accountsScrollContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm + 2,
    },
    accountCard: {
      width: 148,
      minHeight: 124,
      borderRadius: radius.lg,
      padding: spacing.md - 2,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'space-between',
    },
    accountName: {
      ...typography.label,
      color: colors.text.secondary,
      marginTop: spacing.sm + 2,
    },
    accountBalance: {
      ...typography.heading,
      color: colors.text.primary,
      marginTop: 2,
    },
    periodLabel: {
      ...typography.caption,
      color: colors.text.light,
      marginTop: 2,
    },
  });

export default DashboardScreen;
