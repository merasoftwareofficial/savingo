import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import DashboardPeriodFilter from '../components/DashboardPeriodFilter';
import TransactionTypeFilterBar from '../components/TransactionTypeFilterBar';
import useTransactionHistoryController from '../hooks/useTransactionHistoryController';
import {useTheme} from '../context/ThemeContext';
import {withAlpha} from '../utils/color';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {parseEditHistory} from '../services/transactionEditHistory';
import AccountTransactionRow from '../ui/AccountTransactionRow';
import {
  getDeletedTapEffectProps,
  withDeletedStyle,
  useDeletedUi,
} from '../components/ui/deleteui';
import {
  isTransferOrRequestTransaction,
} from '../services/transactionHistorySelectors';
import {fontSize, fontWeight, spacing} from '../utils/theme';

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

const TransactionHistoryScreen = ({route, navigation}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const {deletedUiStyles, renderDeletedBadge, renderDeletedNote} = useDeletedUi();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const currencySymbol = useCurrencySymbol();
  const [previewUri, setPreviewUri] = useState('');

  const account = route?.params?.account || null;
  const {
    loading,
    quickPeriod,
    customStartDate,
    customEndDate,
    monthStartDay,
    historyFilterType,
    showTransferEntries,
    filteredItems,
    periodTotals,
    setHistoryFilterType,
    setShowTransferEntries,
    handleQuickPeriodChange,
    handleCustomDateRange,
    handleClearDateRange,
  } = useTransactionHistoryController({
    account,
    initialQuickPeriod: route?.params?.initialQuickPeriod || '1month',
    initialShowTransferEntries: route?.params?.initialShowTransferEntries === true,
    initialCustomStartDate: route?.params?.initialCustomStartDate,
    initialCustomEndDate: route?.params?.initialCustomEndDate,
  });

  const formatCurrency = useCallback(
    value => {
      const amount = Number(value) || 0;
      return `${currencySymbol} ${amount.toLocaleString('en-IN')}`;
    },
    [currencySymbol],
  );

  const formatEditHistoryValue = useCallback(
    value => {
      if (value === 'Deleted') {
        return 'Deleted';
      }
      return formatCurrency(Number(value) || 0);
    },
    [formatCurrency],
  );

  const accountTypeLabel = useMemo(() => {
    const type = String(account?.account_type || '').toLowerCase();
    if (type === 'earning') {
      return 'Earning Account';
    }
    if (type === 'saving') {
      return 'Savings Account';
    }
    if (type === 'expenses') {
      return 'Expenses Account';
    }
    return 'Account';
  }, [account?.account_type]);

  const renderTransactionItem = useCallback(
    ({item}) => (
      <AccountTransactionRow
        item={item}
        styles={styles}
        themeColors={colors}
        formatCurrency={formatCurrency}
        formatDateLabel={formatDateLabel}
        formatTimeLabel={formatTimeLabel}
        parseEditHistory={parseEditHistory}
        formatEditHistoryValue={formatEditHistoryValue}
        isTransferTransaction={isTransferOrRequestTransaction}
        withDeletedStyle={withDeletedStyle}
        deletedUiStyles={deletedUiStyles}
        renderDeletedBadge={renderDeletedBadge}
        renderDeletedNote={renderDeletedNote}
        getDeletedTapEffectProps={getDeletedTapEffectProps}
        normalizeImageUri={normalizeImageUri}
        openTransactionMenu={() => {}}
        openReceiptPreview={uri => setPreviewUri(normalizeImageUri(uri))}
      />
    ),
    [
      styles,
      colors,
      deletedUiStyles,
      renderDeletedBadge,
      renderDeletedNote,
      formatCurrency,
      formatEditHistoryValue,
    ],
  );

  if (!account?.id) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Account not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + spacing.xs}]}> 
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Transaction History</Text>
          <Text style={styles.headerSubtitle}>{`${account.account_name} • ${accountTypeLabel}`}</Text>
        </View>
      </View>

      <DashboardPeriodFilter
        quickPeriod={quickPeriod}
        onQuickPeriodChange={handleQuickPeriodChange}
        selectedMonth={null}
        selectedYear={null}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomDateRange={handleCustomDateRange}
        onClearAll={handleClearDateRange}
        accounts={[account]}
        monthStartDay={monthStartDay}
        filteredEarning={periodTotals.added}
        filteredWithdrawals={periodTotals.withdrawals}
        netBalance={periodTotals.net}
        formatCurrencyRupee={formatCurrency}
      />

      <TransactionTypeFilterBar
        value={historyFilterType}
        onChange={setHistoryFilterType}
      />

      <View style={styles.transferToggleWrap}>
        <TouchableOpacity
          style={[
            styles.transferToggle,
            showTransferEntries && {
              borderColor: account.icon_color || colors.primary,
              backgroundColor: `${account.icon_color || colors.primary}1A`,
            },
          ]}
          onPress={() => setShowTransferEntries(prev => !prev)}>
          <Icon
            name={showTransferEntries ? 'checkbox' : 'square-outline'}
            size={18}
            color={showTransferEntries ? account.icon_color || colors.primary : colors.text.secondary}
          />
          <Text
            style={[
              styles.transferToggleText,
              showTransferEntries && {color: account.icon_color || colors.primary},
            ]}>
            Include transfer/request entries
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={account.icon_color || colors.primary} />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="receipt-outline" size={46} color={colors.text.light} />
          <Text style={styles.emptyText}>No entries for selected filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item, index) =>
            String(item?.txn?.id || `${item?.txn?.transaction_date || 'txn'}-${index}`)
          }
          renderItem={renderTransactionItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
        />
      )}

      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri('')}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewUri('')}>
          <Pressable style={styles.previewContainer} onPress={() => {}}>
            <Image source={{uri: previewUri}} style={styles.previewImage} resizeMode="contain" />
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUri('')}>
              <Icon name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerBackButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      marginRight: spacing.sm,
    },
    headerContent: {
      flex: 1,
    },
    headerTitle: {
      fontSize: fontSize.large,
      fontWeight: fontWeight.bold,
      color: colors.text.primary,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    transferToggleWrap: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
    },
    transferToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    transferToggleText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
    loadingText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    emptyText: {
      fontSize: fontSize.medium,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
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
    chatBubbleCredit: {
      backgroundColor: colors.card,
      borderColor: colors.border,
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
    chatBalance: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    chatMetaRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    chatTime: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
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
      backgroundColor: 'rgba(0,0,0,0.9)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
    },
    previewContainer: {
      width: '100%',
      height: '80%',
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#000000',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewClose: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
  });

export default TransactionHistoryScreen;
