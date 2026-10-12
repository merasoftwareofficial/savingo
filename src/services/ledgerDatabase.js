import {open} from 'react-native-quick-sqlite';

export const getLedgerTransactionsPage = (recordId, limit = 50, before = null) => {
  const database = getDB();
  const size = Math.max(1, Math.floor(Number(limit) || 50));
  const cursorSql = before ? " AND (COALESCE(transaction_date, 0) < ? OR (COALESCE(transaction_date, 0) = ? AND ('txn-' || id) < ?))" : '';
  const parameters = [String(recordId)];
  if (before) parameters.push(before.timestamp, before.timestamp, before.id);
  parameters.push(size);
  return database.execute(`SELECT * FROM ledger_transactions WHERE contact_record_id = ?
    ${cursorSql} ORDER BY COALESCE(transaction_date, 0) DESC, CAST(id AS TEXT) DESC LIMIT ?`, parameters).rows?._array || [];
};

const DB_NAME = 'ledgerDB.db';
let db = null;

const openLedgerDatabase = () => open({name: DB_NAME});

const resetClosedLedgerHandle = () => {
  if (!db) {
    return;
  }
  try {
    db.close?.();
  } catch {
    // Ignore close errors while recovering a stale handle.
  } finally {
    db = null;
  }
};

// Get database instance
const getDB = () => {
  if (db) {
    try {
      db.execute('SELECT 1');
      return db;
    } catch (error) {
      console.warn('Ledger database handle became stale, reopening:', error);
      resetClosedLedgerHandle();
    }
  }
  try {
    db = openLedgerDatabase();
    return db;
  } catch (error) {
    console.error('Failed to open ledger database:', error);
    throw error;
  }
};

export const resetLedgerDatabaseConnection = () => {
  try {
    resetClosedLedgerHandle();
  } catch (error) {
    console.warn('Failed to close ledger database handle:', error);
  }
};

// Initialize database and create tables
export const initLedgerDatabase = () => {
  try {
    const db = getDB();

    db.execute(`
            CREATE TABLE IF NOT EXISTS ledger_transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              contact_record_id TEXT NOT NULL,
              amount REAL NOT NULL,
              type TEXT NOT NULL CHECK(type IN ('paid', 'get')),
              note TEXT,
              source_user_id TEXT,
              source_origin_key TEXT,
              sync_tag TEXT,
              is_deleted INTEGER NOT NULL DEFAULT 0,
              transaction_date INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              edit_count INTEGER NOT NULL DEFAULT 0,
              edit_history TEXT
            );
          `);
      
          
          db.execute(`
            CREATE TABLE IF NOT EXISTS contact_names (
              contact_record_id TEXT PRIMARY KEY,
              display_name TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
          `);
          // Migrate legacy nicknames into contact_names
          try {
            db.execute(`
              INSERT OR IGNORE INTO contact_names (contact_record_id, display_name, created_at, updated_at)
              SELECT contact_record_id, nickname, created_at, updated_at
              FROM contact_nicknames
            `);
          } catch (e) {
            // Legacy table missing or migration already handled
          }

          // Add edit_count column if missing
          try {
            db.execute(`ALTER TABLE ledger_transactions ADD COLUMN edit_count INTEGER NOT NULL DEFAULT 0`);
          } catch (e) {
            // Column already exists, ignore
          }

          // Add edit history column if missing
          try {
            db.execute(`ALTER TABLE ledger_transactions ADD COLUMN edit_history TEXT`);
          } catch (e) {
            // Column already exists, ignore
          }

          // Track transaction creator (current user or peer user)
          try {
            db.execute(`ALTER TABLE ledger_transactions ADD COLUMN source_user_id TEXT`);
          } catch (e) {
            // Column already exists, ignore
          }

          // Stable origin key for incoming sync upsert safety.
          try {
            db.execute(`ALTER TABLE ledger_transactions ADD COLUMN source_origin_key TEXT`);
          } catch (e) {
            // Column already exists, ignore
          }

          // Optional tag for synced entries (UI badge support).
          try {
            db.execute(`ALTER TABLE ledger_transactions ADD COLUMN sync_tag TEXT`);
          } catch (e) {
            // Column already exists, ignore
          }

          // Soft delete flag for ledger timeline retention.
          try {
            db.execute(
              `ALTER TABLE ledger_transactions ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`
            );
          } catch (e) {
            // Column already exists, ignore
          }

          // Remove legacy nickname table
          try {
            db.execute('DROP TABLE IF EXISTS contact_nicknames');
          } catch (e) {
            // Ignore drop failures
          }
      
          // Create index for faster lookups
          try {
            db.execute(`
              CREATE INDEX IF NOT EXISTS idx_contact_record_id
              ON ledger_transactions(contact_record_id);
            `);
          } catch (e) {
            // Index already exists, ignore
          }

          try {
            db.execute(`
              CREATE INDEX IF NOT EXISTS idx_ledger_source_origin_key
              ON ledger_transactions(source_origin_key);
            `);
          } catch (e) {
            // Index already exists, ignore
          }
      
          console.log('Ledger database initialized successfully');
        } catch (error) {
          console.error('Failed to initialize ledger database:', error);
          throw error;
        }
      };
      
      // Create new transaction
      export const createTransaction = (contactRecordId, amount, type, note = '', metadata = {}) => {
        try {
          const db = getDB();
          const timestamp = Date.now();
          const requestedCreatedAt = Number(metadata?.createdAt);
          const createdAtTimestamp =
            Number.isFinite(requestedCreatedAt) && requestedCreatedAt > 0
              ? Math.floor(requestedCreatedAt)
              : timestamp;
          const requestedTimestamp = Number(metadata?.transactionDate);
          const transactionTimestamp =
            Number.isFinite(requestedTimestamp) && requestedTimestamp > 0
              ? Math.floor(requestedTimestamp)
              : timestamp;
          const sourceUserId = String(metadata?.sourceUserId || '').trim();
          const sourceOriginKey = String(metadata?.sourceOriginKey || '').trim();
          const syncTag = String(metadata?.syncTag || '').trim();
          const allowUpsertByOrigin = metadata?.allowUpsertByOrigin !== false;
          const normalizedEditHistoryJson = (() => {
            const incoming = metadata?.editHistory;
            const rawList = Array.isArray(incoming)
              ? incoming
              : typeof incoming === 'string'
              ? (() => {
                  try {
                    const parsed = JSON.parse(incoming);
                    return Array.isArray(parsed) ? parsed : [];
                  } catch (e) {
                    return [];
                  }
                })()
              : [];
            const sanitized = rawList
              .map(value => Number(value))
              .filter(value => Number.isFinite(value) && value >= 0);
            return sanitized.length > 0 ? JSON.stringify(sanitized) : null;
          })();
      
          // Validate amount
          const numAmount = Number(amount);
          if (!numAmount || numAmount <= 0) {
            throw new Error('Amount must be greater than 0');
          }
      
          // Validate type
          if (type !== 'paid' && type !== 'get') {
            throw new Error('Type must be either "paid" or "get"');
          }

          if (sourceOriginKey && allowUpsertByOrigin) {
            const existing = db.execute(
              `SELECT id FROM ledger_transactions
               WHERE source_origin_key = ? AND COALESCE(is_deleted, 0) = 0
               LIMIT 1`,
              [sourceOriginKey]
            );
            const existingRows = existing.rows?._array || [];
            if (existingRows.length > 0) {
              const existingId = Number(existingRows[0]?.id);
               db.execute(
                 `UPDATE ledger_transactions
                 SET contact_record_id = ?, amount = ?, type = ?, note = ?, source_user_id = ?, transaction_date = ?, sync_tag = COALESCE(?, sync_tag), edit_history = COALESCE(?, edit_history)
                 WHERE id = ?`,
                 [
                   String(contactRecordId),
                   numAmount,
                   type,
                   note || '',
                   sourceUserId || null,
                   transactionTimestamp,
                   syncTag || null,
                   normalizedEditHistoryJson,
                   existingId,
                 ]
               );
              return {success: true, insertId: existingId, updated: true};
            }
          }

          const result = db.execute(
            `INSERT INTO ledger_transactions (contact_record_id, amount, type, note, source_user_id, source_origin_key, sync_tag, transaction_date, created_at, edit_history)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              String(contactRecordId),
              numAmount,
              type,
              note || '',
              sourceUserId || null,
              sourceOriginKey || null,
              syncTag || null,
              transactionTimestamp,
              createdAtTimestamp,
              normalizedEditHistoryJson,
            ]
          );
      
          console.log('Transaction created successfully for contact:', contactRecordId);
          return {success: true, insertId: result.insertId};
        } catch (error) {
          console.error('Failed to create transaction:', error);
          throw error;
        }
      };
      
      // Get all transactions for a specific contact
      export const getTransactionsByContact = contactRecordId => {
        try {
          const db = getDB();
          const result = db.execute(
            `SELECT * FROM ledger_transactions
             WHERE contact_record_id = ?
             ORDER BY transaction_date ASC`,
            [String(contactRecordId)]
          );
      
          return result.rows?._array || [];
        } catch (error) {
          console.error('Failed to get transactions:', error);
          return [];
        }
      };
      
      // Calculate net balance for a contact
      // Positive balance = Contact owes you (you paid more than received)
      // Negative balance = You owe contact (you received more than paid)
      export const calculateContactBalance = contactRecordId => {
        try {
          const transactions = getTransactionsByContact(contactRecordId);
      
          let totalPaid = 0;  // Money you gave to contact (udhar diya)
          let totalGet = 0;   // Money you received back from contact (wapas liya)
      
          transactions.forEach(txn => {
            if (Number(txn.is_deleted) === 1) {
              return;
            }
            const amount = Number(txn.amount) || 0;
            if (txn.type === 'paid') {
              totalPaid += amount;
            } else if (txn.type === 'get') {
              totalGet += amount;
            }
          });
      
          // Net balance = Total Paid - Total Received
          // Positive = Contact owes you
          // Negative = You owe contact
          const netBalance = totalPaid - totalGet;
      
          return {
            netBalance,
            totalPaid,
            totalGet,
            transactionCount: transactions.filter(txn => Number(txn.is_deleted) !== 1).length,
          };
        } catch (error) {
          console.error('Failed to calculate balance:', error);
          return {
            netBalance: 0,
            totalPaid: 0,
            totalGet: 0,
            transactionCount: 0,
          };
        }
      };
      
      // Get balances for all contacts (for displaying in list)
      export const getAllContactBalances = () => {
        try {
          const db = getDB();
          const result = db.execute(`
            SELECT
              contact_record_id,
              SUM(CASE WHEN type = 'paid' THEN amount ELSE 0 END) as total_paid,
              SUM(CASE WHEN type = 'get' THEN amount ELSE 0 END) as total_get,
              COUNT(*) as transaction_count
            FROM ledger_transactions
            WHERE COALESCE(is_deleted, 0) = 0
            GROUP BY contact_record_id
          `);
      
          const balances = {};
          const rows = result.rows?._array || [];
      
          rows.forEach(row => {
            const totalPaid = Number(row.total_paid) || 0;
            const totalGet = Number(row.total_get) || 0;
            const netBalance = totalPaid - totalGet;
      
            balances[row.contact_record_id] = {
              netBalance,
              totalPaid,
              totalGet,
              transactionCount: row.transaction_count,
            };
          });
      
          return balances;
        } catch (error) {
          console.error('Failed to get all contact balances:', error);
          return {};
        }
      };
      
      
      // Update transaction amount (for ledger entry edits)
      export const updateLedgerTransactionAmount = (transactionId, nextAmount, nextEditCount) => {
        try {
          const db = getDB();
          const currentTxnResult = db.execute(
            'SELECT amount, edit_history FROM ledger_transactions WHERE id = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1',
            [Number(transactionId)]
          );
          const currentTxn = currentTxnResult.rows?._array?.[0] || null;
          if (!currentTxn) {
            return {success: false};
          }

          const previousHistory = (() => {
            try {
              const parsed = JSON.parse(String(currentTxn.edit_history || '[]'));
              return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              return [];
            }
          })();

          const oldAbs = Math.abs(Number(currentTxn.amount) || 0);
          const newAbs = Math.abs(Number(nextAmount) || 0);
          const nextHistory =
            previousHistory.length > 0
              ? [...previousHistory, newAbs]
              : [oldAbs, newAbs];

          db.execute(
            'UPDATE ledger_transactions SET amount = ?, edit_count = ?, edit_history = ? WHERE id = ? AND COALESCE(is_deleted, 0) = 0',
            [
              Number(nextAmount),
              Number(nextEditCount || 0),
              JSON.stringify(nextHistory),
              Number(transactionId),
            ]
          );
          return {success: true};
        } catch (error) {
          console.error('Failed to update ledger transaction amount:', error);
          throw error;
        }
      };

      // Update transaction note (for ledger entry edits)
      export const updateLedgerTransactionNote = (transactionId, nextNote) => {
        try {
          const db = getDB();
          db.execute(
            'UPDATE ledger_transactions SET note = ? WHERE id = ? AND COALESCE(is_deleted, 0) = 0',
            [String(nextNote || ''), Number(transactionId)]
          );
          return {success: true};
        } catch (error) {
          console.error('Failed to update ledger transaction note:', error);
          throw error;
        }
      };

// Delete a transaction
      export const deleteTransaction = transactionId => {
        try {
          const db = getDB();
          db.execute('UPDATE ledger_transactions SET is_deleted = 1 WHERE id = ?', [
            Number(transactionId),
          ]);
          console.log('Transaction soft-deleted successfully:', transactionId);
          return {success: true};
        } catch (error) {
          console.error('Failed to delete transaction:', error);
          throw error;
        }
      };
      
      // Delete all transactions for a specific contact
      
      export const deleteContactAndTransactions = contactRecordId => {
      
        try {
      
          const db = getDB();
      
          db.execute('DELETE FROM ledger_transactions WHERE contact_record_id = ?', [
      
            String(contactRecordId),
      
          ]);
      
          console.log(
      
            `All transactions for contact ${contactRecordId} deleted successfully.`
      
          );
      
          // Also delete any stored name for this contact
      
          deleteContactName(contactRecordId);
      
          return {success: true};
      
        } catch (error) {
      
          console.error(`Failed to delete transactions for contact ${contactRecordId}:`, error);
      
          throw error;
      
        }
      
      };
      
      
      
      // Clear all ledger data
      
      export const clearAllLedgerData = async () => {
      
        try {
      
          const db = getDB();
      
          db.execute('DELETE FROM ledger_transactions');
      
          db.execute('DELETE FROM contact_names');

      
          console.log('All ledger data cleared successfully.');
      
          return {success: true};
      
        } catch (error) {
      
          console.error('Failed to clear all ledger data:', error);
      
          throw error;
      
        }
      
      };
      
      
      
      
      
      // Get transaction by ID
      export const getTransactionById = transactionId => {
        try {
          const db = getDB();
          const result = db.execute(
            'SELECT * FROM ledger_transactions WHERE id = ?',
            [transactionId]
          );
      
          const rows = result.rows?._array || [];
          return rows.length > 0 ? rows[0] : null;
        } catch (error) {
          console.error('Failed to get transaction:', error);
          return null;
        }
      };

      // Set (insert or update) a display name for a contact
      export const setContactName = (contactRecordId, displayName) => {
        try {
          const db = getDB();
          const timestamp = Date.now();
          db.execute(
            `INSERT OR REPLACE INTO contact_names (contact_record_id, display_name, created_at, updated_at)
             VALUES (?, ?, COALESCE((SELECT created_at FROM contact_names WHERE contact_record_id = ?), ?), ?)`,
            [String(contactRecordId), displayName, String(contactRecordId), timestamp, timestamp]
          );
          console.log(`Contact name set for contact ${contactRecordId}: ${displayName}`);
          return {success: true};
        } catch (error) {
          console.error(`Failed to set contact name for contact ${contactRecordId}:`, error);
          throw error;
        }
      };

      // Get a display name for a contact
      export const getContactName = contactRecordId => {
        try {
          const db = getDB();
          const result = db.execute(
            'SELECT display_name FROM contact_names WHERE contact_record_id = ?',
            [String(contactRecordId)]
          );
          const rows = result.rows?._array || [];
          return rows.length > 0 ? rows[0].display_name : null;
        } catch (error) {
          console.error(`Failed to get contact name for contact ${contactRecordId}:`, error);
          return null;
        }
      };

      // Delete a contact name
      export const deleteContactName = contactRecordId => {
        try {
          const db = getDB();
          db.execute('DELETE FROM contact_names WHERE contact_record_id = ?', [
            String(contactRecordId),
          ]);
          console.log(`Contact name deleted for contact ${contactRecordId}.`);
          return {success: true};
        } catch (error) {
          console.error(`Failed to delete contact name for contact ${contactRecordId}:`, error);
          throw error;
        }
      };

      // Get total statistics (optional - for dashboard/reports)
      export const getLedgerStatistics = () => {
        try {
          const db = getDB();
          const result = db.execute(`
            SELECT
              COUNT(DISTINCT contact_record_id) as total_contacts,
              COUNT(*) as total_transactions,
              SUM(CASE WHEN type = 'paid' THEN amount ELSE 0 END) as total_paid,
              SUM(CASE WHEN type = 'get' THEN amount ELSE 0 END) as total_get
            FROM ledger_transactions
            WHERE COALESCE(is_deleted, 0) = 0
          `);
      
          const rows = result.rows?._array || [];
          if (rows.length > 0) {
            const row = rows[0];
            const totalPaid = Number(row.total_paid) || 0;
            const totalGet = Number(row.total_get) || 0;
      
            return {
              totalContacts: row.total_contacts || 0,
              totalTransactions: row.total_transactions || 0,
              totalPaid,
              totalGet,
              netBalance: totalPaid - totalGet,
            };
          }
      
          return {
            totalContacts: 0,
            totalTransactions: 0,
            totalPaid: 0,
            totalGet: 0,
            netBalance: 0,
          };
        } catch (error) {
          console.error('Failed to get statistics:', error);
          return {
            totalContacts: 0,
            totalTransactions: 0,
            totalPaid: 0,
            totalGet: 0,
            netBalance: 0,
          };
        }
      };

      // Get latest transaction date for each contact (for sorting)
      export const getLatestTransactionDateByContact = () => {
        try {
          const db = getDB();
          const result = db.execute(`
            SELECT
              contact_record_id,
              MAX(transaction_date) as latest_date
            FROM ledger_transactions
            WHERE COALESCE(is_deleted, 0) = 0
            GROUP BY contact_record_id
          `);

          const latestDates = {};
          const rows = result.rows?._array || [];

          rows.forEach(row => {
            latestDates[row.contact_record_id] = row.latest_date || 0;
          });

          return latestDates;
        } catch (error) {
          console.error('Failed to get latest transaction dates:', error);
          return {};
        }
      };

      /**
       * Get latest transaction per contact (batch)
       * Returns: { recordId: { amount, type, note, timestamp } }
       */
      export const getLatestTransactionByContact = () => {
        try {
          const db = getDB();
          const result = db.execute(`
            SELECT lt.contact_record_id, lt.amount, lt.type, lt.note, lt.transaction_date
            FROM ledger_transactions lt
            INNER JOIN (
              SELECT contact_record_id, MAX(transaction_date) as max_date
              FROM ledger_transactions
              WHERE COALESCE(is_deleted, 0) = 0
              GROUP BY contact_record_id
            ) latest
            ON lt.contact_record_id = latest.contact_record_id
            AND lt.transaction_date = latest.max_date
            WHERE COALESCE(lt.is_deleted, 0) = 0
          `);
          const map = {};
          (result.rows?._array || []).forEach(row => {
            if (row.contact_record_id) {
              map[row.contact_record_id] = {
                amount: row.amount || 0,
                type: row.type || '',
                note: String(row.note || '').trim(),
                timestamp: row.transaction_date || 0,
              };
            }
          });
          return map;
        } catch (_) {
          return {};
        }
      };

      // Get distinct contact IDs that have ledger transactions
export const getDistinctContactRecordIds = () => {
        try {
          const db = getDB();
          const result = db.execute(`
            SELECT DISTINCT contact_record_id
            FROM ledger_transactions
          `);
          const rows = result.rows?._array || [];
          return rows
            .map(row => String(row.contact_record_id || '').trim())
            .filter(Boolean);
        } catch (error) {
          console.error('Failed to get distinct contact IDs:', error);
          return [];
        }
      };

      // Remap old contact_record_id values to canonical IDs across ledger tables.
      export const remapLedgerContactRecordIds = (remapPairs = []) => {
        try {
          const pairs = Array.isArray(remapPairs)
            ? remapPairs
                .map(item => [String(item?.[0] || '').trim(), String(item?.[1] || '').trim()])
                .filter(([fromId, toId]) => fromId && toId && fromId !== toId)
            : [];
          if (!pairs.length) {
            return {
              success: true,
              updatedTransactions: 0,
              updatedContactNames: 0,
              mergedContactNames: 0,
            };
          }

          const db = getDB();
          let updatedTransactions = 0;
          let updatedContactNames = 0;
          let mergedContactNames = 0;
          const now = Date.now();

          db.execute('BEGIN TRANSACTION');
          try {
            pairs.forEach(([fromId, toId]) => {
              const txResult = db.execute(
                'UPDATE ledger_transactions SET contact_record_id = ? WHERE contact_record_id = ?',
                [toId, fromId],
              );
              updatedTransactions += Number(txResult?.rowsAffected || 0);

              const existingToName = db.execute(
                'SELECT contact_record_id FROM contact_names WHERE contact_record_id = ? LIMIT 1',
                [toId],
              );
              const hasTargetName = (existingToName?.rows?._array || []).length > 0;
              if (hasTargetName) {
                const deleteResult = db.execute(
                  'DELETE FROM contact_names WHERE contact_record_id = ?',
                  [fromId],
                );
                mergedContactNames += Number(deleteResult?.rowsAffected || 0);
              } else {
                const nameResult = db.execute(
                  'UPDATE contact_names SET contact_record_id = ?, updated_at = ? WHERE contact_record_id = ?',
                  [toId, now, fromId],
                );
                updatedContactNames += Number(nameResult?.rowsAffected || 0);
              }
            });
            db.execute('COMMIT');
          } catch (error) {
            db.execute('ROLLBACK');
            throw error;
          }

          return {
            success: true,
            updatedTransactions,
            updatedContactNames,
            mergedContactNames,
          };
        } catch (error) {
          console.error('Failed to remap ledger contact record IDs:', error);
          throw error;
        }
      };

      // Get unified timeline: transactions + messages merged chronologically.
      // Limit is optional; omit it when the full local history should stay visible.
      export const getUnifiedTimeline = (contactRecordId, messages = [], limit = null, offset = 0) => {
        try {
          const db = getDB();

          const safeLimit = Number(limit);
          const shouldLimit = Number.isFinite(safeLimit) && safeLimit > 0;
          
          const txQuery = shouldLimit
            ? `SELECT * FROM ledger_transactions
               WHERE contact_record_id = ?
               ORDER BY transaction_date DESC LIMIT ?`
            : `SELECT * FROM ledger_transactions
               WHERE contact_record_id = ?
               ORDER BY transaction_date ASC`;
          
          const txParams = shouldLimit ? [String(contactRecordId), safeLimit] : [String(contactRecordId)];
          const result = db.execute(txQuery, txParams);

          const transactionRows = result.rows?._array || [];

          const transactionItems = transactionRows.map(transaction => ({
            id: `txn-${transaction.id}`,
            type: 'transaction',
            timestamp: transaction.transaction_date,
            data: transaction,
          }));

          const messageItems = (messages || []).map(message => ({
            id: `msg-${message.message_id || message.id}`,
            type: 'message',
            timestamp: message.timestamp,
            data: message,
          })).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

          const safeOffset = Math.max(0, Number(offset) || 0);
          const pagedMessageItems =
            shouldLimit
              ? (() => {
                  const messageEndIndex = Math.max(0, messageItems.length - safeOffset);
                  const messageStartIndex = Math.max(
                    0,
                    messageEndIndex - Math.floor(safeLimit),
                  );
                  return messageItems.slice(messageStartIndex, messageEndIndex);
                })()
              : messageItems;

          const merged = [...transactionItems, ...pagedMessageItems];
          merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

          return merged;
        } catch (error) {
          console.error('Failed to get unified timeline:', error);
          return [];
        }
      };



