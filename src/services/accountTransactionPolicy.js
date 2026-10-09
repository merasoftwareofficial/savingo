import {findLinkedTransaction} from './transactionLinkResolver';
import {
  canDeleteWithoutNegativeWithEntries,
  explainDeleteNegativeDependencyWithEntries,
} from './transactionTimeline';
import {getTransactionsByAccount} from './transactionsDatabase';

export const evaluateAccountTransactionDelete = ({
  txn,
  transactions = [],
  currentAccountId,
  strictEcoEnabled = true,
  isLockedTransaction = () => false,
  isBlockedTransaction = () => false,
  debugTag,
}) => {
  if (!txn) {
    return {allowed: false, reason: 'missing_transaction', linkedTransaction: null};
  }
  if (isBlockedTransaction(txn)) {
    return {allowed: false, reason: 'blocked_transaction', linkedTransaction: null};
  }
  if (Number(txn?.is_deleted) === 1) {
    return {allowed: false, reason: 'deleted_transaction', linkedTransaction: null};
  }
  const amount = Number(txn?.amount);
  if (!Number.isFinite(amount)) {
    return {allowed: false, reason: 'invalid_amount', linkedTransaction: null};
  }

  let linkedTransaction = null;
  const linkedEntryExpected = isLockedTransaction(txn);
  if (linkedEntryExpected) {
    linkedTransaction = findLinkedTransaction(txn, currentAccountId);
  }
  const orphanCleanupCase = linkedEntryExpected && !linkedTransaction;

  if (!strictEcoEnabled) {
    return {
      allowed: true,
      reason: null,
      linkedTransaction,
      dependency: null,
      isCleanupCase: orphanCleanupCase,
    };
  }

  if (orphanCleanupCase) {
    return {
      allowed: true,
      reason: null,
      linkedTransaction: null,
      dependency: null,
      isCleanupCase: true,
    };
  }

  const shouldValidateDeleteForEntry = entry =>
    Number(entry?.is_deleted) !== 1 && (Number(entry?.amount) || 0) > 0;

  if (shouldValidateDeleteForEntry(txn)) {
    const currentEntries =
      Array.isArray(transactions) && transactions.length > 0
        ? transactions
        : getTransactionsByAccount(currentAccountId);
    if (
      !canDeleteWithoutNegativeWithEntries(currentEntries, txn.id, {
        debugTag,
      })
    ) {
      const dependency = explainDeleteNegativeDependencyWithEntries(
        currentEntries,
        txn.id,
        {debugTag},
      );
      return {
        allowed: false,
        reason: 'running_balance_negative_current_account',
        linkedTransaction,
        dependency,
        isCleanupCase: false,
      };
    }
  }

  if (shouldValidateDeleteForEntry(linkedTransaction)) {
    const linkedEntries = getTransactionsByAccount(linkedTransaction.account_id);
    if (
      !canDeleteWithoutNegativeWithEntries(linkedEntries, linkedTransaction.id, {
        debugTag: debugTag ? `${debugTag}-LINKED` : undefined,
      })
    ) {
      const dependency = explainDeleteNegativeDependencyWithEntries(
        linkedEntries,
        linkedTransaction.id,
        {
          debugTag: debugTag ? `${debugTag}-LINKED` : undefined,
        },
      );
      return {
        allowed: false,
        reason: 'running_balance_negative_linked_account',
        linkedTransaction,
        dependency: dependency
          ? {...dependency, accountId: linkedTransaction.account_id}
          : null,
        isCleanupCase: false,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    linkedTransaction,
    dependency: null,
    isCleanupCase: false,
  };
};

export const canDeleteAccountTransaction = options =>
  evaluateAccountTransactionDelete(options).allowed;
