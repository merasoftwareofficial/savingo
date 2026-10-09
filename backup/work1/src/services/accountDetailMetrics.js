const normalizeText = value => String(value || '').trim().toLowerCase();

const normalizeAmount = value => Number(value) || 0;

const isActiveTransaction = txn => Number(txn?.is_deleted) !== 1;

const isInPeriod = (txn, periodRange = {}) => {
  const timestamp = Number(txn?.transaction_date) || 0;
  const startTime = Number(periodRange?.startTime);
  const endTime = periodRange?.endTime === null ? null : Number(periodRange?.endTime);

  if (Number.isFinite(startTime) && timestamp < startTime) {
    return false;
  }
  if (endTime !== null && Number.isFinite(endTime) && timestamp > endTime) {
    return false;
  }
  return true;
};

const isLinkedTransferOrRequest = txn => {
  const entryKind = normalizeText(txn?.entry_kind);
  if (
    entryKind === 'transfer' ||
    entryKind === 'legacy_transfer' ||
    entryKind === 'request'
  ) {
    return true;
  }

  const remark = normalizeText(txn?.remark);
  return (
    remark.startsWith('transferred to ') ||
    remark.startsWith('transferred from ') ||
    remark.startsWith('requested to ') ||
    remark.startsWith('requested from ') ||
    remark.startsWith('requested by ')
  );
};

const isExpensesBudgetInflow = txn => {
  const amount = normalizeAmount(txn?.amount);
  if (amount <= 0) {
    return false;
  }
  const remark = normalizeText(txn?.remark);
  return remark.startsWith('requested from ') || remark.startsWith('transferred from ');
};

const isCreditPaidBillInflow = txn => {
  const amount = normalizeAmount(txn?.amount);
  if (amount <= 0) {
    return false;
  }
  const remark = normalizeText(txn?.remark);
  return remark.startsWith('paid bill from ') || remark.startsWith('transferred from ');
};

const isCreditConsumptionOutflow = txn => {
  const amount = normalizeAmount(txn?.amount);
  if (amount >= 0) {
    return false;
  }
  const remark = normalizeText(txn?.remark);
  return remark.startsWith('transferred to ');
};

const hasSameTimestampDebit = (txn, transactions) => {
  const timestamp = Number(txn?.transaction_date) || 0;
  const accountId = String(txn?.account_id || '');
  if (!timestamp || !accountId) {
    return false;
  }

  return transactions.some(candidate => {
    if (!isActiveTransaction(candidate)) {
      return false;
    }
    if (String(candidate?.account_id || '') !== accountId) {
      return false;
    }
    if (String(candidate?.id || '') === String(txn?.id || '')) {
      return false;
    }
    if (Number(candidate?.transaction_date) !== timestamp) {
      return false;
    }
    if (normalizeAmount(candidate?.amount) >= 0) {
      return false;
    }
    return !isLinkedTransferOrRequest(candidate);
  });
};

const buildAccountDetailFlowMetrics = ({
  transactions = [],
  periodRange = {},
  balance = 0,
  isPositiveFlow,
  isNegativeFlow,
} = {}) => {
  const source = Array.isArray(transactions) ? transactions : [];
  const activeInPeriod = source.filter(
    txn => isActiveTransaction(txn) && isInPeriod(txn, periodRange)
  );

  let positive = 0;
  let negative = 0;

  activeInPeriod.forEach(txn => {
    const amount = normalizeAmount(txn?.amount);
    if (amount > 0 && isPositiveFlow?.(txn, source)) {
      positive += amount;
      return;
    }
    if (amount < 0 && isNegativeFlow?.(txn, source)) {
      negative += Math.abs(amount);
    }
  });

  return {
    positive,
    negative,
    balance: normalizeAmount(balance),
  };
};

export const buildExpensesAccountDetailMetrics = options => {
  const metrics = buildAccountDetailFlowMetrics({
    ...options,
    isPositiveFlow: (txn, source) =>
      isExpensesBudgetInflow(txn) && !hasSameTimestampDebit(txn, source),
    isNegativeFlow: txn => !isLinkedTransferOrRequest(txn),
  });

  return {
    budget: metrics.positive,
    expenses: metrics.negative,
    balance: metrics.balance,
  };
};

export const buildSavingAccountDetailMetrics = options => {
  const metrics = buildAccountDetailFlowMetrics({
    ...options,
    isPositiveFlow: txn => normalizeAmount(txn?.amount) > 0,
    isNegativeFlow: txn => normalizeAmount(txn?.amount) < 0,
  });

  return {
    savings: metrics.positive,
    transfer: metrics.negative,
    balance: metrics.balance,
  };
};

export const buildCreditAccountDetailMetrics = options => {
  const metrics = buildAccountDetailFlowMetrics({
    ...options,
    isPositiveFlow: isCreditPaidBillInflow,
    isNegativeFlow: txn => isCreditConsumptionOutflow(txn),
  });

  return {
    paidBill: metrics.positive,
    credit: metrics.negative,
    balance: metrics.balance,
  };
};
