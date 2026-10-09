import {queueBackupFromStorage} from '../utils/backupQueue';
import {
  getAccountsDbConnection,
  resetAccountsDbConnection,
} from './core/accountsDbConnection';
import {evaluateCreditLimitDelta} from './creditLimitPolicy';
import {
  TRANSACTION_ENTRY_KIND,
  isPayBillTransaction,
} from './transactionSemantics';

const ENTRY_KIND = {
  ...TRANSACTION_ENTRY_KIND,
};

const buildTransferOrRequestRemarkSql = alias => `
  LOWER(TRIM(COALESCE(${alias}.remark, ''))) LIKE 'transferred to %'
  OR LOWER(TRIM(COALESCE(${alias}.remark, ''))) LIKE 'transferred from %'
  OR LOWER(TRIM(COALESCE(${alias}.remark, ''))) LIKE 'requested by %'
  OR LOWER(TRIM(COALESCE(${alias}.remark, ''))) LIKE 'requested from %'
  OR LOWER(TRIM(COALESCE(${alias}.remark, ''))) LIKE 'requested to %'
`;

const buildGlobalAddWithdrawFilterSql = alias => `
  COALESCE(${alias}.is_deleted, 0) = 0
  AND ABS(COALESCE(${alias}.amount, 0)) >= 0.000001
  AND LOWER(TRIM(COALESCE(${alias}.entry_kind, ''))) NOT IN (
    '${ENTRY_KIND.TRANSFER}',
    '${ENTRY_KIND.LEGACY_TRANSFER}',
    '${ENTRY_KIND.REQUEST}'
  )
  AND NOT (${buildTransferOrRequestRemarkSql(alias)})
`;

const deriveEntryKind = (remark, amount, explicitKind = null) => {
  const normalizedExplicit = String(explicitKind || '')
    .trim()
    .toLowerCase();
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const normalizedRemark = String(remark || '').trim().toLowerCase();
  const normalizedAmount = Number(amount) || 0;
  if (
    Math.abs(normalizedAmount) < 0.000001 &&
    normalizedRemark.startsWith('[ewlog]')
  ) {
    return ENTRY_KIND.EARNING_WITHDRAW_LOG;
  }
  if (
    Math.abs(normalizedAmount) < 0.000001 &&
    normalizedRemark.startsWith('[cwlog]')
  ) {
    return ENTRY_KIND.CREDIT_WITHDRAW_LOG;
  }
  if (
    normalizedRemark.startsWith('transferred to ') ||
    normalizedRemark.startsWith('transferred from ')
  ) {
    return ENTRY_KIND.TRANSFER;
  }
  if (
    normalizedRemark.startsWith('requested by ') ||
    normalizedRemark.startsWith('requested from ') ||
    normalizedRemark.startsWith('requested to ')
  ) {
    return ENTRY_KIND.REQUEST;
  }
  if (isPayBillTransaction({remark: normalizedRemark})) {
    return ENTRY_KIND.PAY_BILL;
  }
  return ENTRY_KIND.NORMAL;
};

const readRows = result => {
  if (!result?.rows) {
    return [];
  }
  if (result.rows._array) {
    return result.rows._array;
  }
  const rows = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    rows.push(result.rows.item(index));
  }
  return rows;
};

// Get database instance
const getDB = () => {
  return getAccountsDbConnection();
};

const getAccountSnapshotById = (db, accountId) => {
  try {
    const result = db.execute(
      'SELECT id, account_type, credit_limit, balance FROM accounts WHERE id = ? LIMIT 1',
      [accountId]
    );
    return readRows(result)[0] || null;
  } catch (error) {
    console.error('Failed to read account snapshot:', error);
    return null;
  }
};

const getTransactionSnapshotById = (db, transactionId) => {
  try {
    const result = db.execute(
      'SELECT id, account_id, amount FROM transactions WHERE id = ? LIMIT 1',
      [transactionId]
    );
    return readRows(result)[0] || null;
  } catch (error) {
    console.error('Failed to read transaction snapshot:', error);
    return null;
  }
};

const assertCreditLimitAllowsTransaction = ({
  db,
  accountId,
  changeAmount = 0,
  currentBalance = null,
}) => {
  const account = getAccountSnapshotById(db, accountId);
  if (!account || String(account.account_type || '').trim().toLowerCase() !== 'credit') {
    return {
      allowed: true,
      account: account || null,
    };
  }

  const resolvedCurrentBalance =
    Number.isFinite(Number(currentBalance)) && currentBalance !== null
      ? Number(currentBalance)
      : calculateAccountBalance(accountId);
  const evaluation = evaluateCreditLimitDelta({
    account,
    currentBalance: resolvedCurrentBalance,
    delta: changeAmount,
  });

  if (!evaluation.allowed) {
    const error = new Error(evaluation.message || 'Selected credit limit reached.');
    error.code = evaluation.errorCode || 'CREDIT_LIMIT_EXCEEDED';
    error.details = evaluation;
    throw error;
  }

  return {
    allowed: true,
    account,
    evaluation,
  };
};

// Initialize transactions table
export const initTransactionsDatabase = () => {
  try {
    const db = getDB();

    db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        remark TEXT,
        image_uri TEXT,
        edit_history TEXT,
        edit_count INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        off_session_id TEXT,
        source_schedule_id INTEGER,
        transaction_date INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts (id)
      );
    `);

    try {
      db.execute('ALTER TABLE transactions ADD COLUMN edit_history TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN edit_count INTEGER DEFAULT 0');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN image_uri TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN is_deleted INTEGER DEFAULT 0');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN deleted_at INTEGER');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN entry_kind TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN off_session_id TEXT');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('ALTER TABLE transactions ADD COLUMN source_schedule_id INTEGER');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.execute('UPDATE transactions SET is_deleted = 0 WHERE is_deleted IS NULL');
    } catch (e) {
      // Ignore update errors
    }
    try {
      // Backfill deterministic categories for existing rows so UI filters do not rely only on remark parsing.
      db.execute(`
        UPDATE transactions
        SET entry_kind = CASE
          WHEN ABS(COALESCE(amount, 0)) < 0.000001
            AND SUBSTR(LOWER(TRIM(COALESCE(remark, ''))), 1, 7) = '[ewlog]'
            THEN '${ENTRY_KIND.EARNING_WITHDRAW_LOG}'
          WHEN LOWER(TRIM(COALESCE(remark, ''))) LIKE 'transferred to %'
            OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'transferred from %'
            THEN '${ENTRY_KIND.TRANSFER}'
          WHEN LOWER(TRIM(COALESCE(remark, ''))) LIKE 'requested by %'
            OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'requested from %'
            OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'requested to %'
            THEN '${ENTRY_KIND.LEGACY_TRANSFER}'
          WHEN LOWER(TRIM(COALESCE(remark, ''))) LIKE 'paid bill to %'
            OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'paid bill from %'
            THEN '${ENTRY_KIND.PAY_BILL}'
          ELSE '${ENTRY_KIND.NORMAL}'
        END
        WHERE entry_kind IS NULL OR TRIM(entry_kind) = ''
      `);
    } catch (e) {
      // Ignore backfill errors
    }
    try {
      // Re-normalize legacy rows where entry_kind exists but drifted from deterministic remark signatures.
      db.execute(`
        UPDATE transactions
        SET entry_kind = '${ENTRY_KIND.TRANSFER}'
        WHERE LOWER(TRIM(COALESCE(remark, ''))) LIKE 'transferred to %'
           OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'transferred from %'
      `);
      db.execute(`
        UPDATE transactions
        SET entry_kind = '${ENTRY_KIND.LEGACY_TRANSFER}'
        WHERE LOWER(TRIM(COALESCE(remark, ''))) LIKE 'requested by %'
           OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'requested from %'
           OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'requested to %'
      `);
      db.execute(`
        UPDATE transactions
        SET entry_kind = '${ENTRY_KIND.EARNING_WITHDRAW_LOG}'
        WHERE ABS(COALESCE(amount, 0)) < 0.000001
          AND SUBSTR(LOWER(TRIM(COALESCE(remark, ''))), 1, 7) = '[ewlog]'
      `);
      db.execute(`
        UPDATE transactions
        SET entry_kind = '${ENTRY_KIND.PAY_BILL}'
        WHERE LOWER(TRIM(COALESCE(remark, ''))) LIKE 'paid bill to %'
           OR LOWER(TRIM(COALESCE(remark, ''))) LIKE 'paid bill from %'
      `);
    } catch (e) {
      // Ignore renormalization errors
    }

    console.log('Transactions database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize transactions database:', error);
    throw error;
  }
};

// Create new transaction
export const createTransaction = async (
  accountId,
  amount,
  remark,
  transactionDate = null,
  imageUri = null,
  entryKind = null,
  options = null
) => {
  try {
    const db = getDB();
    const timestamp = Date.now();
    const transactionTimestamp = Number.isFinite(transactionDate)
      ? transactionDate
      : timestamp;
    const resolvedEntryKind = deriveEntryKind(remark, amount, entryKind);
    const sourceScheduleId = Number(options?.sourceScheduleId);
    const normalizedSourceScheduleId =
      Number.isInteger(sourceScheduleId) && sourceScheduleId > 0
        ? sourceScheduleId
        : null;

    if (normalizedSourceScheduleId != null) {
      const existingRows = readRows(
        db.execute(
          `SELECT id FROM transactions
           WHERE account_id = ? AND source_schedule_id = ? AND transaction_date = ? AND is_deleted = 0
           LIMIT 1`,
          [accountId, normalizedSourceScheduleId, transactionTimestamp]
        )
      );
      if (existingRows.length > 0) {
        return {success: true, insertId: existingRows[0].id, existing: true};
      }
    }

    assertCreditLimitAllowsTransaction({
      db,
      accountId,
      changeAmount: Number(amount) || 0,
      currentBalance: calculateAccountBalance(accountId),
    });

    let offSessionId = null;
    try {
      const {resolveStrictEcoOffSessionIdForCreate} = require('./strictEcoService');
      if (typeof resolveStrictEcoOffSessionIdForCreate === 'function') {
        offSessionId = await resolveStrictEcoOffSessionIdForCreate();
      }
    } catch (sessionError) {
      console.error('Failed to resolve strict eco session for transaction:', sessionError);
    }
    if (__DEV__) {
      console.log('[STRICT_ECO][CREATE_TXN_STAMP]', {
        accountId,
        amount: Number(amount) || 0,
        entryKind: resolvedEntryKind,
        offSessionId: offSessionId || null,
        transactionTimestamp,
      });
    }

    const result = db.execute(
      `INSERT INTO transactions (account_id, amount, remark, image_uri, entry_kind, off_session_id, source_schedule_id, transaction_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        amount,
        remark || '',
        imageUri || '',
        resolvedEntryKind,
        offSessionId || null,
        normalizedSourceScheduleId,
        transactionTimestamp,
        timestamp,
      ]
    );

    console.log('Transaction created successfully');

    // Update account balance
    await updateAccountBalance(accountId);

    queueBackupFromStorage();
    return {success: true, insertId: result.insertId};
  } catch (error) {
    console.error('Failed to create transaction:', error);
    throw error;
  }
};

// Get all transactions for an account
export const getTransactionsByAccount = (accountId, limit = null) => {
  try {
    const db = getDB();
    const query = limit && Number.isInteger(limit) && limit > 0
      ? 'SELECT * FROM transactions WHERE account_id = ? ORDER BY transaction_date DESC, id DESC LIMIT ?'
      : 'SELECT * FROM transactions WHERE account_id = ? ORDER BY transaction_date DESC, id DESC';
    const params = (limit && Number.isInteger(limit) && limit > 0) ? [accountId, limit] : [accountId];
    const result = db.execute(query, params);
    return readRows(result);
  } catch (error) {
    console.error('Failed to get transactions:', error);
    return [];
  }
};

export const getAllTransactions = (limit = null) => {
  try {
    const db = getDB();
    const query = limit && Number.isInteger(limit) && limit > 0
      ? 'SELECT * FROM transactions ORDER BY account_id ASC, transaction_date ASC LIMIT ?'
      : 'SELECT * FROM transactions ORDER BY account_id ASC, transaction_date ASC';
    const params = (limit && Number.isInteger(limit) && limit > 0) ? [limit] : [];
    const result = db.execute(query, params);
    return readRows(result);
  } catch (error) {
    console.error('Failed to get all transactions:', error);
    return [];
  }
};

export const getRecentGlobalAddWithdrawEntries = (limit = 5) => {
  try {
    const db = getDB();
    const normalizedLimit =
      Number.isInteger(limit) && limit > 0 ? limit : 5;
    const query = `
      SELECT
        t.*,
        a.account_name,
        a.account_type,
        a.icon,
        a.icon_color,
        COALESCE(a.balance, 0) AS balance_after,
        CASE
          WHEN COALESCE(t.amount, 0) > 0 THEN 'added'
          ELSE 'withdraw'
        END AS history_type
      FROM transactions t
      INNER JOIN accounts a ON a.id = t.account_id
      WHERE ${buildGlobalAddWithdrawFilterSql('t')}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ?
    `;
    const result = db.execute(query, [normalizedLimit]);
    return readRows(result);
  } catch (error) {
    console.error('Failed to get recent global add/withdraw entries:', error);
    return [];
  }
};

export const getGlobalAddWithdrawEntries = ({
  limit = 30,
  offset = 0,
} = {}) => {
  try {
    const db = getDB();
    const normalizedLimit =
      Number.isInteger(limit) && limit > 0 ? limit : 30;
    const normalizedOffset =
      Number.isInteger(offset) && offset >= 0 ? offset : 0;
    const query = `
      SELECT
        t.*,
        a.account_name,
        a.account_type,
        a.icon,
        a.icon_color,
        COALESCE(a.balance, 0) AS balance_after,
        CASE
          WHEN COALESCE(t.amount, 0) > 0 THEN 'added'
          ELSE 'withdraw'
        END AS history_type
      FROM transactions t
      INNER JOIN accounts a ON a.id = t.account_id
      WHERE ${buildGlobalAddWithdrawFilterSql('t')}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `;
    const result = db.execute(query, [normalizedLimit, normalizedOffset]);
    return readRows(result);
  } catch (error) {
    console.error('Failed to get global add/withdraw entries:', error);
    return [];
  }
};

// Calculate total balance for an account
export const calculateAccountBalance = (accountId) => {
  try {
    const db = getDB();
    const result = db.execute(
      'SELECT SUM(amount) as total FROM transactions WHERE account_id = ? AND is_deleted = 0',
      [accountId]
    );

    let total = 0;
    if (result.rows) {
      if (result.rows._array && result.rows._array.length > 0) {
        total = result.rows._array[0].total || 0;
      } else if (result.rows.length > 0) {
        total = result.rows.item(0).total || 0;
      }
    }

    return total;
  } catch (error) {
    console.error('Failed to calculate balance:', error);
    return 0;
  }
};

// Update account balance in accounts table
const updateAccountBalance = async (accountId) => {
  try {
    const db = getDB();
    const totalBalance = calculateAccountBalance(accountId);
    const timestamp = Date.now();

    db.execute(
      'UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?',
      [totalBalance, timestamp, accountId]
    );

    console.log('Account balance updated:', totalBalance);
  } catch (error) {
    console.error('Failed to update account balance:', error);
  }
};

// Delete transaction
export const deleteTransaction = async (
  transactionId,
  accountId,
  editHistory = null
) => {
  try {
    const db = getDB();
    const timestamp = Date.now();
    if (editHistory !== null) {
      db.execute(
        'UPDATE transactions SET is_deleted = 1, deleted_at = ?, edit_history = ? WHERE id = ?',
        [timestamp, editHistory, transactionId]
      );
    } else {
      db.execute(
        'UPDATE transactions SET is_deleted = 1, deleted_at = ? WHERE id = ?',
        [timestamp, transactionId]
      );
    }

    // Update account balance
    await updateAccountBalance(accountId);

    console.log('Transaction deleted successfully');
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    throw error;
  }
};

// Delete all transactions for an account
export const deleteTransactionsByAccount = async (accountId) => {
  try {
    const db = getDB();
    db.execute('DELETE FROM transactions WHERE account_id = ?', [accountId]);
    console.log('Transactions deleted for account:', accountId);
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to delete account transactions:', error);
    throw error;
  }
};

// Update transaction amount
export const updateTransactionAmount = async (
  transactionId,
  accountId,
  amount,
  editHistory = null,
  editCount = null
) => {
  try {
    const db = getDB();
    const existingTransaction = getTransactionSnapshotById(db, transactionId);
    const resolvedAccountId = Number.isInteger(Number(accountId))
      ? accountId
      : existingTransaction?.account_id;
    const existingAmount = Number(existingTransaction?.amount) || 0;
    assertCreditLimitAllowsTransaction({
      db,
      accountId: resolvedAccountId,
      changeAmount: (Number(amount) || 0) - existingAmount,
      currentBalance: calculateAccountBalance(resolvedAccountId),
    });
    if (editHistory !== null || editCount !== null) {
      db.execute(
        'UPDATE transactions SET amount = ?, edit_history = ?, edit_count = ? WHERE id = ?',
        [
          amount,
          editHistory,
          Number.isFinite(editCount) ? editCount : 0,
          transactionId,
        ]
      );
    } else {
      db.execute('UPDATE transactions SET amount = ? WHERE id = ?', [
        amount,
        transactionId,
      ]);
    }

    await updateAccountBalance(accountId);

    console.log('Transaction amount updated:', transactionId);
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to update transaction amount:', error);
    throw error;
  }
};

// Update transaction remark
export const updateTransactionRemark = async (transactionId, remark) => {
  try {
    const db = getDB();
    db.execute('UPDATE transactions SET remark = ? WHERE id = ?', [
      remark || '',
      transactionId,
    ]);

    console.log('Transaction remark updated:', transactionId);
    queueBackupFromStorage();
    return {success: true};
  } catch (error) {
    console.error('Failed to update transaction remark:', error);
    throw error;
  }
};

// Get transaction count for an account
export const getTransactionCount = (accountId) => {
  try {
    const db = getDB();
    const result = db.execute(
      'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
      [accountId]
    );

    let count = 0;
    if (result.rows) {
      if (result.rows._array && result.rows._array.length > 0) {
        count = result.rows._array[0].count || 0;
      } else if (result.rows.length > 0) {
        count = result.rows.item(0).count || 0;
      }
    }

    return count;
  } catch (error) {
    console.error('Failed to get transaction count:', error);
    return 0;
  }
};

export const resetTransactionsDatabaseConnection = () => {
  resetAccountsDbConnection();
};

const getStrictEcoEligibleAccounts = () => {
  try {
    const db = getDB();
    const result = db.execute(
      `SELECT id, account_name, account_type
       FROM accounts
       WHERE account_type IN ('earning', 'expenses')`
    );
    return readRows(result);
  } catch (error) {
    console.error('Failed to read strict eco eligible accounts:', error);
    return [];
  }
};

export const assignLegacyOffSessionToActiveTransactions = offSessionId => {
  const normalizedSessionId = String(offSessionId || '').trim();
  if (!normalizedSessionId) {
    return {
      success: false,
      offSessionId: null,
      taggedCount: 0,
      affectedAccountIds: [],
    };
  }

  try {
    const db = getDB();
    const rows = readRows(
      db.execute(
        `SELECT t.id, t.account_id
         FROM transactions t
         INNER JOIN accounts a ON a.id = t.account_id
         WHERE t.is_deleted = 0
           AND (t.off_session_id IS NULL OR TRIM(t.off_session_id) = '')
           AND a.account_type IN ('earning', 'expenses')`
      )
    );

    if (rows.length === 0) {
      return {
        success: true,
        offSessionId: normalizedSessionId,
        taggedCount: 0,
        affectedAccountIds: [],
      };
    }

    db.execute(
      `UPDATE transactions
       SET off_session_id = ?
       WHERE is_deleted = 0
         AND (off_session_id IS NULL OR TRIM(off_session_id) = '')
         AND account_id IN (
           SELECT id FROM accounts WHERE account_type IN ('earning', 'expenses')
         )`,
      [normalizedSessionId]
    );

    const affectedAccountIds = Array.from(
      new Set(rows.map(row => Number(row.account_id)).filter(Number.isFinite))
    );

    if (__DEV__) {
      console.log('[STRICT_ECO][LEGACY_SESSION_BACKFILL]', {
        offSessionId: normalizedSessionId,
        taggedCount: rows.length,
        affectedAccountIds,
      });
    }

    return {
      success: true,
      offSessionId: normalizedSessionId,
      taggedCount: rows.length,
      affectedAccountIds,
    };
  } catch (error) {
    console.error('Failed to assign legacy OFF session to active transactions:', error);
    return {
      success: false,
      offSessionId: normalizedSessionId,
      taggedCount: 0,
      affectedAccountIds: [],
    };
  }
};

export const getOffSessionEnableAnalysis = (
  offSessionId,
  epsilon = 0.000001
) => {
  const normalizedSessionId = String(offSessionId || '').trim();
  const threshold = Math.max(0, Number(epsilon) || 0);
  if (!normalizedSessionId) {
    return {
      offSessionId: null,
      entryCount: 0,
      affectedAccounts: [],
      unsettledAfterDelete: [],
    };
  }

  try {
    const db = getDB();
    const sessionRows = readRows(
      db.execute(
        `SELECT account_id,
                COUNT(*) as entry_count,
                COALESCE(SUM(amount), 0) as total_amount
         FROM transactions
         WHERE off_session_id = ? AND is_deleted = 0
         GROUP BY account_id`,
        [normalizedSessionId]
      )
    );

    const sessionByAccountId = new Map();
    let entryCount = 0;
    sessionRows.forEach(row => {
      const accountId = String(row.account_id);
      const nextEntryCount = Number(row.entry_count) || 0;
      const nextTotalAmount = Number(row.total_amount) || 0;
      entryCount += nextEntryCount;
      sessionByAccountId.set(accountId, {
        accountId: row.account_id,
        entryCount: nextEntryCount,
        totalAmount: nextTotalAmount,
      });
    });

    const eligibleAccounts = getStrictEcoEligibleAccounts();
    const affectedAccounts = [];
    const unsettledAfterDelete = [];

    eligibleAccounts.forEach(account => {
      const currentBalance = Number(calculateAccountBalance(account.id)) || 0;
      const sessionImpact = sessionByAccountId.get(String(account.id));
      const projectedBalance = currentBalance - (sessionImpact?.totalAmount || 0);

      if (sessionImpact) {
        affectedAccounts.push({
          id: account.id,
          accountName: account.account_name || 'Account',
          accountType: account.account_type || '',
          entryCount: sessionImpact.entryCount,
          currentBalance,
          sessionAmount: sessionImpact.totalAmount,
          projectedBalance,
        });
      }

      if (Math.abs(projectedBalance) > threshold) {
        unsettledAfterDelete.push({
          id: account.id,
          accountName: account.account_name || 'Account',
          accountType: account.account_type || '',
          balance: projectedBalance,
        });
      }
    });

    if (__DEV__) {
      console.log('[STRICT_ECO][OFF_SESSION_ANALYSIS]', {
        offSessionId: normalizedSessionId,
        entryCount,
        affectedAccounts,
        unsettledAfterDelete,
      });
    }
    return {
      offSessionId: normalizedSessionId,
      entryCount,
      affectedAccounts,
      unsettledAfterDelete,
    };
  } catch (error) {
    console.error('Failed to analyze OFF session impact:', error);
    return {
      offSessionId: normalizedSessionId,
      entryCount: 0,
      affectedAccounts: [],
      unsettledAfterDelete: [],
    };
  }
};

export const deleteTransactionsByOffSessionId = async offSessionId => {
  const normalizedSessionId = String(offSessionId || '').trim();
  if (!normalizedSessionId) {
    return {success: true, deletedCount: 0, affectedAccountIds: []};
  }

  try {
    const db = getDB();
    const rows = readRows(
      db.execute(
        `SELECT id, account_id
         FROM transactions
         WHERE off_session_id = ? AND is_deleted = 0`,
        [normalizedSessionId]
      )
    );

    const deletedCount = rows.length;
    if (__DEV__) {
      console.log('[STRICT_ECO][DELETE_OFF_SESSION_START]', {
        offSessionId: normalizedSessionId,
        deletedCount,
        rows,
      });
    }
    if (!deletedCount) {
      return {success: true, deletedCount: 0, affectedAccountIds: []};
    }

    const timestamp = Date.now();
    db.execute(
      `UPDATE transactions
       SET is_deleted = 1, deleted_at = ?
       WHERE off_session_id = ? AND is_deleted = 0`,
      [timestamp, normalizedSessionId]
    );

    const affectedAccountIds = [...new Set(rows.map(item => item.account_id))];
    for (const accountId of affectedAccountIds) {
      await updateAccountBalance(accountId);
    }

    if (__DEV__) {
      console.log('[STRICT_ECO][DELETE_OFF_SESSION_DONE]', {
        offSessionId: normalizedSessionId,
        deletedCount,
        affectedAccountIds,
      });
    }
    queueBackupFromStorage();
    return {success: true, deletedCount, affectedAccountIds};
  } catch (error) {
    console.error('Failed to delete OFF session transactions:', error);
    throw error;
  }
};
