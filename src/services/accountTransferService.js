/**
 * Account Transfer Service
 *
 * Single source of truth for all account-to-account transfers.
 * Handles validation, execution, and verification of transfers
 * between any accounts (Earning, Credit, Expenses, Saving).
 *
 * Reusable across: Withdrawal flows, Transfer flows, Ledger, Future features
 */

import {
  calculateAccountBalance,
  getTransactionsByAccount,
} from './transactionsDatabase';
import {
  getBalanceAtTimestampWithEntries,
  canWithdrawAtTimestampWithEntries,
} from './transactionTimeline';
import {createTransaction} from './transactionsDatabase';

/**
 * Validates if a source account can transfer a given amount
 *
 * Checks:
 * 1. Account exists and is valid
 * 2. Account type allows transfers (earning, credit, saving)
 * 3. Current balance >= amount
 * 4. (Optional) Balance at timestamp >= amount (timeline validation)
 *
 * @param {Object} sourceAccount - Account to transfer from
 * @param {number} amount - Amount to transfer
 * @param {Array} sourceTransactions - Transactions in source account (optional)
 * @param {number} timestamp - Date of transfer in ms (optional, for timeline check)
 * @returns {Object} {valid: boolean, error: string|null}
 *
 * @example
 * const result = validateTransferSource(myAccount, 1000, [], Date.now());
 * if (!result.valid) console.log(result.error);
 */
export const validateTransferSource = (
  sourceAccount,
  amount,
  sourceTransactions = [],
  timestamp = null
) => {
  try {
    // Validate account exists
    if (!sourceAccount || !sourceAccount.id) {
      return {valid: false, error: 'Source account not found'};
    }

    // Validate account type (allow earning, credit, saving as sources)
    const validSourceTypes = ['earning', 'credit', 'saving'];
    const accountType = String(sourceAccount.account_type || '').toLowerCase();
    if (!validSourceTypes.includes(accountType)) {
      return {
        valid: false,
        error: `Cannot transfer from ${accountType} accounts`,
      };
    }

    // Validate amount is positive
    const transferAmount = Math.abs(amount);
    if (transferAmount <= 0) {
      return {valid: false, error: 'Transfer amount must be greater than zero'};
    }

    // Check current balance
    const currentBalance = calculateAccountBalance(sourceAccount.id);
    if (currentBalance < transferAmount) {
      return {
        valid: false,
        error: `Insufficient balance. Available: ${currentBalance}, Need: ${transferAmount}`,
      };
    }

    // Timeline validation (if timestamp and transactions provided)
    if (timestamp !== null && sourceTransactions && sourceTransactions.length >= 0) {
      const balanceAtTime = getBalanceAtTimestampWithEntries(
        sourceTransactions,
        timestamp
      );
      if (balanceAtTime < transferAmount) {
        return {
          valid: false,
          error: `Balance was insufficient at that time (had ${balanceAtTime}, need ${transferAmount})`,
        };
      }
    }

    return {valid: true, error: null};
  } catch (error) {
    console.error('Error validating transfer source:', error);
    return {valid: false, error: 'Validation failed: ' + error.message};
  }
};

/**
 * Executes a transfer between two accounts
 *
 * Creates TWO linked transaction entries:
 * 1. Debit in source account (negative)
 * 2. Credit in destination account (positive)
 *
 * Both transactions use matching remarks indicating the transfer.
 * Balances are automatically updated via transaction creation.
 *
 * @param {Object} sourceAccount - Account to transfer from
 * @param {Object} destinationAccount - Account to transfer to
 * @param {number} amount - Amount to transfer
 * @param {string} note - Optional transfer note/remark
 * @param {number} timestamp - Date of transfer in ms
 * @returns {Promise<Object>} {success: boolean, error: string|null}
 *
 * @example
 * const result = await executeAccountTransfer(
 *   earningAccount,
 *   expenseAccount,
 *   500,
 *   'Emergency fund',
 *   Date.now()
 * );
 */
export const executeAccountTransfer = async (
  sourceAccount,
  destinationAccount,
  amount,
  note = '',
  timestamp = Date.now()
) => {
  try {
    // Validate both accounts exist
    if (!sourceAccount?.id || !destinationAccount?.id) {
      return {success: false, error: 'Invalid source or destination account'};
    }

    const transferAmount = Math.abs(amount);

    // Validate source account
    const validation = validateTransferSource(
      sourceAccount,
      transferAmount,
      getTransactionsByAccount(sourceAccount.id),
      timestamp
    );
    if (!validation.valid) {
      return {success: false, error: validation.error};
    }

    // Build remarks (with note if provided)
    const trimmedNote = String(note || '').trim();
    const sourceRemark = trimmedNote
      ? `Transferred to ${destinationAccount.account_name} - ${trimmedNote}`
      : `Transferred to ${destinationAccount.account_name}`;
    const destRemark = trimmedNote
      ? `Transferred from ${sourceAccount.account_name} - ${trimmedNote}`
      : `Transferred from ${sourceAccount.account_name}`;

    // Create source debit transaction
    await createTransaction(
      sourceAccount.id,
      -transferAmount,  // Negative = debit/outflow
      sourceRemark,
      timestamp
    );

    // Create destination credit transaction
    await createTransaction(
      destinationAccount.id,
      transferAmount,   // Positive = credit/inflow
      destRemark,
      timestamp
    );

    return {success: true, error: null};
  } catch (error) {
    console.error('Transfer execution failed:', error);
    return {success: false, error: 'Transfer failed: ' + error.message};
  }
};

/**
 * Get list of accounts available as transfer sources
 *
 * Filters accounts by:
 * 1. Type (only earning, credit, saving)
 * 2. Minimum balance requirement
 * 3. Excluded account IDs (don't include self)
 *
 * Useful for: UI account pickers, validation, transfer source selection
 *
 * @param {number} minBalance - Minimum balance required (default: 0)
 * @param {Array} excludeAccountIds - Account IDs to skip (optional)
 * @param {function} getAllAccounts - Function to get all accounts (required)
 * @returns {Array} List of valid transfer source accounts
 *
 * @example
 * const sources = getAvailableTransferSources(300, [currentAccountId], getAllAccounts);
 * // Returns accounts that have balance >= 300 and aren't current account
 */
export const getAvailableTransferSources = (
  getAllAccounts,
  minBalance = 0,
  excludeAccountIds = []
) => {
  try {
    const allAccounts = getAllAccounts();
    const validTypes = ['earning', 'credit', 'saving'];
    const excludeSet = new Set(excludeAccountIds);

    const sources = allAccounts.filter(account => {
      // Check account type
      if (!validTypes.includes(String(account.account_type || '').toLowerCase())) {
        return false;
      }

      // Check not excluded
      if (excludeSet.has(account.id)) {
        return false;
      }

      // Check balance requirement
      if (minBalance > 0) {
        const balance = calculateAccountBalance(account.id);
        if (balance < minBalance) {
          return false;
        }
      }

      return true;
    });

    return sources;
  } catch (error) {
    console.error('Failed to get transfer sources:', error);
    return [];
  }
};

/**
 * Check if source account can be used for a specific transfer
 *
 * Quick validation without full error details.
 * Useful for: UI enable/disable logic, quick checks
 *
 * @param {Object} sourceAccount - Account to check
 * @param {number} amount - Amount to transfer
 * @returns {boolean} True if account can be source for this amount
 *
 * @example
 * if (canUseAsTransferSource(account, 500)) {
 *   // Enable this account in picker
 * }
 */
export const canUseAsTransferSource = (sourceAccount, amount) => {
  const validation = validateTransferSource(sourceAccount, amount, []);
  return validation.valid;
};

/**
 * Get transfer source account by ID with validation
 *
 * Retrieves account and validates it's a valid transfer source
 *
 * @param {string} accountId - Account ID to retrieve
 * @param {function} getAccountById - Function to get account
 * @returns {Object} {account: Object|null, valid: boolean, error: string|null}
 */
export const getTransferSourceAccount = (getAccountById, accountId) => {
  try {
    if (!accountId) {
      return {account: null, valid: false, error: 'Account ID required'};
    }

    const account = getAccountById(accountId);
    if (!account) {
      return {account: null, valid: false, error: 'Account not found'};
    }

    const isValidSource = ['earning', 'credit', 'saving'].includes(
      String(account.account_type || '').toLowerCase()
    );

    if (!isValidSource) {
      return {
        account,
        valid: false,
        error: `Account type '${account.account_type}' cannot be used as transfer source`,
      };
    }

    return {account, valid: true, error: null};
  } catch (error) {
    console.error('Error getting transfer source account:', error);
    return {account: null, valid: false, error: error.message};
  }
};
