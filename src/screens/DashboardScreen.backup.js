import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  InteractionManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../context/ThemeContext';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {withAlpha} from '../utils/headerTextureTheme';
import {useFocusEffect} from '@react-navigation/native';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {useResolvedHeaderTextureVariant} from '../hooks/useAdaptiveThemeAccent';
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
  const {colors, isDark} = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const currencySymbol = useCurrencySymbol();
  const themeAccent = useResolvedHeaderTextureVariant();
  const activeTone = themeAccent?.accentSelection || themeAccent?.accentPrimary || colors.primary;
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
        color: account?.icon_color || '#EF4444',
        value,
      });
      return segments;
    }, []);
    if (otherExpenses > 0) {
      expenseCutSegments.push({
        key: 'other-expenses',
        color: '#EF4444',
        value: otherExpenses,
      });
    }
    const balanceGreen = Math.max(Number(dashboardNetBalance) || 0, 0);
    const savingsShown = Math.max(0, Number(savingCutAmount) || 0);

    return [
      {key: 'earning-left', color: '#22C55E', value: balanceGreen},
      ...expenseCutSegments,
      {key: 'saving-cut', color: '#F59E0B', value: savingsShown},
    ].filter(segment => segment.value > 0);
  }, [accounts, dashboardNetBalance, savingCutAmount]);
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

  const promoActions = [
    {label: periodButtonLabel, icon: 'time-outline', variant: isPeriodCalendarSelected ? 'secondary' : 'primary', action: 'quickPeriod'},
    {label: formatDateRange(customStartDate, customEndDate), icon: 'calendar-outline', variant: isPeriodCalendarSelected ? 'primary' : 'secondary', action: 'calendar'},
    {label: 'Reports', icon: 'document-text-outline', variant: 'secondary', action: 'report'},
    {label: 'History', icon: 'receipt-outline', variant: 'secondary', action: 'history'},
  ];

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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* Total Balance Card */}
      <View style={styles.balanceCard}>
        <DashboardBalanceDonutCard
          balanceAmount={dashboardNetBalance}
          earningAmount={filteredEarning}
          expenseAmount={filteredWithdrawals}
          earningRemainingPercent={earningRemainingPercent}
          segments={donutSegments}
          formatAmount={formatCurrency}
          formatBalanceAmount={formatSignedCurrency}
        />

        {/* Horizontal Stacked Bar - Period Expenses Only */}
        <View style={styles.dummyReportContainer}>
          <Text style={styles.expensesBarLabel}>Expenses Bar</Text>
          {(() => {
            const expensesAccounts = accounts.filter(acc => acc.account_type === 'expenses');
            const totalExpenses = expensesAccounts.reduce((sum, acc) => sum + Math.abs(acc.periodExpenses || 0), 0);

            if (expensesAccounts.length === 0 || totalExpenses <= 0) {
              return (
                <View style={styles.noDataContainer}>
                  <Text style={styles.noDataText}>No data available</Text>
                </View>
              );
            }

            const expensesData = expensesAccounts.map(acc => ({
              id: acc.id,
              name: acc.account_name,
              amount: Math.abs(acc.periodExpenses || 0),
              color: acc.icon_color || '#6B7280',
              percentage: totalExpenses > 0 ? ((Math.abs(acc.periodExpenses || 0) / totalExpenses) * 100).toFixed(1) : 0,
            }));

            return (
              <>
                <View style={styles.stackedBar}>
                  {expensesData.map((item) => (
                    <View
                      key={`expense-${item.id}`}
                      style={[
                        styles.stackedSegment,
                        {
                          flex: parseFloat(item.percentage),
                          backgroundColor: item.color,
                        },
                      ]}
                    />
                  ))}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.legendScroll}
                  scrollEventThrottle={16}>
                  <View style={styles.legendRow}>
                    {expensesData.map((item) => (
                      <View key={item.id} style={styles.legendItem}>
                        <View style={[styles.legendDot, {backgroundColor: item.color}]} />
                        <Text style={styles.legendText}>{item.name} {formatCurrency(item.amount)}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            );
          })()}
        </View>

        <View style={styles.promoActionGrid}>
          {promoActions.map(action => (
            <TouchableOpacity
              key={action.label}
              style={[
                styles.promoActionButton,
                action.variant === 'primary'
                  ? {
                      backgroundColor: isDark ? colors.surface : activeTone,
                      borderColor: isDark ? colors.surface : activeTone,
                    }
                  : styles.promoActionSecondary,
              ]}
              onPress={() => handlePromoAction(action.action)}
              activeOpacity={0.85}>
              {action.icon && (
                <Icon
                  name={action.icon}
                  size={20}
                  color={action.variant === 'primary' ? colors.white : colors.text.primary}
                  style={styles.promoActionIcon}
                />
              )}
              <Text
                style={[
                  styles.promoActionText,
                  action.variant === 'primary'
                    ? styles.promoActionTextPrimary
                    : styles.promoActionTextSecondary,
                ]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Your Accounts */}
      <Text style={styles.sectionTitle}>Your Accounts</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
        {accounts.map(account => {
          const accountColor = String(account?.icon_color || '').trim() || activeTone;
          return (
          <TouchableOpacity
            key={account.id}
            style={[
              styles.accountCard,
              {
                backgroundColor: accountColor,
                borderColor: accountColor,
              },
            ]}
            onPress={() => handleAccountBoxPress(account)}
            activeOpacity={0.85}>
            <View
              style={[
                styles.iconBox,
                {
                  backgroundColor: accountColor,
                  borderColor: accountColor,
                },
              ]}>
              {account.icon && (
                <AccountIcon name={account.icon} size={20} color="#FFFFFF" />
              )}
            </View>
            <Text style={styles.accountName}>{account.account_name}</Text>
            <Text style={styles.accountBalance}>
              {account.account_type === 'expenses'
                ? formatCurrency(account.periodExpenses || 0)
                : formatCurrency(account.balance || 0)}
            </Text>
            {account.periodLabel && (
              <Text style={styles.periodLabel}>{account.periodLabel}</Text>
            )}
          </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Recent Transactions */}
      <RecentTransactionsPreview
        entries={recentEntries}
        formatCurrency={formatCurrency}
        onPressEntry={handleOpenRecentEntry}
        onPressFullHistory={openGlobalHistory}
      />

      {/* Quick Period Sheet */}
      <DashboardQuickPeriodSheet
        visible={activeSheet === 'quick'}
        onClose={() => setActiveSheet(null)}
        quickPeriod={quickPeriod}
        onSelect={handleQuickPeriodSelect}
      />

      {/* Calendar Sheet */}
      <DashboardCalendarSheet
        visible={activeSheet === 'calendar'}
        onClose={() => setActiveSheet(null)}
        onCustomDateRange={handleCustomDateRange}
        onClearAll={handleClearAll}
        accounts={accounts}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        themeColor={themeAccent.accentPrimary}
        accentPalette={themeAccent}
      />

      {/* Report Sheet */}
      <DashboardReportSheet
        visible={activeSheet === 'report'}
        onClose={() => setActiveSheet(null)}
        accounts={accounts}
        themeColor={themeAccent.accentPrimary}
        accentPalette={themeAccent}
        formatCurrencyRupee={formatCurrency}
      />
    </ScrollView>
  );
};

const createStyles = (colors, isDark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.md,
    },
    balanceCard: {
      backgroundColor: isDark ? colors.panel : colors.surface,
      borderRadius: 28,
      padding: 18,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: isDark ? withAlpha(colors.white, 0.12) : colors.border,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 10},
      shadowOpacity: isDark ? 0.28 : 0.08,
      shadowRadius: 18,
      elevation: isDark ? 9 : 3,
    },
    balanceHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    balanceAmount: {
      fontSize: 36,
      lineHeight: 40,
      fontWeight: fontWeight.bold,
      color: isDark ? colors.white : colors.text.primary,
      letterSpacing: 0.2,
      marginTop: 4,
    },
    balanceEyebrow: {
      fontSize: 13,
      color: isDark ? colors.white : colors.text.primary,
      fontWeight: fontWeight.medium,
    },
    balanceSubtitle: {
      marginTop: 2,
      marginBottom: 18,
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? withAlpha(colors.white, 0.92) : colors.text.secondary,
      fontWeight: fontWeight.medium,
      maxWidth: 240,
    },
    changeBadge: {
      backgroundColor: isDark ? withAlpha(colors.white, 0.14) : withAlpha(colors.primary, 0.1),
      borderWidth: 1,
      borderColor: isDark ? withAlpha(colors.white, 0.16) : withAlpha(colors.primary, 0.14),
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    changeBadgeText: {
      color: isDark ? colors.white : colors.primary,
      fontSize: 14,
      fontWeight: fontWeight.bold,
    },
    dummyReportContainer: {
      marginBottom: spacing.lg,
    },
    expensesBarLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: fontWeight.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 8,
      paddingLeft: 2,
    },
    stackedBar: {
      height: 32,
      flexDirection: 'row',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: spacing.sm,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    stackedSegment: {
      height: '100%',
    },
    legendScroll: {
      maxHeight: 60,
    },
    legendRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: isDark ? withAlpha(colors.white, 0.08) : withAlpha(colors.black, 0.04),
      borderRadius: 6,
      minWidth: 140,
      justifyContent: 'center',
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      flexShrink: 0,
    },
    legendText: {
      fontSize: 11,
      color: colors.text.primary,
      fontWeight: fontWeight.medium,
    },
    promoActionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    promoActionButton: {
      width: '48%',
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      marginBottom: 10,
      flexDirection: 'row',
    },
    promoActionPrimary: {
      backgroundColor: isDark ? colors.surface : colors.primary,
      borderColor: isDark ? colors.surface : colors.primary,
    },
    promoActionSecondary: {
      backgroundColor: isDark ? withAlpha(colors.white, 0.12) : colors.surface,
      borderColor: isDark ? withAlpha(colors.white, 0.18) : colors.border,
    },
    promoActionIcon: {
      marginRight: spacing.xs,
    },
    promoActionText: {
      fontSize: 14,
      fontWeight: fontWeight.bold,
      textAlign: 'center',
    },
    promoActionTextPrimary: {
      color: isDark ? colors.primary : colors.white,
    },
    promoActionTextSecondary: {
      color: isDark ? colors.white : colors.text.primary,
    },
    sectionTitle: {
      fontSize: fontSize.small,
      fontWeight: fontWeight.bold,
      color: colors.text.secondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
    },
    accountsScroll: {
      marginHorizontal: -spacing.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    accountCard: {
      borderRadius: 16,
      padding: spacing.md,
      marginRight: spacing.sm,
      width: 150,
      justifyContent: 'space-between',
      minHeight: 90,
      borderWidth: 1,
    },
    accountName: {
      fontSize: fontSize.small,
      color: '#FFFFFF',
      fontWeight: fontWeight.medium,
      marginBottom: 8,
    },
    accountBalance: {
      fontSize: 18,
      color: '#FFFFFF',
      fontWeight: fontWeight.bold,
    },
    iconBox: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
      borderWidth: 1,
    },
    periodLabel: {
      fontSize: 10,
      color: 'rgba(255, 255, 255, 0.7)',
      marginTop: spacing.xs,
    },
  });

export default DashboardScreen;
