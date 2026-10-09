import AsyncStorage from '@react-native-async-storage/async-storage';
import {open} from 'react-native-quick-sqlite';
import {initAccountsDatabase} from './accountsDatabase';
import {initTransactionsDatabase} from './transactionsDatabase';
import {initRecurringDatabase} from './recurringDatabase';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {DEFAULT_TAB_STORAGE_KEY} from '../utils/defaultTabPreference';

const DB_NAME = 'accountsDB.db';

const DASHBOARD_PREF_KEYS = [
  'monthStartDay',
  'dashboardQuickPeriodV1',
  'dashboard_show_savings_balance_in_net',
  'dashboard_hide_saving_accounts',
  DEFAULT_TAB_STORAGE_KEY,
];

const getDB = () => open({name: DB_NAME});

export const resetDashboardData = async () => {
  try {
    initAccountsDatabase();
    initTransactionsDatabase();
    initRecurringDatabase();

    const db = getDB();
    db.execute('BEGIN');
    try {
      db.execute('DELETE FROM recurring_schedules');
      db.execute('DELETE FROM transactions');
      db.execute('DELETE FROM accounts');
      db.execute("DELETE FROM sqlite_sequence WHERE name IN ('accounts', 'transactions', 'recurring_schedules')");
      db.execute('COMMIT');
    } catch (error) {
      db.execute('ROLLBACK');
      throw error;
    }

    // Recreate default accounts after wipe so dashboard opens in a safe state.
    initAccountsDatabase();
    await AsyncStorage.multiRemove(DASHBOARD_PREF_KEYS);

    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to reset dashboard data:', error);
    throw error;
  }
};
