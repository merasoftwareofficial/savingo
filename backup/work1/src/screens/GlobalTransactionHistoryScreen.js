import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import BsCashCoin from '../components/icons/BsCashCoin';
import PageHeader from '../components/ui/PageHeader';
import {useTheme} from '../context/ThemeContext';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {getAllAccounts} from '../services/accountsDatabase';
import {
  DASHBOARD_SHOW_SAVINGS_BALANCE_KEY,
  calculateAccountsNetBalance,
  shouldIncludeAccountInNet,
} from '../utils/dashboardNetBalance';
import {
  classifyHistoryEntry,
  isEarningWithdrawLogTransaction,
} from '../services/transactionHistorySelectors';
import {getAllTransactions} from '../services/transactionsDatabase';
import {fontSize, fontWeight, spacing} from '../utils/theme';

const PAGE_SIZE = 30;
const DASHBOARD_DATA_CHANGED_EVENT = 'dashboard:dataChanged';

const formatDateTime = timestamp => {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const withAlpha = (hex, alpha) => {
  if (!hex || typeof hex !== 'string') {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const resolveFallbackIconByType = accountType => {
  const type = String(accountType || '').trim().toLowerCase();
  if (type === 'earning') {
    return 'trending-up';
  }
  if (type === 'saving') {
    return 'wallet';
  }
  return 'wallet-outline';
};

const renderAccountIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }
  return <Icon name={iconName || 'wallet-outline'} size={size} color={color} />;
};

const GlobalTransactionHistoryScreen = ({navigation}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currencySymbol = useCurrencySymbol();

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showSavingsBalanceInNet, setShowSavingsBalanceInNet] = useState(true);

  const formatCurrency = useCallback(
    amount => `${currencySymbol} ${Number(amount || 0).toLocaleString('en-IN')}`,
    [currencySymbol],
  );

  const buildGlobalHistoryRows = useCallback(() => {
    const accounts = getAllAccounts();
    const transactions = getAllTransactions();
    const accountById = new Map(
      (Array.isArray(accounts) ? accounts : []).map(account => [
        String(account?.id || ''),
        account,
      ]),
    );
    const currentNetBalance = calculateAccountsNetBalance({
      accounts,
      showSavingsBalanceInNet,
    });

    const timelineRows = (Array.isArray(transactions) ? transactions : [])
      .map(txn => {
        const account = accountById.get(String(txn?.account_id || '')) || {};
        const classification = classifyHistoryEntry(txn, account?.account_type || '');
        const accountType = String(account?.account_type || '').trim().toLowerCase();
        const isTransfer =
          String(classification?.entryType || '').trim().toLowerCase() === 'transfer';
        const affectsNetBalance = shouldIncludeAccountInNet(
          account,
          showSavingsBalanceInNet,
        );
        return {
          txn,
          account,
          classification,
          isVisible:
            !isEarningWithdrawLogTransaction(txn) &&
            (!isTransfer || accountType === 'saving'),
          isDeleted: Number(txn?.is_deleted) === 1,
          affectsNetBalance,
          netBalanceAfter: 0,
        };
      })
      .sort((a, b) => {
        const timeDiff =
          Number(b?.txn?.transaction_date) - Number(a?.txn?.transaction_date);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return Number(b?.txn?.id) - Number(a?.txn?.id);
      });

    let runningBalance = currentNetBalance;
    timelineRows.forEach(row => {
      row.netBalanceAfter = runningBalance;
      if (!row.isDeleted && row.affectsNetBalance) {
        runningBalance -= Number(row?.txn?.amount) || 0;
      }
    });

    return timelineRows.filter(row => row.isVisible);
  }, [showSavingsBalanceInNet]);

  const loadHistory = useCallback(() => {
    const rows = buildGlobalHistoryRows();
    const initialRows = rows.slice(0, PAGE_SIZE);
    setAllItems(rows);
    setItems(initialRows);
    setOffset(initialRows.length);
    setHasMore(rows.length > initialRows.length);
  }, [buildGlobalHistoryRows]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(DASHBOARD_SHOW_SAVINGS_BALANCE_KEY);
        setShowSavingsBalanceInNet(stored !== '0');
      } catch {
        setShowSavingsBalanceInNet(true);
      }
    };
    const handleFocus = () => {
      void loadSettings();
    };
    const unsubscribe = navigation.addListener('focus', handleFocus);
    handleFocus();
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    setLoading(true);
    try {
      loadHistory();
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      DASHBOARD_DATA_CHANGED_EVENT,
      () => {
        setLoading(true);
        try {
          loadHistory();
        } finally {
          setLoading(false);
        }
      },
    );
    return () => sub.remove();
  }, [loadHistory]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const nextOffset = Math.min(offset + PAGE_SIZE, allItems.length);
      setItems(prev => [...prev, ...allItems.slice(offset, nextOffset)]);
      setOffset(nextOffset);
      setHasMore(nextOffset < allItems.length);
    } finally {
      setLoadingMore(false);
    }
  }, [allItems, hasMore, loading, loadingMore, offset]);

  const renderRow = ({item}) => {
    const amount = Number(item?.txn?.amount) || 0;
    const isAdded = amount > 0;
    const signedAmount = `${isAdded ? '+' : '-'}${formatCurrency(Math.abs(amount))}`;
    const balanceAfter = Number(item?.netBalanceAfter ?? item?.balanceAfter ?? 0);
    const remarkText = String(item?.txn?.remark || (isAdded ? 'Added amount' : 'Withdrawal'));
    const account = item?.account || {};
    const accountIcon = String(account?.icon || '').trim();
    const accountType = String(account?.account_type || '').trim().toLowerCase();
    const accountColor = String(account?.icon_color || '').trim() || colors.primary;
    const fallbackIcon = resolveFallbackIconByType(accountType);
    const classificationType = String(item?.classification?.entryType || '').trim().toLowerCase();
    const typeLabel =
      classificationType === 'transfer'
        ? 'Transfer'
        : classificationType === 'neutral'
        ? 'Neutral'
        : isAdded
        ? 'Added'
        : 'Withdraw';

    return (
      <View style={styles.row}>
        <View
          style={[
            styles.accountBadge,
            {
              backgroundColor: withAlpha(accountColor, 0.14),
              borderColor: withAlpha(accountColor, 0.32),
            },
          ]}>
          {renderAccountIcon(accountIcon || fallbackIcon, 19, accountColor)}
        </View>
        <View
          style={[
            styles.rowContent,
            {
              borderLeftColor: withAlpha(accountColor, 0.18),
            },
          ]}>
          <View style={styles.rowTop}>
            <Text style={styles.accountName} numberOfLines={1}>
              {String(account?.account_name || 'Account')}
            </Text>
            <View style={styles.amountBlock}>
              <Text
                style={[
                  styles.amount,
                  isAdded ? styles.amountAdded : styles.amountWithdraw,
                ]}>
                {signedAmount}
              </Text>
              <Text style={styles.balanceAfterText} numberOfLines={1}>
                {formatCurrency(balanceAfter)}
              </Text>
            </View>
          </View>
          <Text style={styles.remark} numberOfLines={2}>
            {remarkText}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{typeLabel}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{formatDateTime(item?.txn?.transaction_date)}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Full History"
        subtitle="All accounts • all transactions"
        onBackPress={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="receipt-outline" size={46} color={colors.text.light} />
          <Text style={styles.emptyText}>No transaction history yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => String(item?.txn?.id || `txn-${index}`)}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    loadingText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    emptyText: {
      fontSize: fontSize.medium,
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
    listContent: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: spacing.sm,
    },
    accountBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    rowContent: {
      flex: 1,
      minWidth: 0,
      borderLeftWidth: 3,
      paddingLeft: spacing.sm,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    accountName: {
      flex: 1,
      fontSize: fontSize.medium,
      color: colors.text.primary,
      fontWeight: fontWeight.semibold,
    },
    amount: {
      fontSize: fontSize.medium,
      fontWeight: fontWeight.bold,
      textAlign: 'right',
    },
    amountAdded: {
      color: '#16A34A',
    },
    amountWithdraw: {
      color: '#DC2626',
    },
    amountBlock: {
      alignItems: 'flex-end',
      minWidth: 110,
    },
    remark: {
      marginTop: 3,
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    metaRow: {
      marginTop: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metaText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    balanceAfterText: {
      marginTop: 2,
      fontSize: fontSize.small,
      color: colors.text.light,
      fontWeight: fontWeight.medium,
    },
    metaDot: {
      fontSize: fontSize.small,
      color: colors.text.light,
    },
    footerLoader: {
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
  });

export default GlobalTransactionHistoryScreen;
