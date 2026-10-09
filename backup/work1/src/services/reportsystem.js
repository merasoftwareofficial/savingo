/**
 * reportsystem.js
 * Pure logic - no UI, no React.
 * Consumes accounts + transactions from existing DB services
 * and produces structured report data ready for display or export.
 */

import {getTransactionsByAccount} from './transactionsDatabase';

export const REPORT_PERIOD = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  CUSTOM: 'custom',
};

export const REPORT_FORMAT = {
  PDF: 'pdf',
  EXCEL: 'excel',
};

const isExcluded = txn => {
  if (Number(txn.is_deleted) === 1) return true;
  const r = String(txn.remark || '').trim().toLowerCase();
  if (
    r.startsWith('transferred to ') ||
    r.startsWith('transferred from ') ||
    r.startsWith('requested to ') ||
    r.startsWith('requested from ') ||
    r.startsWith('requested by ') ||
    r.startsWith('[ewlog]')
  ) {
    return true;
  }
  return false;
};

const dayKey = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const monthKey = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const getDateRange = (period, customStart = null, customEnd = null) => {
  const now = new Date();
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  switch (period) {
    case REPORT_PERIOD.WEEKLY: {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      return {startTs: start.getTime(), endTs: todayEnd};
    }
    case REPORT_PERIOD.MONTHLY: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {startTs: start.getTime(), endTs: todayEnd};
    }
    case REPORT_PERIOD.YEARLY: {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      return {startTs: start.getTime(), endTs: todayEnd};
    }
    case REPORT_PERIOD.CUSTOM:
      return {startTs: customStart, endTs: customEnd};
    default:
      return {startTs: null, endTs: null};
  }
};

export const buildReportData = (accounts, period, customStart = null, customEnd = null) => {
  const {startTs, endTs} = getDateRange(period, customStart, customEnd);
  if (!startTs || !endTs) return null;

  let totalEarning = 0;
  let totalExpenses = 0;
  let totalTxnCount = 0;

  const accountRows = [];
  const dailyMap = {};
  const dailyAccountMap = {};
  const monthlyMap = {};
  const allTxns = [];

  accounts.forEach(acc => {
    const txns = getTransactionsByAccount(acc.id);
    let accEarning = 0;
    let accExpenses = 0;
    let accCount = 0;

    txns.forEach(txn => {
      if (isExcluded(txn)) return;

      const ts = Number(txn.transaction_date);
      if (ts < startTs || ts > endTs) return;

      const amt = Number(txn.amount) || 0;
      if (amt > 0) {
        accEarning += amt;
        totalEarning += amt;
      } else {
        accExpenses += amt;
        totalExpenses += amt;
      }

      accCount++;
      totalTxnCount++;

      const dk = dayKey(ts);
      if (!dailyMap[dk]) dailyMap[dk] = {date: dk, earning: 0, expenses: 0};
      if (amt > 0) dailyMap[dk].earning += amt;
      else dailyMap[dk].expenses += amt;

      if (!dailyAccountMap[dk]) dailyAccountMap[dk] = {};
      if (!dailyAccountMap[dk][acc.account_name]) {
        dailyAccountMap[dk][acc.account_name] = {
          date: dk,
          accountName: acc.account_name,
          earning: 0,
          expenses: 0,
          txnCount: 0,
        };
      }
      if (amt > 0) dailyAccountMap[dk][acc.account_name].earning += amt;
      else dailyAccountMap[dk][acc.account_name].expenses += amt;
      dailyAccountMap[dk][acc.account_name].txnCount += 1;

      const mk = monthKey(ts);
      if (!monthlyMap[mk]) monthlyMap[mk] = {month: mk, earning: 0, expenses: 0};
      if (amt > 0) monthlyMap[mk].earning += amt;
      else monthlyMap[mk].expenses += amt;

      allTxns.push({
        accountName: acc.account_name,
        accountType: acc.account_type,
        amount: amt,
        remark: txn.remark || '',
        date: dk,
        ts,
      });
    });

    accountRows.push({
      id: acc.id,
      name: acc.account_name,
      type: acc.account_type,
      color: acc.icon_color || '#059669',
      earning: accEarning,
      expenses: accExpenses,
      net: accEarning + accExpenses,
      txnCount: accCount,
    });
  });

  const daily = Object.values(dailyMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({...d, net: d.earning + d.expenses}));

  const dailyByAccount = Object.values(dailyAccountMap)
    .flatMap(dayMap => Object.values(dayMap))
    .sort((a, b) => a.date.localeCompare(b.date) || a.accountName.localeCompare(b.accountName))
    .map(item => ({
      ...item,
      net: item.earning + item.expenses,
    }));

  const monthly = Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({...m, net: m.earning + m.expenses}));

  const transactions = [...allTxns].sort((a, b) => b.ts - a.ts);

  const top = [...allTxns]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10);

  return {
    period,
    startTs,
    endTs,
    summary: {
      totalEarning,
      totalExpenses,
      netBalance: totalEarning + totalExpenses,
      txnCount: totalTxnCount,
    },
    accounts: accountRows,
    daily,
    dailyByAccount,
    monthly,
    transactions,
    top,
  };
};

export const formatReportAsRows = reportData => {
  if (!reportData) return [];
  const header = ['Date', 'Account', 'Type', 'Amount', 'Remark'];
  const rows = reportData.top.map(t => [
    t.date,
    t.accountName,
    t.accountType,
    t.amount.toFixed(2),
    t.remark,
  ]);
  return [header, ...rows];
};

const SYMBOL_TO_CODE = {
  '₹': 'INR',
  '$': 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '¥': 'JPY',
  '₽': 'RUB',
  'C$': 'CAD',
  'A$': 'AUD',
  'NZ$': 'NZD',
  'S$': 'SGD',
  'HK$': 'HKD',
  'R$': 'BRL',
};

const COUNTRY_TO_CODE = {
  CN: 'CNY',
  MX: 'MXN',
};

const getCurrencyCode = (symbol, countryCode) =>
  COUNTRY_TO_CODE[countryCode] || SYMBOL_TO_CODE[symbol] || symbol || 'INR';

const formatTime24 = ts => {
  const d = new Date(Number(ts) || 0);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const normalizeEntryKind = txn => {
  const explicitKind = String(txn?.entry_kind || '')
    .trim()
    .toLowerCase();
  if (explicitKind) {
    return explicitKind;
  }
  const remark = String(txn?.remark || '').trim().toLowerCase();
  if (remark.startsWith('[ewlog]')) return 'earning_withdraw_log';
  if (remark.startsWith('[cwlog]')) return 'credit_withdraw_log';
  if (
    remark.startsWith('transferred to ') ||
    remark.startsWith('transferred from ')
  ) {
    return 'transfer';
  }
  if (
    remark.startsWith('requested to ') ||
    remark.startsWith('requested from ') ||
    remark.startsWith('requested by ')
  ) {
    return 'request';
  }
  return 'normal';
};

const toCsvEntryType = (normalizedKind, amount) => {
  if (normalizedKind === 'transfer') return 'transfer';
  if (normalizedKind === 'request' || normalizedKind === 'legacy_transfer') {
    return 'request';
  }
  return Number(amount || 0) < 0 ? 'withdraw' : 'added';
};

export const buildCsvExportData = (
  accounts,
  period,
  customStart = null,
  customEnd = null
) => {
  const {startTs, endTs} = getDateRange(period, customStart, customEnd);
  if (!startTs || !endTs) return null;

  const rows = [];
  accounts.forEach(account => {
    const txns = getTransactionsByAccount(account.id);
    txns.forEach(txn => {
      if (Number(txn?.is_deleted) === 1) return;
      const ts = Number(txn?.transaction_date);
      if (!Number.isFinite(ts) || ts < startTs || ts > endTs) return;
      const normalizedKind = normalizeEntryKind(txn);
      if (
        normalizedKind === 'earning_withdraw_log' ||
        normalizedKind === 'credit_withdraw_log'
      ) return;
      const amount = Number(txn?.amount || 0);
      rows.push({
        entryId: String(txn?.id || ''),
        transactionTimestamp: String(ts),
        date: dayKey(ts),
        time: formatTime24(ts),
        accountName: String(account?.account_name || ''),
        accountType: String(account?.account_type || ''),
        entryKind: toCsvEntryType(normalizedKind, amount),
        amount,
        remark: String(txn?.remark || ''),
      });
    });
  });

  return {
    period,
    startTs,
    endTs,
    rows: rows.sort(
      (a, b) => Number(b.transactionTimestamp) - Number(a.transactionTimestamp)
    ),
  };
};

export const generateImportReadyCSVReport = (
  csvData,
  currencySymbol,
  countryCode = null
) => {
  if (!csvData) return '';
  const rows = Array.isArray(csvData.rows) ? csvData.rows : [];
  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const code = getCurrencyCode(currencySymbol, countryCode);

  const sheetRows = [
    [
      'Date',
      'Time',
      'Account Name',
      'Account Type',
      'Entry Type',
      'Amount',
      'Remark',
      'Currency',
    ],
    ...rows.map(row => [
      row.date || '',
      row.time || '',
      row.accountName || '',
      row.accountType || '',
      row.entryKind || 'added',
      Number(row.amount || 0).toFixed(2),
      row.remark || '',
      code,
    ]),
  ];

  return sheetRows.map(row => row.map(esc).join(',')).join('\n');
};

export const generateCSVReport = (reportData, currencySymbol, countryCode = null) => {
  if (!reportData) return '';
  const {summary, startTs, endTs, transactions} = reportData;
  const fmt = d =>
    new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const code = getCurrencyCode(currencySymbol, countryCode);
  const fmtAmt = n => `${code} ${Math.abs(n).toFixed(2)}`;

  const rows = [
    ['Period', fmt(startTs), 'to', fmt(endTs)],
    ['Earning', fmtAmt(summary.totalEarning), 'Expenses', fmtAmt(summary.totalExpenses), 'Net', fmtAmt(summary.netBalance)],
    [],
    ['Date', 'Account', 'Type', `Amount (${code})`, 'Remark'],
    ...transactions.map(t => [t.date, t.accountName, t.accountType, t.amount.toFixed(2), t.remark || '']),
  ];

  return rows.map(row => row.map(esc).join(',')).join('\n');
};
