import React, {useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {useToast} from '../hooks/useToast';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import {
  deleteRecurringSchedule,
  getActiveRecurringSchedules,
} from '../services/recurringDatabase';
import {getAllAccounts} from '../services/accountsDatabase';

const formatDateTime = value => {
  const date = new Date(Number(value) || Date.now());
  return `${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })} ${date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const formatRepeatType = value => {
  const normalized = String(value || 'once').toLowerCase();
  if (normalized === 'daily') {
    return 'Daily';
  }
  if (normalized === 'weekly') {
    return 'Weekly';
  }
  if (normalized === 'monthly') {
    return 'Monthly';
  }
  return 'One-time';
};

const formatActionType = value => {
  const normalized = String(value || 'add').toLowerCase();
  if (normalized === 'withdraw') {
    return 'Withdraw';
  }
  if (normalized === 'transfer') {
    return 'Transfer';
  }
  if (normalized === 'request') {
    return 'Request';
  }
  return 'Add';
};

const ScheduledEntriesScreen = ({navigation, route}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const {showToast} = useToast();
  const currencySymbol = useCurrencySymbol();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const account = route?.params?.account || null;
  const [entries, setEntries] = useState([]);

  const loadEntries = useCallback(() => {
    if (!account?.id) {
      setEntries([]);
      return;
    }
    const accounts = getAllAccounts();
    const accountNameMap = new Map(
      accounts.map(item => [String(item.id), String(item.account_name || '')]),
    );
    const nextEntries = getActiveRecurringSchedules(account.id).map(entry => ({
      ...entry,
      targetAccountName: entry.target_account_id
        ? accountNameMap.get(String(entry.target_account_id)) || ''
        : '',
    }));
    setEntries(nextEntries);
  }, [account?.id]);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries]),
  );

  const handleDelete = useCallback(
    scheduleId => {
      try {
        deleteRecurringSchedule(scheduleId);
        loadEntries();
        showToast('Schedule deleted', 'success');
      } catch (error) {
        console.error('Failed to delete schedule:', error);
        showToast('Failed to delete schedule.', 'error');
      }
    },
    [loadEntries, showToast],
  );

  const renderItem = ({item}) => {
    const amountValue = Math.abs(Number(item.amount) || 0);
    const actionTypeLabel = formatActionType(item.action_type);
    const repeatTypeLabel = formatRepeatType(item.repeat_type);
    const targetLine = item.targetAccountName
      ? `${actionTypeLabel} -> ${item.targetAccountName}`
      : actionTypeLabel;

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>{repeatTypeLabel}</Text>
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.id)}>
            <Icon name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
        <Text style={styles.amountText}>
          {currencySymbol} {amountValue.toLocaleString('en-IN')}
        </Text>
        <Text style={styles.metaText}>{targetLine}</Text>
        <Text style={styles.metaText}>{formatDateTime(item.next_execution)}</Text>
        {item.remark ? <Text style={styles.noteText}>{item.remark}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Scheduled Entries</Text>
          <Text style={styles.headerSubtitle}>
            {account?.account_name || 'Account'}
          </Text>
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No scheduled entries</Text>
            <Text style={styles.emptySubtitle}>
              Future schedules will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const createStyles = (colors, insets) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top + spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTextBlock: {
      marginLeft: spacing.sm,
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
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: insets.bottom + 120,
      paddingTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    cardBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.primary + '14',
    },
    cardBadgeText: {
      fontSize: fontSize.small - 1,
      fontWeight: fontWeight.bold,
      color: colors.primary,
    },
    deleteButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FEE2E2',
    },
    amountText: {
      fontSize: fontSize.xlarge,
      fontWeight: fontWeight.bold,
      color: colors.text.primary,
      marginBottom: 6,
    },
    metaText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    noteText: {
      marginTop: spacing.xs,
      fontSize: fontSize.small,
      color: colors.text.primary,
    },
    emptyState: {
      paddingVertical: 80,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: fontSize.medium,
      fontWeight: fontWeight.bold,
      color: colors.text.primary,
    },
    emptySubtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
  });

export default ScheduledEntriesScreen;
