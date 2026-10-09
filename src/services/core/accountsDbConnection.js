import {open} from 'react-native-quick-sqlite';

const DB_NAME = 'accountsDB.db';

let db = null;

export const getAccountsDbConnection = () => {
  if (db) {
    try {
      db.execute('SELECT 1');
      return db;
    } catch (error) {
      console.warn('Accounts DB shared handle became stale, reopening:', error);
      try {
        db.close?.();
      } catch {
        // Ignore close errors while recovering a stale handle.
      } finally {
        db = null;
      }
    }
  }

  try {
    db = open({name: DB_NAME});
    return db;
  } catch (error) {
    console.error('Failed to open shared accounts database connection:', error);
    throw error;
  }
};

export const resetAccountsDbConnection = () => {
  if (!db) {
    return;
  }
  try {
    db.close?.();
  } catch (error) {
    console.warn('Failed to close shared accounts database connection:', error);
  } finally {
    db = null;
  }
};

export const getAccountsDbName = () => DB_NAME;

export default {
  getAccountsDbConnection,
  resetAccountsDbConnection,
  getAccountsDbName,
};
