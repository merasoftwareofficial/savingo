import {open} from 'react-native-quick-sqlite';
import {queueBackupFromStorage} from '../utils/backupQueue';

const DB_NAME = 'accountApp.db';
let db = null;

const getDB = () => {
  if (db) {
    return db;
  }
  db = open({name: DB_NAME});
  return db;
};

export const resetLocalDatabaseConnection = () => {
  if (!db) {
    return;
  }
  try {
    db.close?.();
  } catch (error) {
    console.warn('Failed to close local database handle:', error);
  } finally {
    db = null;
  }
};

// Initialize Database Tables
export const initDatabase = () => {
  try {
    const db = getDB();
    // User local data table
    db.execute(`
      CREATE TABLE IF NOT EXISTS user_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        username TEXT,
        email TEXT,
        display_name TEXT,
        photo_url TEXT,
        balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Transactions table
    db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE,
        from_user TEXT,
        to_user TEXT,
        amount REAL,
        type TEXT,
        status TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

// Save user data locally
export const saveUserData = (userData) => {
  try {
    const db = getDB();
    db.execute(
      `INSERT OR REPLACE INTO user_data
       (user_id, username, email, display_name, photo_url, balance, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        userData.id,
        userData.username,
        userData.email,
        userData.displayName,
        userData.photoURL,
        userData.balance,
      ],
    );
    console.log('User data saved locally');
    queueBackupFromStorage();
  } catch (error) {
    console.error('Save user data error:', error);
  }
};

// Get local user data
export const getLocalUserData = () => {
  try {
    const db = getDB();
    const result = db.execute('SELECT * FROM user_data LIMIT 1');
    if (result.rows && result.rows.length > 0) {
      return result.rows._array[0];
    }
    return null;
  } catch (error) {
    console.error('Get local user data error:', error);
    return null;
  }
};

// Clear local data (on logout)
export const clearLocalData = () => {
  try {
    const db = getDB();
    db.execute('DELETE FROM user_data');
    db.execute('DELETE FROM transactions');
    console.log('Local data cleared');
  } catch (error) {
    console.error('Clear local data error:', error);
  }
};

// Save transaction
export const saveTransaction = (transaction) => {
  try {
    const db = getDB();
    db.execute(
      `INSERT INTO transactions
       (transaction_id, from_user, to_user, amount, type, status, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.id,
        transaction.fromUser,
        transaction.toUser,
        transaction.amount,
        transaction.type,
        transaction.status,
        transaction.description,
      ],
    );
    console.log('Transaction saved');
    queueBackupFromStorage();
  } catch (error) {
    console.error('Save transaction error:', error);
  }
};

// Get all transactions
export const getTransactions = () => {
  try {
    const db = getDB();
    const result = db.execute(
      'SELECT * FROM transactions ORDER BY created_at DESC',
    );
    return result.rows?._array || [];
  } catch (error) {
    console.error('Get transactions error:', error);
    return [];
  }
};

export {getDB};

export default {
  getDB,
  initDatabase,
  saveUserData,
  getLocalUserData,
  clearLocalData,
  saveTransaction,
  getTransactions,
  resetLocalDatabaseConnection,
};
