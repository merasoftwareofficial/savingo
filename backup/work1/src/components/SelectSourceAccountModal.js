/**
 * Select Source Account Modal
 *
 * Shows when user tries to withdraw more than account balance.
 * Displays list of available accounts (earning, credit, saving)
 * and lets user pick one to transfer from.
 *
 * Features:
 * - Shows account balance for each option
 * - Disables accounts with insufficient balance
 * - Clear indication of amount needed
 * - Smooth selection with callback
 */

import React, {useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors, spacing, fontSize, fontWeight} from '../utils/theme';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {calculateAccountBalance} from '../services/transactionsDatabase';
import {useTheme} from '../context/ThemeContext';

const SelectSourceAccountModal = ({
  visible = false,
  accounts = [],
  shortfall = 0,
  currentAccountName = '',
  onAccountSelected = () => {},
  onCancel = () => {},
  loading = false,
}) => {
  const currencySymbol = useCurrencySymbol();
  const {colors: themeColors} = useTheme();

  // Calculate balance and usability for each account
  const accountsWithBalances = useMemo(() => {
    return accounts.map(account => ({
      ...account,
      balance: calculateAccountBalance(account.id),
      canUse: calculateAccountBalance(account.id) >= shortfall,
    }));
  }, [accounts, shortfall]);

  // Sort: usable accounts first, then by balance descending
  const sortedAccounts = useMemo(() => {
    return [...accountsWithBalances].sort((a, b) => {
      if (a.canUse !== b.canUse) {
        return a.canUse ? -1 : 1;  // Usable first
      }
      return b.balance - a.balance;  // Higher balance first
    });
  }, [accountsWithBalances]);

  const getAccountTypeLabel = (type) => {
    const typeMap = {
      earning: 'Earning Account',
      credit: 'Credit Card',
      saving: 'Savings Account',
      expenses: 'Expenses Account',
    };
    return typeMap[String(type || '').toLowerCase()] || 'Account';
  };

  const getAccountTypeIcon = (type) => {
    const iconMap = {
      earning: 'wallet',
      credit: 'card',
      saving: 'piggy-bank',
      expenses: 'cash',
    };
    return iconMap[String(type || '').toLowerCase()] || 'help-circle';
  };

  const renderAccountItem = ({item}) => {
    const canUse = item.canUse;
    const accountType = getAccountTypeLabel(item.account_type);
    const accountIcon = getAccountTypeIcon(item.account_type);

    return (
      <TouchableOpacity
        style={[
          styles.accountItem,
          {backgroundColor: themeColors.card, borderColor: themeColors.border},
          !canUse && styles.accountItemDisabled,
        ]}
        onPress={() => canUse && onAccountSelected(item)}
        disabled={!canUse}
        activeOpacity={canUse ? 0.7 : 1}
      >
        {/* Account Icon */}
        <View style={styles.iconContainer}>
          <Icon
            name={accountIcon}
            size={24}
            color={canUse ? themeColors.primary : themeColors.textSecondary}
          />
        </View>

        {/* Account Info */}
        <View style={styles.accountInfo}>
          <Text
            style={[
              styles.accountName,
              {color: themeColors.text},
              !canUse && styles.textDisabled,
            ]}
            numberOfLines={1}
          >
            {item.account_name}
          </Text>
          <Text
            style={[
              styles.accountType,
              {color: themeColors.textSecondary},
              !canUse && styles.textDisabled,
            ]}
          >
            {accountType}
          </Text>
        </View>

        {/* Balance Section */}
        <View style={styles.balanceSection}>
          <Text
            style={[
              styles.balanceText,
              {color: canUse ? themeColors.success : themeColors.error},
            ]}
          >
            {currencySymbol}
            {item.balance.toFixed(2)}
          </Text>
          {!canUse && (
            <Text
              style={[
                styles.insufficientText,
                {color: themeColors.error},
              ]}
            >
              Insufficient
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon
        name="warning"
        size={48}
        color={themeColors.textSecondary}
        style={styles.emptyIcon}
      />
      <Text style={[styles.emptyText, {color: themeColors.text}]}>
        No accounts available
      </Text>
      <Text style={[styles.emptySubtext, {color: themeColors.textSecondary}]}>
        Add amount to {currentAccountName} first
      </Text>
    </View>
  );

  if (loading) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
      >
        <View style={[styles.backdrop, {backgroundColor: colors.backdrop}]}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <SafeAreaView
        style={[
          styles.container,
          {backgroundColor: themeColors.background},
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {borderBottomColor: themeColors.border},
          ]}
        >
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Text style={[styles.cancelText, {color: themeColors.primary}]}>
              Cancel
            </Text>
          </TouchableOpacity>

          <Text style={[styles.title, {color: themeColors.text}]}>
            Select Account
          </Text>

          {/* Spacer for centering */}
          <View style={{width: 60}} />
        </View>

        {/* Info Section */}
        <View
          style={[
            styles.infoSection,
            {backgroundColor: themeColors.card},
          ]}
        >
          <Text
            style={[
              styles.infoLabel,
              {color: themeColors.textSecondary},
            ]}
          >
            Additional funds needed for:
          </Text>

          <Text
            style={[
              styles.accountNameHighlight,
              {color: themeColors.text},
            ]}
          >
            {currentAccountName}
          </Text>

          <View style={styles.shortfallBadge}>
            <Icon
              name="trending-up"
              size={16}
              color={themeColors.success}
              style={{marginRight: spacing.xs}}
            />
            <Text
              style={[
                styles.shortfallText,
                {color: themeColors.success},
              ]}
            >
              {currencySymbol}{shortfall.toFixed(2)} needed
            </Text>
          </View>
        </View>

        {/* Accounts List */}
        {sortedAccounts.length > 0 ? (
          <FlatList
            data={sortedAccounts}
            renderItem={renderAccountItem}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.listContainer}
            scrollEnabled={sortedAccounts.length > 3}
          />
        ) : (
          renderEmptyState()
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },

  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    flex: 1,
    textAlign: 'center',
  },

  cancelButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },

  cancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },

  infoSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 8,
  },

  infoLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.medium,
  },

  accountNameHighlight: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },

  shortfallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },

  shortfallText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },

  listContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
  },

  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },

  accountItemDisabled: {
    opacity: 0.5,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    backgroundColor: 'rgba(52, 214, 112, 0.1)',
  },

  accountInfo: {
    flex: 1,
  },

  accountName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },

  accountType: {
    fontSize: fontSize.sm,
  },

  textDisabled: {
    opacity: 0.5,
  },

  balanceSection: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },

  balanceText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },

  insufficientText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontWeight: fontWeight.medium,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },

  emptyIcon: {
    marginBottom: spacing.md,
  },

  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },

  emptySubtext: {
    fontSize: fontSize.md,
    textAlign: 'center',
  },
});

export default SelectSourceAccountModal;
