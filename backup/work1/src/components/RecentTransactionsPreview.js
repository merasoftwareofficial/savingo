import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BsCashCoin from './icons/BsCashCoin';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const formatDateTime = timestamp => {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
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

const RecentTransactionsPreview = ({
  entries,
  formatCurrency,
  onPressEntry,
  onPressFullHistory,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const list = Array.isArray(entries) ? entries : [];

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Recent Entries</Text>
        <TouchableOpacity onPress={onPressFullHistory} style={styles.fullHistoryCta}>
          <Text style={styles.fullHistoryText}>Full History</Text>
          <Icon name="chevron-forward" size={15} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {list.length === 0 ? (
        <View style={styles.emptyCard}>
          <Icon name="receipt-outline" size={20} color={colors.text.light} />
          <Text style={styles.emptyText}>No add/withdraw entries yet</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {list.map((entry, index) => {
            const amount = Number(entry?.amount) || 0;
            const isAdded = amount > 0;
            const accountName = String(entry?.account_name || 'Account').trim() || 'Account';
            const typeLabel = isAdded ? 'Added' : 'Withdraw';
            const signedAmount = `${isAdded ? '+' : '-'}${formatCurrency(Math.abs(amount))}`;
            const remarkText = String(
              entry?.remark || (isAdded ? 'Added amount' : 'Withdrawal'),
            );
            const accountIcon = String(entry?.icon || '').trim();
            const accountType = String(entry?.account_type || '').trim().toLowerCase();
            const iconColor = String(entry?.icon_color || '').trim() || colors.primary;
            const fallbackIcon = resolveFallbackIconByType(accountType);
            return (
              <TouchableOpacity
                key={String(entry?.id || `${entry?.account_id || 'acc'}-${index}`)}
                onPress={() => onPressEntry?.(entry)}
                style={[
                  styles.row,
                  index < list.length - 1 && styles.rowDivider,
                ]}
                activeOpacity={0.75}>
                <View
                  style={[
                    styles.accountBadge,
                    {
                      backgroundColor: withAlpha(iconColor, 0.14),
                      borderColor: withAlpha(iconColor, 0.32),
                    },
                  ]}>
                  {renderAccountIcon(accountIcon || fallbackIcon, 18, iconColor)}
                </View>

                <View style={styles.rowContent}>
                  <View style={styles.rowTop}>
                    <Text style={styles.accountName} numberOfLines={1}>{accountName}</Text>
                    <Text style={[styles.amountText, isAdded ? styles.amountAdded : styles.amountWithdraw]}>
                      {signedAmount}
                    </Text>
                  </View>
                  <Text style={styles.remarkText} numberOfLines={1}>
                    {remarkText}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Text style={styles.typeText}>{typeLabel}</Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.timeText}>{formatDateTime(entry?.transaction_date)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    sectionWrap: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    title: {
      fontSize: 12,
      fontWeight: fontWeight.bold,
      color: colors.text.secondary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    fullHistoryCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    fullHistoryText: {
      fontSize: fontSize.small,
      color: colors.primary,
      fontWeight: fontWeight.semibold,
    },
    card: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    accountBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    rowContent: {
      flex: 1,
      minWidth: 0,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    accountName: {
      flex: 1,
      fontSize: fontSize.medium,
      color: colors.text.primary,
      fontWeight: fontWeight.semibold,
    },
    amountText: {
      fontSize: fontSize.medium,
      fontWeight: fontWeight.bold,
    },
    amountAdded: {
      color: '#16A34A',
    },
    amountWithdraw: {
      color: '#DC2626',
    },
    rowMeta: {
      marginTop: 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    remarkText: {
      marginTop: 2,
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    typeText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    dot: {
      fontSize: fontSize.small,
      color: colors.text.light,
    },
    timeText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    emptyCard: {
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    emptyText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
  });

export default React.memo(RecentTransactionsPreview);
