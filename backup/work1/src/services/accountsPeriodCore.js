import {isPayBillTransaction} from './transactionSemantics';

const MONTHS_IN_MS = 24 * 60 * 60 * 1000;

export const isTransferTransaction = txn => {
  const remark = String(txn?.remark || '').trim().toLowerCase();
  return (
    remark.startsWith('transferred to ') ||
    remark.startsWith('transferred from ') ||
    remark.startsWith('requested to ') ||
    remark.startsWith('requested from ') ||
    remark.startsWith('requested by ')
  );
};

export const isDashboardExpenseExcludedTransaction = txn =>
  isTransferTransaction(txn) || isPayBillTransaction(txn);

export const getMonthlyRangeFromStartDay = (
  startDay,
  referenceDate = new Date(),
) => {
  const normalizedStartDay = Math.min(28, Math.max(1, Number(startDay) || 1));
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    normalizedStartDay,
  );
  if (referenceDate.getDate() < normalizedStartDay) {
    start.setMonth(start.getMonth() - 1);
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return {startTime: start.getTime(), endTime: end.getTime()};
};

export const getMonthYearRange = (month, year, startDay) => {
  const normalizedStartDay = Math.min(28, Math.max(1, Number(startDay) || 1));
  const start = new Date(year, month, normalizedStartDay);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, normalizedStartDay);
  end.setHours(0, 0, 0, 0);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return {startTime: start.getTime(), endTime: end.getTime()};
};

export const getQuickPeriodRange = (
  period,
  monthStartDay,
  referenceDate = new Date(),
) => {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  let startTime;
  let endTime = null;

  switch (period) {
    case '1week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 4);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();
      break;
    }
    case '10days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 9);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();
      break;
    }
    case '15days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();
      break;
    }
    case '30days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      startTime = start.getTime();
      break;
    }
    case '1month': {
      const range = getMonthlyRangeFromStartDay(monthStartDay, now);
      startTime = range.startTime;
      endTime = range.endTime;
      break;
    }
    case '3months':
      startTime = now.getTime() - 90 * MONTHS_IN_MS;
      break;
    case '6months':
      startTime = now.getTime() - 180 * MONTHS_IN_MS;
      break;
    case '1year':
      startTime = now.getTime() - 365 * MONTHS_IN_MS;
      break;
    default:
      startTime = now.getTime() - 30 * MONTHS_IN_MS;
  }

  return {startTime, endTime};
};

export const buildPeriodAccountSummaries = ({
  startTime,
  endTime = null,
  accountsSource,
  transactionsSource,
  transferPredicate = isTransferTransaction,
} = {}) => {
  const effectiveAccounts = Array.isArray(accountsSource) ? accountsSource : [];
  const allTransactions = Array.isArray(transactionsSource)
    ? transactionsSource
    : [];

  let filteredEarning = 0;
  let filteredWithdrawals = 0;
  let recordCount = 0;
  const accountMap = {};
  const netByAccount = {};
  const expenseByAccount = {};
  const closingByAccount = {};
  const resolvedEndTime = endTime ?? Date.now();

  effectiveAccounts.forEach(account => {
    accountMap[String(account?.id)] = account;
    netByAccount[account.id] = 0;
    expenseByAccount[account.id] = 0;
    closingByAccount[account.id] = 0;
  });

  allTransactions.forEach(txn => {
    if (Number(txn?.is_deleted) === 1) {
      return;
    }
    const account = accountMap[String(txn?.account_id)];
    if (!account) {
      return;
    }
    const txnTime = Number(txn?.transaction_date) || 0;
    if (txnTime <= resolvedEndTime) {
      closingByAccount[txn.account_id] =
        (Number(closingByAccount[txn.account_id]) || 0) + (Number(txn?.amount) || 0);
    }
    if (txnTime < startTime || (endTime !== null && txnTime > endTime)) {
      return;
    }
    recordCount += 1;
    const amount = Number(txn?.amount) || 0;
    if (transferPredicate(txn)) {
      return;
    }
    if (amount > 0 && String(account.account_type || '').toLowerCase() === 'earning') {
      filteredEarning += amount;
    } else if (amount < 0) {
      filteredWithdrawals += Math.abs(amount);
    }
    netByAccount[txn.account_id] =
      (Number(netByAccount[txn.account_id]) || 0) + amount;
    if (amount < 0) {
      expenseByAccount[txn.account_id] =
        (Number(expenseByAccount[txn.account_id]) || 0) + Math.abs(amount);
    }
  });

  return {
    filteredEarning,
    filteredWithdrawals,
    hasRecords: recordCount > 0,
    recordCount,
    periodAccountAmounts: netByAccount,
    periodAccountExpenses: expenseByAccount,
    closingAccountBalances: closingByAccount,
  };
};

export const calculateAccountsPeriodData = ({
  quickPeriod = '10days',
  selectedMonth = null,
  selectedYear = null,
  customStartDate = null,
  customEndDate = null,
  monthStartDay = 1,
  accountsSource,
  transactionsSource,
  referenceDate = new Date(),
  transferPredicate = isTransferTransaction,
} = {}) => {
  const hasCustomRange = customStartDate !== null && customEndDate !== null;
  const hasMonthYearRange = selectedMonth !== null && selectedYear !== null;

  let mode = 'quick-period';
  let startTime;
  let endTime = null;

  if (hasCustomRange) {
    mode = 'custom';
    startTime = customStartDate;
    endTime = customEndDate;
  } else if (hasMonthYearRange) {
    mode = 'month-year';
    const range = getMonthYearRange(selectedMonth, selectedYear, monthStartDay);
    startTime = range.startTime;
    endTime = range.endTime;
  } else {
    mode = 'quick-period';
    const range = getQuickPeriodRange(quickPeriod, monthStartDay, referenceDate);
    startTime = range.startTime;
    endTime = range.endTime;
  }

  const summary = buildPeriodAccountSummaries({
    startTime,
    endTime,
    accountsSource,
    transactionsSource,
    transferPredicate,
  });

  return {
    mode,
    startTime,
    endTime,
    quickPeriod,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    monthStartDay,
    ...summary,
  };
};

export default {
  buildPeriodAccountSummaries,
  calculateAccountsPeriodData,
  getMonthYearRange,
  getMonthlyRangeFromStartDay,
  getQuickPeriodRange,
  isDashboardExpenseExcludedTransaction,
  isTransferTransaction,
};
