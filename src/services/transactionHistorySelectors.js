import {
  getMonthlyRangeFromStartDay,
  normalizeMonthStartDay,
  resolveQuickPeriodRange,
} from './transactionHistoryTime';

const ENTRY_KIND = Object.freeze({
  EARNING_WITHDRAW_LOG: 'earning_withdraw_log',
  CREDIT_WITHDRAW_LOG: 'credit_withdraw_log',
  TRANSFER: 'transfer',
  LEGACY_TRANSFER: 'legacy_transfer',
  REQUEST: 'request',
});

const TRANSFER_REMARK_PREFIXES = [
  'transferred to ',
  'transferred from ',
  'requested to ',
  'requested from ',
  'requested by ',
];

const EARNING_WITHDRAW_LOG_TOKEN = '[ewlog]';
const CREDIT_WITHDRAW_LOG_TOKEN = '[cwlog]';

const normalizeEntryKind = txn => String(txn?.entry_kind || '').trim().toLowerCase();

const normalizeAmount = txn => Number(txn?.amount) || 0;

export const isTransferOrRequestTransaction = txn => {
  const entryKind = normalizeEntryKind(txn);
  if (entryKind) {
    return (
      entryKind === ENTRY_KIND.TRANSFER ||
      entryKind === ENTRY_KIND.LEGACY_TRANSFER ||
      entryKind === ENTRY_KIND.REQUEST
    );
  }
  const remark = String(txn?.remark || '').trim().toLowerCase();
  return TRANSFER_REMARK_PREFIXES.some(prefix => remark.startsWith(prefix));
};

export const isEarningWithdrawLogTransaction = txn => {
  const entryKind = normalizeEntryKind(txn);
  if (entryKind) {
    return (
      entryKind === ENTRY_KIND.EARNING_WITHDRAW_LOG ||
      entryKind === ENTRY_KIND.CREDIT_WITHDRAW_LOG
    );
  }
  const remark = String(txn?.remark || '').trim().toLowerCase();
  const amount = normalizeAmount(txn);
  return (
    Math.abs(amount) < 0.000001 &&
    (remark.startsWith(EARNING_WITHDRAW_LOG_TOKEN) ||
      remark.startsWith(CREDIT_WITHDRAW_LOG_TOKEN))
  );
};

const isDeletedTransaction = txn => Number(txn?.is_deleted) === 1;

const compareTxnAsc = (a, b) => {
  const timeDiff = Number(a?.transaction_date) - Number(b?.transaction_date);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  const aId = Number(a?.id);
  const bId = Number(b?.id);
  if (Number.isFinite(aId) && Number.isFinite(bId)) {
    return aId - bId;
  }
  return String(a?.id || '').localeCompare(String(b?.id || ''));
};

export const classifyHistoryEntry = (txn, accountType = '') => {
  const normalizedAccountType = String(accountType || '').trim().toLowerCase();
  if (isTransferOrRequestTransaction(txn)) {
    return {
      entryType: 'transfer',
      includeByDefault: false,
      accountType: normalizedAccountType,
    };
  }

  if (isEarningWithdrawLogTransaction(txn)) {
    return {
      entryType: 'withdraw',
      includeByDefault: true,
      accountType: normalizedAccountType,
    };
  }

  const amount = normalizeAmount(txn);
  if (amount < 0) {
    return {
      entryType: 'withdraw',
      includeByDefault: true,
      accountType: normalizedAccountType,
    };
  }
  if (amount > 0) {
    return {
      entryType: 'added',
      includeByDefault: true,
      accountType: normalizedAccountType,
    };
  }

  return {
    entryType: 'neutral',
    includeByDefault: true,
    accountType: normalizedAccountType,
  };
};

const isInPeriod = (txn, periodFilter = null) => {
  if (!periodFilter) {
    return true;
  }
  const startTs = Number(periodFilter?.startTs);
  const endTs = Number(periodFilter?.endTs);
  const ts = Number(txn?.transaction_date);

  if (Number.isFinite(startTs) && ts < startTs) {
    return false;
  }
  if (Number.isFinite(endTs) && ts > endTs) {
    return false;
  }
  return true;
};

export const applyHistoryTypeFilter = (items, filterType = 'all') => {
  const normalizedFilter = String(filterType || 'all').trim().toLowerCase();
  if (normalizedFilter === 'all') {
    return Array.isArray(items) ? items : [];
  }
  return (Array.isArray(items) ? items : []).filter(item => {
    const entryType = String(item?.classification?.entryType || '').trim().toLowerCase();
    return entryType === normalizedFilter;
  });
};

export const buildAccountHistory = ({
  account,
  transactions,
  showTransferEntries = false,
  periodFilter = null,
}) => {
  const accountType = String(account?.account_type || '').trim().toLowerCase();
  const source = Array.isArray(transactions) ? transactions : [];

  const scoped = source
    .filter(txn => isInPeriod(txn, periodFilter))
    .map(txn => {
      const classification = classifyHistoryEntry(txn, accountType);
      const includeByTransferSetting =
        classification.entryType !== 'transfer' || showTransferEntries;
      return {
        txn,
        classification,
        includeByTransferSetting,
      };
    })
    .filter(item => item.includeByTransferSetting)
    .sort((a, b) => compareTxnAsc(a.txn, b.txn));

  let added = 0;
  let withdrawals = 0;
  let runningBalance = 0;

  const ascEntries = scoped.map(item => {
    const amount = normalizeAmount(item.txn);
    const isDeleted = isDeletedTransaction(item.txn);

    if (!isDeleted && item.classification.entryType === 'added' && amount > 0) {
      added += amount;
    }
    if (!isDeleted && item.classification.entryType === 'withdraw' && amount < 0) {
      withdrawals += Math.abs(amount);
    }

    if (!isDeleted) {
      runningBalance += amount;
    }

    return {
      txn: item.txn,
      classification: item.classification,
      isDeleted,
      balanceAfter: runningBalance,
    };
  });

  const descEntries = [...ascEntries].reverse().map((item, index, arr) => {
    const dateKey = new Date(item.txn.transaction_date).toDateString();
    const nextDateKey =
      index < arr.length - 1
        ? new Date(arr[index + 1].txn.transaction_date).toDateString()
        : null;
    return {
      ...item,
      showDate: dateKey !== nextDateKey,
    };
  });

  return {
    items: descEntries,
    periodTotals: {
      added,
      withdrawals,
      net: added - withdrawals,
    },
  };
};

export {getMonthlyRangeFromStartDay, normalizeMonthStartDay, resolveQuickPeriodRange};
