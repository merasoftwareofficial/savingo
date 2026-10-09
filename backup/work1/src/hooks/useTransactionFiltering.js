import {useMemo} from 'react';

const DEFAULT_MONTH_START_DAY = 1;

const getMonthlyRangeFromStartDay = (startDay, referenceDate = new Date()) => {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    startDay,
  );
  if (referenceDate.getDate() < startDay) {
    start.setMonth(start.getMonth() - 1);
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return {startTime: start.getTime(), endTime: end.getTime()};
};

export const resolveTimeRange = (
  quickPeriod,
  customStartDate,
  customEndDate,
  monthStartDay,
) => {
  if (customStartDate && customEndDate) {
    return {startTime: customStartDate, endTime: customEndDate};
  }

  const now = new Date();
  let startTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  let endTime = null;

  switch (quickPeriod) {
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
      const range = getMonthlyRangeFromStartDay(
        monthStartDay ?? DEFAULT_MONTH_START_DAY,
        now,
      );
      startTime = range.startTime;
      endTime = range.endTime;
      break;
    }
    case '3months':
      startTime = now.getTime() - 90 * 24 * 60 * 60 * 1000;
      break;
    case '6months':
      startTime = now.getTime() - 180 * 24 * 60 * 60 * 1000;
      break;
    case '1year':
      startTime = now.getTime() - 365 * 24 * 60 * 60 * 1000;
      break;
    default:
      startTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }

  return {startTime, endTime};
};

const useTransactionFiltering = ({
  transactions,
  quickPeriod,
  customStartDate,
  customEndDate,
  monthStartDay,
}) => {
  return useMemo(() => {
    const {startTime, endTime} = resolveTimeRange(
      quickPeriod,
      customStartDate,
      customEndDate,
      monthStartDay,
    );

    let filteredAdded = 0;
    let filteredWithdrawn = 0;
    const filteredTransactions = [];

    transactions.forEach(txn => {
      if (Number(txn?.is_deleted) === 1) {
        return;
      }
      const txnTime = Number(txn?.transaction_date);
      if (txnTime >= startTime && (endTime === null || txnTime <= endTime)) {
        const amount = Number(txn?.amount) || 0;
        if (amount > 0) {
          filteredAdded += amount;
        } else if (amount < 0) {
          filteredWithdrawn += Math.abs(amount);
        }
        filteredTransactions.push(txn);
      }
    });

    filteredTransactions.sort(
      (a, b) => Number(b.transaction_date) - Number(a.transaction_date),
    );

    return {
      filteredTransactions,
      filteredAdded,
      filteredWithdrawn,
      netBalance: filteredAdded - filteredWithdrawn,
      timeRange: {startTime, endTime},
    };
  }, [transactions, quickPeriod, customStartDate, customEndDate, monthStartDay]);
};

export default useTransactionFiltering;
