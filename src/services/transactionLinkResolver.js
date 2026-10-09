import {getAccountsByType} from './accountsDatabase';
import {getTransactionsByAccount} from './transactionsDatabase';
import {
  getLinkedRemarkType,
  extractLinkedAccountName,
  isLinkedRemarkPair,
} from '../utils/transactionRemarkHelpers';

// Finds the linked transaction in any account (earning, expenses, saving)
// that corresponds to a transfer/request entry in the current account.
// currentAccountId is excluded from the search to avoid self-match.
const findLinkedTransaction = (txn, currentAccountId) => {
  if (!txn) {
    return null;
  }
  const remark = String(txn.remark || '').trim();
  if (!remark) {
    return null;
  }
  const amountValue = Math.abs(Number(txn.amount) || 0);
  if (!amountValue) {
    return null;
  }
  const txnAmount = Number(txn.amount) || 0;
  const txnType = getLinkedRemarkType(remark);
  const preferredLinkedName = extractLinkedAccountName(remark);

  const allAccounts = [
    ...getAccountsByType('earning'),
    ...getAccountsByType('expenses'),
    ...getAccountsByType('saving'),
    ...getAccountsByType('credit'),
  ].filter(a => String(a.id) !== String(currentAccountId));

  const pickBestMatch = accountsList => {
    let bestMatch = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    accountsList.forEach(linkedAccount => {
      const linkedTxns = getTransactionsByAccount(linkedAccount.id);
      linkedTxns.forEach(entry => {
        if (Number(entry?.is_deleted) === 1) {
          return;
        }
        const entryAmountNumeric = Number(entry.amount) || 0;
        const entryAmountAbs = Math.abs(entryAmountNumeric);
        if (entryAmountAbs !== amountValue) {
          return;
        }
        if (
          txnAmount !== 0 &&
          entryAmountNumeric !== 0 &&
          Math.sign(txnAmount) === Math.sign(entryAmountNumeric)
        ) {
          return;
        }
        const entryType = getLinkedRemarkType(entry.remark);
        if (!isLinkedRemarkPair(txnType, entryType)) {
          return;
        }
        const delta = Math.abs(
          Number(entry.transaction_date) - Number(txn.transaction_date)
        );
        if (
          delta < bestDelta ||
          (delta === bestDelta &&
            String(entry.id).localeCompare(String(bestMatch?.id || '')) < 0)
        ) {
          bestDelta = delta;
          bestMatch = entry;
        }
      });
    });
    return bestMatch;
  };

  const preferredAccounts =
    preferredLinkedName.length > 0
      ? allAccounts.filter(
          item =>
            String(item?.account_name || '').trim().toLowerCase() ===
            preferredLinkedName
        )
      : [];
  return pickBestMatch(preferredAccounts) || pickBestMatch(allAccounts);
};

export {findLinkedTransaction};
