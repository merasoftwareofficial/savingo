import {deleteTransactionsByAccount} from './transactionsDatabase';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {
  getAccountsDbConnection,
  resetAccountsDbConnection,
} from './core/accountsDbConnection';
import {getBestAccountVisualForName} from '../ui/accountVisuals';

const LEGACY_RED_400 = '#F87171';
const LEGACY_BLUE_400 = '#60A5FA';
const LEGACY_CYAN_400 = '#22D3EE';
const LEGACY_TEAL_400 = '#2DD4BF';
const LEGACY_PINK_400 = '#F472B6';
const LEGACY_ORANGE_400 = '#FB923C';
const LEGACY_YELLOW_400 = '#FACC15';
const LEGACY_INDIGO_400 = '#818CF8';
const LEGACY_PURPLE_400 = '#A78BFA';
const LEGACY_BROWN_400 = '#B45309';
const LEGACY_MAGENTA_400 = '#E879F9';
const LEGACY_GRAY_400 = '#9CA3AF';
const LEGACY_INDIGO_500 = '#6366F1';
const LEGACY_MAGENTA_500 = '#D946EF';

const TEAL_500 = '#14B8A6';
const NAVY_500 = '#1E40AF';
const PURPLE_500 = '#8B5CF6';
const BROWN_500 = '#A16207';
const CYAN_500 = '#06B6D4';
const PINK_500 = '#EC4899';
const GRAY_500 = '#6B7280';
const ACCOUNT_TYPE_CHECK_SQL = "('earning', 'expenses', 'saving', 'credit')";
const DEFAULT_SAVING_ACCOUNT_NAME = 'Saving Account';
const DEFAULT_EARNING_ACCOUNT_NAME = 'Income Account';
const DEFAULT_EXPENSES_ACCOUNT_NAME = 'Expenses Account';
const DEFAULT_CREDIT_ACCOUNT_NAME = 'Bank Credit Card';

const COLOR_MIGRATION_MAP = {
  [LEGACY_RED_400]: BROWN_500,
  [LEGACY_BLUE_400]: NAVY_500,
  [LEGACY_CYAN_400]: CYAN_500,
  [LEGACY_TEAL_400]: TEAL_500,
  [LEGACY_PINK_400]: PINK_500,
  [LEGACY_ORANGE_400]: BROWN_500,
  [LEGACY_YELLOW_400]: BROWN_500,
  [LEGACY_INDIGO_400]: NAVY_500,
  [LEGACY_PURPLE_400]: PURPLE_500,
  [LEGACY_BROWN_400]: BROWN_500,
  [LEGACY_MAGENTA_400]: PINK_500,
  [LEGACY_GRAY_400]: GRAY_500,
  [LEGACY_INDIGO_500]: NAVY_500,
  [LEGACY_MAGENTA_500]: PINK_500,
};

const migrateAccountTypeConstraintToIncludeCredit = db => {
  let startedTransaction = false;
  try {
    const schemaResult = db.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'"
    );
    const schemaSql = schemaResult.rows?._array?.[0]?.sql || '';
    const needsTableRebuild =
      schemaSql.includes('account_type') && !schemaSql.includes("'credit'");

    if (needsTableRebuild) {
      db.execute('BEGIN');
      startedTransaction = true;
      db.execute(`
        CREATE TABLE accounts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_name TEXT NOT NULL,
          account_type TEXT NOT NULL CHECK(account_type IN ${ACCOUNT_TYPE_CHECK_SQL}),
          icon TEXT,
          icon_color TEXT,
          balance REAL DEFAULT 0,
          is_primary INTEGER DEFAULT 0,
          auto_fund_primary INTEGER DEFAULT 0,
          sort_index INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      db.execute(
        `INSERT INTO accounts_new (id, account_name, account_type, icon, icon_color, balance, is_primary, auto_fund_primary, sort_index, created_at, updated_at)
         SELECT id, account_name,
                CASE
                  WHEN account_type NOT IN ${ACCOUNT_TYPE_CHECK_SQL}
                    THEN 'expenses'
                  ELSE account_type
                END,
                icon, icon_color, balance, is_primary, 0, sort_index, created_at, updated_at
         FROM accounts`
      );
      db.execute('DROP TABLE accounts');
      db.execute('ALTER TABLE accounts_new RENAME TO accounts');
      db.execute('COMMIT');
      startedTransaction = false;
    }

    db.execute(
      `UPDATE accounts SET account_type = 'expenses' WHERE account_type NOT IN ${ACCOUNT_TYPE_CHECK_SQL}`
    );
  } catch (error) {
    if (startedTransaction) {
      try {
        db.execute('ROLLBACK');
      } catch (rollbackError) {
        console.warn('Failed to rollback account type migration:', rollbackError);
      }
    }
    console.warn('Failed to migrate account type constraint:', error);
  }
};

const getAccountById = (db, id) => {
  try {
    const result = db.execute('SELECT * FROM accounts WHERE id = ? LIMIT 1', [
      id,
    ]);
    return result.rows?._array?.[0] || null;
  } catch (error) {
    console.warn('Failed to get account by id:', error);
    return null;
  }
};

const getProtectedAccountDeleteMessage = account => {
  if (!account) {
    return 'This account cannot be deleted.';
  }
  if (account.account_type === 'saving') {
    return 'Saving account cannot be deleted.';
  }
  return 'This account cannot be deleted.';
};


const getNextSortIndex = db => {
  const minResult = db.execute(
    'SELECT MIN(sort_index) as minIndex FROM accounts'
  );
  const minIndex = minResult.rows?._array?.[0]?.minIndex;
  return Number.isFinite(minIndex) ? minIndex - 1 : 0;
};

const getAccountsForVisualSelection = db => {
  try {
    const result = db.execute(
      'SELECT id, account_type, icon, icon_color FROM accounts ORDER BY created_at ASC, id ASC'
    );
    return result.rows?._array || [];
  } catch (error) {
    console.warn('Failed to read accounts for visual selection:', error);
    return [];
  }
};

const insertDefaultAccount = (db, {name, type, icon, color, isPrimary = 0}) => {
  const timestamp = Date.now();
  const sortIndex = getNextSortIndex(db);
  const visual = getBestAccountVisualForName(
    name,
    type,
    getAccountsForVisualSelection(db),
  );
  db.execute(
    `INSERT INTO accounts (account_name, account_type, icon, icon_color, balance, is_primary, sort_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [name, type, icon || visual.icon, color || visual.color, isPrimary, sortIndex, timestamp, timestamp]
  );
};

const getAccountsCount = db => {
  const result = db.execute('SELECT COUNT(*) as count FROM accounts');
  return result.rows?._array?.[0]?.count ?? 0;
};

const ensureDefaultEarningAccount = db => {
  try {
    const earningCountResult = db.execute(
      "SELECT COUNT(*) as count FROM accounts WHERE account_type = 'earning'"
    );
    const earningCount = earningCountResult.rows?._array?.[0]?.count ?? 0;
    if (earningCount > 0) {
      return;
    }
    insertDefaultAccount(db, {
      name: DEFAULT_EARNING_ACCOUNT_NAME,
      type: 'earning',
      isPrimary: 0,
    });
    console.log('Default earning account created.');
  } catch (error) {
    console.warn('Failed to ensure default earning account:', error);
  }
};

const ensureDefaultExpensesAccount = db => {
  try {
    const expensesCountResult = db.execute(
      "SELECT COUNT(*) as count FROM accounts WHERE account_type = 'expenses'"
    );
    const expensesCount = expensesCountResult.rows?._array?.[0]?.count ?? 0;
    if (expensesCount > 0) {
      return;
    }
    insertDefaultAccount(db, {
      name: DEFAULT_EXPENSES_ACCOUNT_NAME,
      type: 'expenses',
      isPrimary: 0,
    });
    console.log('Default expenses account created.');
  } catch (error) {
    console.warn('Failed to ensure default expenses account:', error);
  }
};

const ensureDefaultSavingAccount = db => {
  try {
    const savingCountResult = db.execute(
      "SELECT COUNT(*) as count FROM accounts WHERE account_type = 'saving'"
    );
    const savingCount = savingCountResult.rows?._array?.[0]?.count ?? 0;
    if (savingCount > 0) {
      return;
    }
    insertDefaultAccount(db, {
      name: DEFAULT_SAVING_ACCOUNT_NAME,
      type: 'saving',
      isPrimary: 0,
    });
    console.log('Default saving account created.');
  } catch (error) {
    console.warn('Failed to ensure default saving account:', error);
  }
};

const ensureDefaultCreditAccount = db => {
  try {
    const creditCountResult = db.execute(
      "SELECT COUNT(*) as count FROM accounts WHERE account_type = 'credit'"
    );
    const creditCount = creditCountResult.rows?._array?.[0]?.count ?? 0;
    if (creditCount > 0) {
      return;
    }
    insertDefaultAccount(db, {
      name: DEFAULT_CREDIT_ACCOUNT_NAME,
      type: 'credit',
      isPrimary: 0,
    });
    console.log('Default credit account created.');
  } catch (error) {
    console.warn('Failed to ensure default credit account:', error);
  }
};

const normalizeAccountColor = account => {
  if (!account || !account.icon_color) {
    return account;
  }
  const mappedColor = COLOR_MIGRATION_MAP[account.icon_color];
  if (mappedColor) {
    return {...account, icon_color: mappedColor};
  }
  return account;
};

// Get database instance
const getDB = () => {
  return getAccountsDbConnection();
};

export const resetAccountsDatabaseConnection = () => {
  resetAccountsDbConnection();
};

// Initialize database and create tables
export const initAccountsDatabase = () => {
  try {
    const db = getDB();

    db.execute(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK(account_type IN ${ACCOUNT_TYPE_CHECK_SQL}),
        icon TEXT,
        icon_color TEXT,
        balance REAL DEFAULT 0,
        is_primary INTEGER DEFAULT 0,
        auto_fund_primary INTEGER DEFAULT 0,
        sort_index INTEGER,
        credit_limit REAL DEFAULT 5000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Add is_primary column if it doesn't exist (for existing databases)
    try {
      db.execute('ALTER TABLE accounts ADD COLUMN is_primary INTEGER DEFAULT 0');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE accounts ADD COLUMN icon TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE accounts ADD COLUMN icon_color TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE accounts ADD COLUMN sort_index INTEGER');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE accounts ADD COLUMN auto_fund_primary INTEGER DEFAULT 0');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE accounts ADD COLUMN credit_limit REAL DEFAULT 5000');
    } catch (e) {
      // Column already exists, ignore
    }
    migrateAccountTypeConstraintToIncludeCredit(db);
    try {
      Object.entries(COLOR_MIGRATION_MAP).forEach(([oldColor, newColor]) => {
        db.execute('UPDATE accounts SET icon_color = ? WHERE icon_color = ?', [
          newColor,
          oldColor,
        ]);
      });
    } catch (e) {
      // Ignore update errors (db may be locked/empty)
    }
    try {
      const missingResult = db.execute(
        'SELECT COUNT(*) as count FROM accounts WHERE sort_index IS NULL'
      );
      const missing = missingResult.rows?._array?.[0]?.count ?? 0;
      if (missing > 0) {
        const orderResult = db.execute(
          'SELECT id FROM accounts ORDER BY updated_at DESC'
        );
        const rows = orderResult.rows?._array || [];
        db.execute('BEGIN');
        rows.forEach((row, index) => {
          db.execute('UPDATE accounts SET sort_index = ? WHERE id = ?', [
            index,
            row.id,
          ]);
        });
        db.execute('COMMIT');
      }
    } catch (e) {
      console.warn('Failed to backfill sort_index:', e);
    }

    const totalAccountsBeforeDefaults = getAccountsCount(db);
    const shouldCreateFreshDefaultCredit = totalAccountsBeforeDefaults === 0;

    ensureDefaultEarningAccount(db);
    ensureDefaultExpensesAccount(db);
    ensureDefaultSavingAccount(db);
    if (shouldCreateFreshDefaultCredit) {
      ensureDefaultCreditAccount(db);
    }

    console.log('Accounts database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize accounts database:', error);
    throw error;
  }
};

// Create new account
export const createAccount = async (accountName, accountType, icon, iconColor, creditLimit) => {
  try {
    const db = getDB();
    const timestamp = Date.now();
    const visual = getBestAccountVisualForName(
      accountName,
      accountType,
      getAccountsForVisualSelection(db),
    );
    const minResult = db.execute(
      'SELECT MIN(sort_index) as minIndex FROM accounts'
    );
    const minIndex = minResult.rows?._array?.[0]?.minIndex;
    const sortIndex = Number.isFinite(minIndex) ? minIndex - 1 : 0;

    const result = db.execute(
      `INSERT INTO accounts (account_name, account_type, icon, icon_color, balance, sort_index, credit_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        accountName.trim(),
        accountType,
        icon || visual.icon,
        iconColor || visual.color,
        sortIndex,
        creditLimit ?? 5000,
        timestamp,
        timestamp,
      ]
    );

    try {
      const countResult = db.execute('SELECT COUNT(*) as count FROM accounts');
      const count = countResult.rows?._array?.[0]?.count ?? 0;
      console.log('Accounts table count:', count);
      const pathResult = db.execute('PRAGMA database_list');
      const pathRow = pathResult.rows?._array?.find(row => row.name === 'main');
      if (pathRow?.file) {
        console.log('Accounts DB path:', pathRow.file);
      }
    } catch (countError) {
      console.warn('Accounts count check failed:', countError);
    }

    console.log('Account created successfully:', accountName);
    queueBackupFromStorage();
    return {success: true, insertId: result.insertId};
  } catch (error) {
    console.error('Failed to create account:', error);
    throw error;
  }
};

// Get all accounts
export const getAllAccounts = () => {
  try {
    const db = getDB();
    const result = db.execute(
      `SELECT * FROM accounts
       ORDER BY CASE WHEN account_type = 'earning' THEN 0 ELSE 1 END,
       sort_index ASC, updated_at DESC`
    );
    return (result.rows?._array || []).map(normalizeAccountColor);
  } catch (error) {
    console.error('Failed to get accounts:', error);
    return [];
  }
};

// Get accounts by type
export const getAccountsByType = (type) => {
  try {
    const db = getDB();
    const result = db.execute(
      'SELECT * FROM accounts WHERE account_type = ? ORDER BY sort_index ASC, updated_at DESC',
      [type]
    );
    return (result.rows?._array || []).map(normalizeAccountColor);
  } catch (error) {
    console.error('Failed to get accounts by type:', error);
    return [];
  }
};

// Get earning accounts count
export const getEarningAccountsCount = () => {
  try {
    const db = getDB();
    const result = db.execute(
      "SELECT COUNT(*) as count FROM accounts WHERE account_type = 'earning'"
    );

    // Handle different result formats
    let count = 0;
    if (result.rows) {
      if (result.rows._array && result.rows._array.length > 0) {
        count = result.rows._array[0].count || 0;
      } else if (result.rows.length > 0) {
        count = result.rows.item(0).count || 0;
      }
    }

    console.log('Earning accounts count:', count);
    return count;
  } catch (error) {
    console.error('Failed to get earning accounts count:', error);
    return 0;
  }
};

// Check if account name already exists
export const isAccountNameExists = (accountName) => {
  try {
    const db = getDB();
    const result = db.execute(
      'SELECT COUNT(*) as count FROM accounts WHERE LOWER(account_name) = LOWER(?)',
      [accountName.trim()]
    );
    return (result.rows?._array[0]?.count || 0) > 0;
  } catch (error) {
    console.error('Failed to check account name:', error);
    return false;
  }
};

// Update account
export const updateAccount = async (id, accountName, accountType) => {
  try {
    const db = getDB();
    const timestamp = Date.now();

    db.execute(
      'UPDATE accounts SET account_name = ?, account_type = ?, updated_at = ? WHERE id = ?',
      [accountName.trim(), accountType, timestamp, id]
    );

    console.log('Account updated successfully');
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to update account:', error);
    throw error;
  }
};

// Delete account
export const deleteAccount = async (id) => {
  try {
    const db = getDB();
    const account = getAccountById(db, id);
    const isSavingAccount = account?.account_type === 'saving';
    if (isSavingAccount) {
      throw new Error(getProtectedAccountDeleteMessage(account));
    }
    db.execute('DELETE FROM accounts WHERE id = ?', [id]);
    console.log('Account deleted successfully');
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to delete account:', error);
    throw error;
  }
};

// Rename account
export const renameAccount = async (id, newName) => {
  try {
    const db = getDB();
    const timestamp = Date.now();
    db.execute(
      'UPDATE accounts SET account_name = ?, updated_at = ? WHERE id = ?',
      [newName.trim(), timestamp, id]
    );
    console.log('Account renamed successfully');
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to rename account:', error);
    throw error;
  }
};

// Delete account and all its transactions
export const deleteAccountAndTransactions = async (id) => {
  try {
    const db = getDB();
    const account = getAccountById(db, id);
    const isSavingAccount = account?.account_type === 'saving';
    if (isSavingAccount) {
      throw new Error(getProtectedAccountDeleteMessage(account));
    }

    await deleteTransactionsByAccount(id);
    await deleteAccount(id);
    console.log(`Account ${id} and all its transactions deleted successfully.`);
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error(`Failed to delete account ${id} and its transactions:`, error);
    throw error;
  }
};

// Clear all accounts data
export const clearAllAccountsData = async () => {
  try {
    const db = getDB();
    db.execute('DELETE FROM accounts');
    console.log('All accounts data cleared successfully.');
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to clear all accounts data:', error);
    throw error;
  }
};



// Update account personalization
export const updateAccountPersonalization = async (id, icon, iconColor) => {
  try {
    const db = getDB();
    const timestamp = Date.now();
    db.execute(
      'UPDATE accounts SET icon = ?, icon_color = ?, updated_at = ? WHERE id = ?',
      [icon || null, iconColor || null, timestamp, id]
    );
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to update account personalization:', error);
    throw error;
  }
};

// Update credit limit for credit accounts
export const updateCreditLimit = async (id, creditLimit) => {
  try {
    const db = getDB();
    const timestamp = Date.now();
    db.execute(
      'UPDATE accounts SET credit_limit = ?, updated_at = ? WHERE id = ?',
      [creditLimit ?? 5000, timestamp, id]
    );
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to update credit limit:', error);
    throw error;
  }
};

// Update account balance
export const updateAccountBalance = async (id, newBalance) => {
  try {
    const db = getDB();
    const timestamp = Date.now();

    db.execute(
      'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
      [newBalance, timestamp, id]
    );

    return {success: true};
  } catch (error) {
    console.error('Failed to update account balance:', error);
    throw error;
  }
};

export const updateAccountSortIndex = async (id, sortIndex) => {
  try {
    const db = getDB();
    db.execute('UPDATE accounts SET sort_index = ? WHERE id = ?', [
      sortIndex,
      id,
    ]);
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to update account sort index:', error);
    throw error;
  }
};
