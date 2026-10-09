/**
 * Withdrawal Service
 *
 * Handles withdrawal logic with optional auto-funding from another account.
 * Provides core withdrawal operations that work with or without transfers.
 *
 * Separation of concerns:
 * - withdrawalService: handles withdrawal + transfer logic
 * - accountTransferService: handles pure transfer logic
 *
 * Reusable by: Expense Account, Amount Entry, Future features
 */

import {
  calculateAccountBalance,
  createTransaction,
  getTransactionsByAccount,
} from './transactionsDatabase';
import {
  getBalanceAtTimestampWithEntries,
  canWithdrawAtTimestampWithEntries,
} from './transactionTimeline';
import {
  validateTransferSource,
  executeAccountTransfer,
  canUseAsTransferSource,
} from './accountTransferService';

/**
 * Check if a withdrawal requires external funding
 *
 * Determines if:
 * 1. Account has sufficient balance (direct withdrawal OK)
 * 2. Account needs external source (shortfall exists)
 *
 * Useful for: UI logic (show/hide modal), withdrawal planning
 *
 * @param {Object} account - Account to withdraw from
 * @param {number} amount - Withdrawal amount
 * @param {Array} transactions - Transactions in account (optional)
 * @param {number} timestamp - Date to check at (optional, for timeline)
 * @returns {Object} {needsSource: boolean, shortfall: number, balanceAtTime: number}
 *
 * @example
 * const result = checkWithdrawalRequiresSource(account, 500, [], Date.now());
 * if (result.needsSource) {
 *   // Show modal for account selection
 * }
 */
export const checkWithdrawalRequiresSource = (
  account,
  amount,
  transactions = [],
  timestamp = Date.now()
) => {
  try {
    const withdrawAmount = Math.abs(amount);

    // Get balance at timestamp (for timeline validation)
    const balanceAtTime = transactions.length > 0
      ? getBalanceAtTimestampWithEntries(transactions, timestamp)
      : calculateAccountBalance(account.id);

    // Calculate shortfall
    const shortfall = Math.max(0, withdrawAmount - balanceAtTime);

    return {
      needsSource: shortfall > 0,
      shortfall: shortfall,
      balanceAtTime: balanceAtTime,
    };
  } catch (error) {
    console.error('Error checking withdrawal requirement:', error);
    return {needsSource: false, shortfall: 0, balanceAtTime: 0};
  }
};

/**
 * Execute withdrawal (with optional auto-funding from source account)
 *
 * Three scenarios:
 * 1. Sufficient balance → Direct withdrawal only
 * 2. Shortfall + source provided → Transfer then withdraw
 * 3. Shortfall + no source → Return shortfall info, let caller handle
 *
 * @param {Object} account - Account to withdraw from
 * @param {number} amount - Withdrawal amount
 * @param {string} note - Withdrawal note/remark
 * @param {Object} sourceAccount - Source account for transfer (optional)
 * @param {number} timestamp - Date of withdrawal
 * @param {Array} transactions - Account transactions (optional)
 * @param {string} receiptPath - Receipt file path (optional)
 * @returns {Promise<Object>} {
 *   success: boolean,
 *   shortfall: number,
 *   sourceRequired: boolean,
 *   sourceUsed: string|null,
 *   message: string,
 *   error: string|null
 * }
 *
 * @example
 * // Case 1: Direct withdrawal (enough balance)
 * const result = await executeWithdrawal(
 *   expenseAccount,
 *   500,
 *   'Groceries',
 *   null,  // No source needed
 *   Date.now()
 * );
 *
 * @example
 * // Case 2: With source account (shortfall exists)
 * const result = await executeWithdrawal(
 *   expenseAccount,
 *   500,
 *   'Groceries',
 *   earningAccount,  // Transfer from here first
 *   Date.now(),
 *   transactions
 * );
 *
 * @example
 * // Case 3: Shortfall detected, no source (let caller pick)
 * const result = await executeWithdrawal(
 *   expenseAccount,
 *   500,
 *   'Groceries',
 *   null,
 *   Date.now(),
 *   transactions
 * );
 * if (!result.success && result.sourceRequired) {
 *   // Show modal for user to pick source
 * }
 */
export const executeWithdrawal = async (
  account,
  amount,
  note = '',
  sourceAccount = null,
  timestamp = Date.now(),
  transactions = [],
  receiptPath = ''
) => {
  try {
    // Validate withdrawal amount
    if (!amount || amount <= 0) {
      return {
        success: false,
        shortfall: 0,
        sourceRequired: false,
        sourceUsed: null,
        message: null,
        error: 'Invalid withdrawal amount',
      };
    }

    const withdrawAmount = Math.abs(amount);

    // Get balance at timestamp
    const balanceAtTime = transactions.length > 0
      ? getBalanceAtTimestampWithEntries(transactions, timestamp)
      : calculateAccountBalance(account.id);

    // Calculate shortfall
    const shortfall = Math.max(0, withdrawAmount - balanceAtTime);

    // CASE 1: Sufficient balance - direct withdrawal
    if (shortfall === 0) {
      await createTransaction(
        account.id,
        -withdrawAmount,
        note,
        timestamp,
        receiptPath
      );

      return {
        success: true,
        shortfall: 0,
        sourceRequired: false,
        sourceUsed: null,
        message: 'Withdrawal completed successfully',
        error: null,
      };
    }

    // CASE 2: Shortfall exists - need source account
    if (shortfall > 0) {
      // No source provided - return info, let caller handle
      if (!sourceAccount) {
        return {
          success: false,
          shortfall: shortfall,
          sourceRequired: true,
          sourceUsed: null,
          message: null,
          error: `Insufficient balance. Need ${shortfall} more from another account`,
        };
      }

      // Source provided - validate it
      const validation = validateTransferSource(
        sourceAccount,
        shortfall,
        getTransactionsByAccount(sourceAccount.id),
        timestamp
      );

      if (!validation.valid) {
        return {
          success: false,
          shortfall: shortfall,
          sourceRequired: true,
          sourceUsed: null,
          message: null,
          error: validation.error,
        };
      }

      // Execute transfer from source to account
      const transferResult = await executeAccountTransfer(
        sourceAccount,
        account,
        shortfall,
        note,  // Use same note for transfer
        timestamp
      );

      if (!transferResult.success) {
        return {
          success: false,
          shortfall: shortfall,
          sourceRequired: true,
          sourceUsed: null,
          message: null,
          error: transferResult.error,
        };
      }

      // Transfer succeeded - now execute withdrawal
      await createTransaction(
        account.id,
        -withdrawAmount,
        note,
        timestamp,
        receiptPath
      );

      return {
        success: true,
        shortfall: shortfall,
        sourceRequired: true,
        sourceUsed: sourceAccount.account_name,
        message: `Transfer completed from ${sourceAccount.account_name} and withdrawal recorded`,
        error: null,
      };
    }
  } catch (error) {
    console.error('Withdrawal execution failed:', error);
    return {
      success: false,
      shortfall: 0,
      sourceRequired: false,
      sourceUsed: null,
      message: null,
      error: 'Withdrawal failed: ' + error.message,
    };
  }
};

/**
 * Validate withdrawal can happen at specific timestamp
 *
 * Checks timeline to ensure balance doesn't go negative at that point
 *
 * @param {Object} account - Account to withdraw from
 * @param {number} amount - Withdrawal amount
 * @param {Array} transactions - Account transactions
 * @param {number} timestamp - Date to check
 * @returns {boolean} True if withdrawal allowed at this timestamp
 */
export const canWithdrawAtTimestamp = (
  account,
  amount,
  transactions = [],
  timestamp = Date.now()
) => {
  try {
    const withdrawAmount = Math.abs(amount);

    if (transactions.length === 0) {
      const balance = calculateAccountBalance(account.id);
      return balance >= withdrawAmount;
    }

    // Create pending withdrawal entry for validation
    const pendingEntries = [
      {
        id: 'pending-withdrawal',
        amount: -withdrawAmount,
        transaction_date: timestamp,
        is_deleted: 0,
        orderIndex: 0,
      },
    ];

    return canWithdrawAtTimestampWithEntries(
      withdrawAmount,
      timestamp,
      transactions,
      pendingEntries
    );
  } catch (error) {
    console.error('Error validating withdrawal timestamp:', error);
    return false;
  }
};

/**
 * Get withdrawal summary (for UI display)
 *
 * Returns detailed info about a planned withdrawal
 *
 * @param {Object} account - Account details
 * @param {number} amount - Withdrawal amount
 * @param {Array} transactions - Account transactions
 * @returns {Object} {
 *   account: Object,
 *   amount: number,
 *   currentBalance: number,
 *   balanceAfter: number,
 *   hasShortfall: boolean,
 *   shortfall: number
 * }
 */
export const getWithdrawalSummary = (account, amount, transactions = []) => {
  try {
    const withdrawAmount = Math.abs(amount);
    const currentBalance = calculateAccountBalance(account.id);
    const balanceAfter = Math.max(0, currentBalance - withdrawAmount);
    const shortfall = Math.max(0, withdrawAmount - currentBalance);

    return {
      account: account,
      amount: withdrawAmount,
      currentBalance: currentBalance,
      balanceAfter: balanceAfter,
      hasShortfall: shortfall > 0,
      shortfall: shortfall,
    };
  } catch (error) {
    console.error('Error getting withdrawal summary:', error);
    return null;
  }
};

/**
 * Validate withdrawal is allowed (comprehensive check)
 *
 * Checks:
 * 1. Amount is valid
 * 2. Account exists
 * 3. Account type allows withdrawal
 * 4. Timeline validation passes
 *
 * @param {Object} account - Account to withdraw from
 * @param {number} amount - Withdrawal amount
 * @param {Array} transactions - Account transactions
 * @param {number} timestamp - Date of withdrawal
 * @returns {Object} {valid: boolean, error: string|null}
 */
export const validateWithdrawal = (
  account,
  amount,
  transactions = [],
  timestamp = Date.now()
) => {
  try {
    // Check account
    if (!account || !account.id) {
      return {valid: false, error: 'Account not found'};
    }

    // Check amount
    if (!amount || amount <= 0) {
      return {valid: false, error: 'Invalid withdrawal amount'};
    }

    // Check account type (expenses, saving, earning, credit allow withdrawal)
    const validTypes = ['earning', 'expenses', 'saving', 'credit'];
    const accountType = String(account.account_type || '').toLowerCase();
    if (!validTypes.includes(accountType)) {
      return {valid: false, error: `${accountType} accounts cannot be withdrawn from`};
    }

    // Timeline validation
    if (!canWithdrawAtTimestamp(account, amount, transactions, timestamp)) {
      return {
        valid: false,
        error: 'Withdrawal not allowed at this date (balance was insufficient)',
      };
    }

    return {valid: true, error: null};
  } catch (error) {
    console.error('Error validating withdrawal:', error);
    return {valid: false, error: 'Validation failed: ' + error.message};
  }
};
