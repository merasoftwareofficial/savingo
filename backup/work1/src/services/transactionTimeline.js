const isActiveEntry = entry => Number(entry?.is_deleted) !== 1;

const compareTimelineEntries = (a, b) => {
  const timeDiff = Number(a?.transaction_date) - Number(b?.transaction_date);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  const aIdNum = Number(a?.id);
  const bIdNum = Number(b?.id);
  if (Number.isFinite(aIdNum) && Number.isFinite(bIdNum)) {
    return aIdNum - bIdNum;
  }
  return String(a?.id).localeCompare(String(b?.id));
};

const buildTimelineWithPending = (entries, pendingEntries = []) => {
  return [...entries, ...pendingEntries]
    .filter(isActiveEntry)
    .sort((a, b) => {
      const timeDiff = Number(a.transaction_date) - Number(b.transaction_date);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      const pendingA = String(a?.id || '').startsWith('pending');
      const pendingB = String(b?.id || '').startsWith('pending');
      if (pendingA !== pendingB) {
        // For same timestamp, evaluate persisted entries before pending ones.
        return pendingA ? 1 : -1;
      }
      const orderA = Number.isFinite(a.orderIndex) ? a.orderIndex : null;
      const orderB = Number.isFinite(b.orderIndex) ? b.orderIndex : null;
      if (orderA !== null || orderB !== null) {
        if (orderA === null) {
          return 1;
        }
        if (orderB === null) {
          return -1;
        }
        if (orderA !== orderB) {
          return orderA - orderB;
        }
      }
      return compareTimelineEntries(a, b);
    });
};

const getLatestTransactionIdWithEntries = entries => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  let latest = null;
  for (let index = 0; index < entries.length; index += 1) {
    const txn = entries[index];
    if (!isActiveEntry(txn)) {
      continue;
    }
    if (!latest || compareTimelineEntries(txn, latest) > 0) {
      latest = txn;
    }
  }
  return latest?.id ?? null;
};

const canApplyAmountEditWithEntries = (entries, transactionId, nextAmount) => {
  if (!transactionId) {
    return false;
  }
  if (!Number.isFinite(nextAmount)) {
    return false;
  }
  const targetId = String(transactionId);
  const timeline = (Array.isArray(entries) ? entries : [])
    .filter(isActiveEntry)
    .map(entry =>
      String(entry?.id) === targetId ? {...entry, amount: nextAmount} : entry
    )
    .sort(compareTimelineEntries);

  let running = 0;
  for (const entry of timeline) {
    running += Number(entry.amount) || 0;
    if (running < 0) {
      return false;
    }
  }
  return true;
};

const canDeleteWithoutNegativeWithEntries = (
  entries,
  transactionId,
  options = {}
) => {
  if (!transactionId) {
    return false;
  }
  const targetId = String(transactionId);
  const activeEntries = (Array.isArray(entries) ? entries : []).filter(isActiveEntry);
  const timeline = activeEntries
    .filter(entry => String(entry?.id) !== targetId)
    .sort(compareTimelineEntries);

  if (__DEV__ && options.debugTag) {
    const removedCount = activeEntries.length - timeline.length;
    console.log(`[${options.debugTag}][CHECK-START]`, {
      targetId,
      inputCount: Array.isArray(entries) ? entries.length : 0,
      activeCount: activeEntries.length,
      timelineCount: timeline.length,
      removedCount,
    });
    if (removedCount !== 1) {
      console.log(`[${options.debugTag}][ID-MISMATCH-SUSPECT]`, {
        targetId,
        activeIdsSample: activeEntries.slice(-8).map(item => ({
          id: item.id,
          idType: typeof item.id,
          amount: Number(item.amount) || 0,
          ts: Number(item.transaction_date) || 0,
        })),
      });
    }
  }

  let running = 0;
  let minRunning = Number.POSITIVE_INFINITY;
  let firstNegativeIndex = -1;
  let firstNegativeEntry = null;
  for (let index = 0; index < timeline.length; index += 1) {
    const entry = timeline[index];
    running += Number(entry.amount) || 0;
    if (running < minRunning) {
      minRunning = running;
    }
    if (running < 0 && firstNegativeIndex === -1) {
      firstNegativeIndex = index;
      firstNegativeEntry = entry;
    }
    if (running < 0) {
      if (__DEV__ && options.debugTag) {
        const start = Math.max(0, index - 2);
        const end = Math.min(timeline.length, index + 3);
        console.log(`[${options.debugTag}][CHECK-FAILED]`, {
          targetId,
          firstNegativeIndex,
          minRunning,
          firstNegativeEntry: firstNegativeEntry
            ? {
                id: firstNegativeEntry.id,
                amount: Number(firstNegativeEntry.amount) || 0,
                ts: Number(firstNegativeEntry.transaction_date) || 0,
              }
            : null,
          nearbyEntries: timeline.slice(start, end).map(item => ({
            id: item.id,
            amount: Number(item.amount) || 0,
            ts: Number(item.transaction_date) || 0,
          })),
        });
      }
      return false;
    }
  }

  if (__DEV__ && options.debugTag) {
    console.log(`[${options.debugTag}][CHECK-PASSED]`, {
      targetId,
      minRunning,
      finalRunning: running,
    });
  }

  return true;
};

const explainDeleteNegativeDependencyWithEntries = (
  entries,
  transactionId,
  options = {}
) => {
  if (!transactionId) {
    return null;
  }
  const targetId = String(transactionId);
  const activeEntries = (Array.isArray(entries) ? entries : []).filter(isActiveEntry);
  const removedEntry =
    activeEntries.find(entry => String(entry?.id) === targetId) || null;
  const timeline = activeEntries
    .filter(entry => String(entry?.id) !== targetId)
    .sort(compareTimelineEntries);

  let running = 0;
  for (let index = 0; index < timeline.length; index += 1) {
    const entry = timeline[index];
    running += Number(entry.amount) || 0;
    if (running < 0) {
      const previousRunning = running - (Number(entry.amount) || 0);
      return {
        targetId,
        removedEntry,
        blockingEntry: entry,
        blockingIndex: index,
        runningBalance: running,
        balanceBeforeBlockingEntry: previousRunning,
        debugTag: options.debugTag,
      };
    }
  }
  return null;
};

// IMPORTANT: This timestamp rule must not be changed unless the user explicitly requests it in writing.
// Rule: A new backdated debit is allowed only if the running balance never goes negative
// from the new entry's timestamp forward through the entire timeline.
const canWithdrawAtTimestampWithEntries = (
  withdrawValue,
  timestamp,
  entries,
  pendingEntries = [],
  options = {}
) => {
  if (!Number.isFinite(withdrawValue) || withdrawValue <= 0) {
    return false;
  }
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  if (options?.allowNegativeBalance === true) {
    return true;
  }
  const timeline = buildTimelineWithPending(entries, pendingEntries);
  let running = 0;
  let enforceFromTimestamp = false;
  for (const entry of timeline) {
    running += Number(entry.amount) || 0;
    if (
      String(entry.id) === 'pending-entry' ||
      String(entry.id) === 'pending' ||
      Number(entry.transaction_date) >= timestamp
    ) {
      enforceFromTimestamp = true;
    }
    if (enforceFromTimestamp && running < 0) {
      return false;
    }
  }
  return true;
};

const validateTimestampRuleGuard = () => {
  const baseTime = 1700000000000;
  const entries = [
    {id: 'a', amount: 500, transaction_date: baseTime, is_deleted: 0},
    {id: 'b', amount: -200, transaction_date: baseTime + 86400000, is_deleted: 0},
    {id: 'c', amount: -100, transaction_date: baseTime + 2 * 86400000, is_deleted: 0},
  ];
  const okPending = [
    {
      id: 'pending-entry',
      amount: -200,
      transaction_date: baseTime + 3 * 86400000,
      is_deleted: 0,
      orderIndex: 1,
    },
  ];
  const shouldAllow = canWithdrawAtTimestampWithEntries(
    200,
    baseTime + 3 * 86400000,
    entries,
    okPending
  );
  if (!shouldAllow) {
    throw new Error('Timestamp rule guard failed: expected allow for safe future debit.');
  }

  const blockedPending = [
    {
      id: 'pending-entry',
      amount: -300,
      transaction_date: baseTime + 0.5 * 86400000,
      is_deleted: 0,
      orderIndex: 1,
    },
  ];
  const shouldBlock = canWithdrawAtTimestampWithEntries(
    300,
    baseTime + 0.5 * 86400000,
    entries,
    blockedPending
  );
  if (shouldBlock) {
    throw new Error('Timestamp rule guard failed: expected block for backdated debit causing negative later.');
  }
};

// Run guard in dev to detect accidental rule changes.
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  try {
    validateTimestampRuleGuard();
  } catch (error) {
    console.error(error?.message || error);
  }
}

const getBalanceAtTimestampWithEntries = (
  entries,
  timestamp,
  pendingEntries = []
) => {
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const timeline = buildTimelineWithPending(entries, pendingEntries);
  let running = 0;
  for (const entry of timeline) {
    if (Number(entry.transaction_date) > timestamp) {
      break;
    }
    running += Number(entry.amount) || 0;
  }
  return running;
};

export {
  buildTimelineWithPending,
  compareTimelineEntries,
  canApplyAmountEditWithEntries,
  canDeleteWithoutNegativeWithEntries,
  explainDeleteNegativeDependencyWithEntries,
  canWithdrawAtTimestampWithEntries,
  getBalanceAtTimestampWithEntries,
  getLatestTransactionIdWithEntries,
};
