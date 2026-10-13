import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {spacing, typography} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {withAlpha} from '../utils/color';
import AccountIcon from './account/AccountIcon';
import Card from './ui/Card';
import IconCircle from './ui/IconCircle';
import ListRow from './ui/ListRow';
import SectionHeader from './ui/SectionHeader';
import EmptyState from './ui/EmptyState';

const formatTime = timestamp =>
  new Date(Number(timestamp) || Date.now()).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

const startOfDay = timestamp => {
  const date = new Date(Number(timestamp) || Date.now());
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

// "Today" / "Yesterday" / "12 Oct"
export const formatDayLabel = timestamp => {
  const day = startOfDay(timestamp);
  const today = startOfDay(Date.now());
  const oneDay = 24 * 60 * 60 * 1000;
  if (day === today) {
    return 'Today';
  }
  if (day === today - oneDay) {
    return 'Yesterday';
  }
  return new Date(day).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'});
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

// Keeps entry order; starts a new group whenever the calendar day changes.
const groupByDay = entries =>
  entries.reduce((groups, entry) => {
    const label = formatDayLabel(entry?.transaction_date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(entry);
    } else {
      groups.push({label, items: [entry]});
    }
    return groups;
  }, []);

const RecentTransactionsPreview = ({
  entries,
  formatCurrency,
  onPressEntry,
  onPressFullHistory,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const list = Array.isArray(entries) ? entries : [];
  const groups = React.useMemo(() => groupByDay(list), [list]);

  return (
    <View style={styles.sectionWrap}>
      <SectionHeader
        title="Recent entries"
        actionLabel="See all"
        onAction={onPressFullHistory}
      />

      {list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            compact
            icon="receipt-outline"
            title="No entries yet"
            message="Money you add or withdraw will show up here."
          />
        </Card>
      ) : (
        <Card padded={false} style={styles.card}>
          {groups.map(group => (
            <View key={group.label}>
              <Text style={styles.dayLabel}>{group.label}</Text>
              {group.items.map((entry, index) => {
                const amount = Number(entry?.amount) || 0;
                const isAdded = amount > 0;
                const accountName = String(entry?.account_name || 'Account').trim() || 'Account';
                const remarkText = String(
                  entry?.remark || (isAdded ? 'Added amount' : 'Withdrawal'),
                );
                const iconColor = String(entry?.icon_color || '').trim() || colors.text.secondary;
                const iconName =
                  String(entry?.icon || '').trim() ||
                  resolveFallbackIconByType(entry?.account_type);
                return (
                  <ListRow
                    key={String(entry?.id || `${entry?.account_id || 'acc'}-${index}`)}
                    leading={
                      <IconCircle size={38} background={withAlpha(iconColor, 0.14)}>
                        <AccountIcon name={iconName} size={18} color={iconColor} />
                      </IconCircle>
                    }
                    title={accountName}
                    subtitle={remarkText}
                    value={`${isAdded ? '+' : '-'}${formatCurrency(Math.abs(amount))}`}
                    valueColor={isAdded ? colors.success : colors.error}
                    valueSubtitle={formatTime(entry?.transaction_date)}
                    divider={index < group.items.length - 1}
                    onPress={() => onPressEntry?.(entry)}
                  />
                );
              })}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    sectionWrap: {
      marginBottom: spacing.lg,
    },
    card: {
      overflow: 'hidden',
      paddingBottom: spacing.xs,
    },
    dayLabel: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.text.secondary,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md - 4,
      paddingBottom: 2,
    },
  });

export default React.memo(RecentTransactionsPreview);
