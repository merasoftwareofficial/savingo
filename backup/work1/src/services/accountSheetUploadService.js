import {createAccount, getAllAccounts} from './accountsDatabase';
import {createTransaction, getTransactionsByAccount} from './transactionsDatabase';
import {
  canWithdrawAtTimestampWithEntries,
  getBalanceAtTimestampWithEntries,
} from './transactionTimeline';
import {getBestAccountVisualForName} from '../ui/accountVisuals';

export const ACCOUNT_SHEET_HEADERS = [
  'Date',
  'Time',
  'Account Name',
  'Account Type',
  'Entry Type',
  'Amount',
  'Remark',
  'Currency',
];

const normalizeHeader = value => String(value || '').trim().toLowerCase();
const VALID_ACCOUNT_TYPES = new Set(['earning', 'expenses', 'saving']);
const normalizeRemark = value =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
const normalizeEntryKind = value => {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'legacy_transfer') {
    return 'request';
  }
  if (kind === 'transfer' || kind === 'request') {
    return kind;
  }
  return 'normal';
};
const amountKey = value => Number(value || 0).toFixed(6);
const buildRowFingerprint = row =>
  [
    row.accountId,
    Number(row.timestamp || 0),
    amountKey(row.amount),
    normalizeEntryKind(row.entryType),
    normalizeRemark(row.remark),
  ].join('|');
const buildTransactionFingerprint = (accountId, txn) =>
  [
    accountId,
    Number(txn?.transaction_date || 0),
    amountKey(txn?.amount),
    normalizeEntryKind(txn?.entry_kind),
    normalizeRemark(txn?.remark),
  ].join('|');
const mapEntryTypeToEntryKind = entryType => {
  const normalizedType = String(entryType || '').trim().toLowerCase();
  if (normalizedType === 'transfer' || normalizedType === 'request') {
    return normalizedType;
  }
  return 'normal';
};
const normalizeAccountType = value => String(value || '').trim().toLowerCase();

const updateQuoteState = (input, initialState = false) => {
  let inQuotes = initialState;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== '"') {
      continue;
    }
    const next = text[i + 1];
    if (inQuotes && next === '"') {
      i += 1;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return inQuotes;
};

const parseCsvLine = line => {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map(part => String(part || '').trim());
};

export const parseCsvText = text => {
  const normalizedText = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (!normalizedText.trim()) {
    return {headers: [], rows: []};
  }

  const lines = normalizedText.split('\n');
  const logicalLines = [];

  let buffer = '';
  let inQuotes = false;
  let startLineNo = 1;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    if (!buffer) {
      startLineNo = lineNo;
      buffer = line;
    } else {
      buffer += `\n${line}`;
    }

    inQuotes = updateQuoteState(line, inQuotes);
    if (!inQuotes) {
      if (buffer.trim().length > 0) {
        logicalLines.push({line: buffer, rowNo: startLineNo});
      }
      buffer = '';
    }
  });

  if (buffer.trim().length > 0) {
    logicalLines.push({line: buffer, rowNo: startLineNo});
  }

  if (logicalLines.length === 0) {
    return {headers: [], rows: []};
  }

  const headers = parseCsvLine(logicalLines[0].line);
  const rows = logicalLines.slice(1).map(item => ({
    rowNo: item.rowNo,
    raw: parseCsvLine(item.line),
  }));
  return {headers, rows};
};

const parseDateTimeToTimestamp = (dateValue, timeValue) => {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dateMatch) {
    return NaN;
  }
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time || '00:00:00');
  if (!timeMatch) {
    return NaN;
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || '0');
  const dt = new Date(year, month, day, hour, minute, second, 0);
  return dt.getTime();
};

const mapEntryTypeToAmount = (entryType, amount) => {
  const normalizedType = String(entryType || '').trim().toLowerCase();
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return NaN;
  }
  const absAmount = Math.abs(numericAmount);
  if (normalizedType === 'added') {
    return absAmount;
  }
  if (normalizedType === 'withdraw') {
    return -absAmount;
  }
  if (normalizedType === 'transfer' || normalizedType === 'request') {
    // Transfer/request rows may be positive or negative by design.
    return numericAmount;
  }
  return NaN;
};

export const analyzeAccountSheet = (csvText, options = {}) => {
  const strictEcoEnabled = options.strictEcoEnabled !== false;
  const {headers, rows} = parseCsvText(csvText);
  const normalizedHeaders = headers.map(normalizeHeader);
  const expectedHeaders = ACCOUNT_SHEET_HEADERS.map(normalizeHeader);

  const headerValid =
    normalizedHeaders.length === expectedHeaders.length &&
    expectedHeaders.every((key, index) => normalizedHeaders[index] === key);

  if (!headerValid) {
    return {
      ok: false,
      headerValid: false,
      expectedHeaders: ACCOUNT_SHEET_HEADERS,
      actualHeaders: headers,
      totalRows: rows.length,
      validRows: [],
      invalidRows: [
        {
          rowNo: 1,
          reason:
            'Invalid headers. Please use the latest sheet format from Download Entries Sheet.',
        },
      ],
      ecoViolations: [],
      strictEcoEnabled,
    };
  }

  const allAccounts = getAllAccounts();
  const accountsByName = new Map(
    allAccounts.map(account => [
      String(account.account_name || '').trim().toLowerCase(),
      account,
    ])
  );

  const validRows = [];
  const invalidRows = [];
  const missingAccountsMap = new Map();

  rows.forEach(item => {
    const rowValues = item.raw;
    const date = rowValues[0] || '';
    const time = rowValues[1] || '';
    const accountName = rowValues[2] || '';
    const accountType = rowValues[3] || '';
    const entryType = rowValues[4] || '';
    const amountRaw = rowValues[5] || '';
    const remark = rowValues[6] || '';

    const normalizedAccountType = normalizeAccountType(accountType);
    const account = accountsByName.get(String(accountName).trim().toLowerCase());
    if (!accountName.trim()) {
      invalidRows.push({rowNo: item.rowNo, reason: 'Account Name is required.'});
      return;
    }
    if (!normalizedAccountType) {
      invalidRows.push({rowNo: item.rowNo, reason: 'Account Type is required.'});
      return;
    }
    if (!VALID_ACCOUNT_TYPES.has(normalizedAccountType)) {
      invalidRows.push({
        rowNo: item.rowNo,
        reason: `Invalid Account Type: ${accountType}`,
      });
      return;
    }
    if (!account) {
      const key = String(accountName).trim().toLowerCase();
      if (!missingAccountsMap.has(key)) {
        missingAccountsMap.set(key, {
          name: String(accountName).trim(),
          accountType: normalizedAccountType,
          firstSeenRow: item.rowNo,
        });
      }
      return;
    }
    if (String(account.account_type || '').trim().toLowerCase() !== normalizedAccountType) {
      invalidRows.push({
        rowNo: item.rowNo,
        reason: `Account Type mismatch for ${accountName}.`,
      });
      return;
    }

    const timestamp = parseDateTimeToTimestamp(date, time);
    if (!Number.isFinite(timestamp)) {
      invalidRows.push({rowNo: item.rowNo, reason: 'Invalid Date/Time format.'});
      return;
    }

    const normalizedEntryType = String(entryType || '').trim().toLowerCase();
    if (!['added', 'withdraw', 'transfer', 'request'].includes(normalizedEntryType)) {
      invalidRows.push({
        rowNo: item.rowNo,
        reason: `Invalid Entry Type: ${entryType}`,
      });
      return;
    }

    const signedAmount = mapEntryTypeToAmount(normalizedEntryType, amountRaw);
    if (!Number.isFinite(signedAmount) || Math.abs(signedAmount) < 0.000001) {
      invalidRows.push({rowNo: item.rowNo, reason: 'Amount must be a non-zero number.'});
      return;
    }

    validRows.push({
      rowNo: item.rowNo,
      accountId: account.id,
      accountName: account.account_name,
      accountType: account.account_type,
      entryType: normalizedEntryType,
      amount: signedAmount,
      remark,
      timestamp,
    });
  });

  const ecoViolations = [];
  if (strictEcoEnabled && validRows.length > 0) {
    const timelineByAccount = new Map();
    const pendingByAccount = new Map();

    const sortedRows = [...validRows].sort((a, b) => {
      const timeDiff = Number(a.timestamp) - Number(b.timestamp);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return a.rowNo - b.rowNo;
    });

    sortedRows.forEach(row => {
      if (!timelineByAccount.has(row.accountId)) {
        const existing = getTransactionsByAccount(row.accountId).filter(
          txn => Number(txn?.is_deleted) !== 1
        );
        timelineByAccount.set(row.accountId, existing);
        pendingByAccount.set(row.accountId, []);
      }

      const currentTimeline = timelineByAccount.get(row.accountId) || [];
      const currentPending = pendingByAccount.get(row.accountId) || [];

      if (row.amount < 0) {
        const pendingEntry = {
          id: `pending-row-${row.rowNo}`,
          amount: row.amount,
          transaction_date: row.timestamp,
          is_deleted: 0,
          orderIndex: currentPending.length + 1,
        };
        const allowed = canWithdrawAtTimestampWithEntries(
          Math.abs(row.amount),
          row.timestamp,
          currentTimeline,
          [...currentPending, pendingEntry]
        );
        if (!allowed) {
          const projected = getBalanceAtTimestampWithEntries(
            currentTimeline,
            row.timestamp,
            currentPending
          );
          ecoViolations.push({
            rowNo: row.rowNo,
            accountName: row.accountName,
            reason: 'Running timeline balance would go negative.',
            projectedBalanceAtTime: projected,
          });
          return;
        }
        currentPending.push(pendingEntry);
        pendingByAccount.set(row.accountId, currentPending);
        return;
      }

      currentPending.push({
        id: `pending-row-${row.rowNo}`,
        amount: row.amount,
        transaction_date: row.timestamp,
        is_deleted: 0,
        orderIndex: currentPending.length + 1,
      });
      pendingByAccount.set(row.accountId, currentPending);
    });
  }

  return {
    ok: true,
    headerValid: true,
    expectedHeaders: ACCOUNT_SHEET_HEADERS,
    actualHeaders: headers,
    totalRows: rows.length,
    validRows,
    invalidRows,
    missingAccounts: Array.from(missingAccountsMap.values()).sort(
      (a, b) => a.firstSeenRow - b.firstSeenRow
    ),
    ecoViolations,
    strictEcoEnabled,
  };
};

export const importAccountSheetEntries = async (analysis, options = {}) => {
  const allowEcoViolations = Boolean(options?.allowEcoViolations);
  const validRows = Array.isArray(analysis?.validRows) ? analysis.validRows : [];
  const ecoViolations = Array.isArray(analysis?.ecoViolations)
    ? analysis.ecoViolations
    : [];
  const ecoRowNos = new Set(ecoViolations.map(item => item.rowNo));
  const sortedRows = [...validRows].sort((a, b) => {
    const timeDiff = Number(a.timestamp) - Number(b.timestamp);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return a.rowNo - b.rowNo;
  });

  const rowsToCreate = sortedRows.filter(
    row => allowEcoViolations || !ecoRowNos.has(row.rowNo)
  );
  const ecoSkippedRows = allowEcoViolations
    ? []
    : sortedRows
        .filter(row => ecoRowNos.has(row.rowNo))
        .map(row => ({rowNo: row.rowNo, accountName: row.accountName}));

  const accountIds = Array.from(new Set(rowsToCreate.map(row => row.accountId)));
  const fingerprintByAccount = new Map();
  accountIds.forEach(accountId => {
    const existingTxns = getTransactionsByAccount(accountId).filter(
      txn => Number(txn?.is_deleted) !== 1
    );
    const keys = new Set(existingTxns.map(txn => buildTransactionFingerprint(accountId, txn)));
    fingerprintByAccount.set(accountId, keys);
  });

  const duplicateRows = [];
  const failedRows = [];
  const createdRows = [];

  for (const row of rowsToCreate) {
    const accountKeys = fingerprintByAccount.get(row.accountId) || new Set();
    const fingerprint = buildRowFingerprint(row);
    if (accountKeys.has(fingerprint)) {
      duplicateRows.push({
        rowNo: row.rowNo,
        accountName: row.accountName,
        reason: 'Duplicate entry already exists.',
      });
      continue;
    }

    try {
      await createTransaction(
        row.accountId,
        row.amount,
        row.remark || '',
        row.timestamp,
        null,
        mapEntryTypeToEntryKind(row.entryType)
      );
      accountKeys.add(fingerprint);
      fingerprintByAccount.set(row.accountId, accountKeys);
      createdRows.push({rowNo: row.rowNo, accountName: row.accountName});
    } catch (error) {
      failedRows.push({
        rowNo: row.rowNo,
        accountName: row.accountName,
        reason: String(error?.message || 'Failed to create entry.'),
      });
    }
  }

  return {
    totalValidRows: validRows.length,
    attemptedRows: rowsToCreate.length,
    createdCount: createdRows.length,
    duplicateCount: duplicateRows.length,
    failedCount: failedRows.length,
    ecoSkippedCount: ecoSkippedRows.length,
    createdRows,
    duplicateRows,
    failedRows,
    ecoSkippedRows,
    allowEcoViolations,
  };
};

export const createMissingAccountsForSheet = async missingAccounts => {
  const pending = Array.isArray(missingAccounts) ? missingAccounts : [];
  if (pending.length === 0) {
    return {createdCount: 0, skippedExistingCount: 0, failedCount: 0, failed: []};
  }

  const failed = [];
  let createdCount = 0;
  let skippedExistingCount = 0;

  for (const item of pending) {
    const name = String(item?.name || '').trim();
    const accountType = normalizeAccountType(item?.accountType);
    if (!name || !VALID_ACCOUNT_TYPES.has(accountType)) {
      failed.push({
        name,
        accountType,
        reason: 'Invalid account definition.',
      });
      continue;
    }

    const existing = getAllAccounts().find(
      account => String(account?.account_name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (String(existing.account_type || '').trim().toLowerCase() !== accountType) {
        failed.push({
          name,
          accountType,
          reason: `Existing account type mismatch (${existing.account_type}).`,
        });
      } else {
        skippedExistingCount += 1;
      }
      continue;
    }

    try {
      const visual = getBestAccountVisualForName(
        name,
        accountType,
        getAllAccounts(),
      );
      await createAccount(name, accountType, visual.icon, visual.color);
      createdCount += 1;
    } catch (error) {
      failed.push({
        name,
        accountType,
        reason: String(error?.message || 'Failed to create account.'),
      });
    }
  }

  return {
    createdCount,
    skippedExistingCount,
    failedCount: failed.length,
    failed,
  };
};
