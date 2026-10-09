import {
  createTransaction as createLedgerTransaction,
  getTransactionById as getLedgerTransactionById,
  getTransactionsByContact,
} from './ledgerDatabase';
import {getMessages} from './chatDatabase';
import {buildLedgerCreateEvent, sendLedgerEvent} from './ledgerSyncService';
import {
  dispatchLedgerDomainAction,
  selectLedgerContactBase,
  selectLedgerContactTimeline,
} from './ledgerDomain';
import {LEDGER_ACTION_TYPES} from './ledgerDomain/ledgerDomainContract';

const normalizeNumber = value => Number(value) || 0;

const buildBalanceSnapshot = (recordId, transactions = null) => {
  const txns = Array.isArray(transactions)
    ? transactions
    : getTransactionsByContact(recordId);
  const totalPaid = txns.reduce(
    (sum, txn) => {
      if (Number(txn?.is_deleted) === 1) {
        return sum;
      }
      return String(txn?.type || '') === 'paid'
        ? sum + normalizeNumber(txn?.amount)
        : sum;
    },
    0,
  );
  const totalGet = txns.reduce(
    (sum, txn) => {
      if (Number(txn?.is_deleted) === 1) {
        return sum;
      }
      return String(txn?.type || '') === 'get'
        ? sum + normalizeNumber(txn?.amount)
        : sum;
    },
    0,
  );
  const transactionCount = txns.reduce(
    (count, txn) => (Number(txn?.is_deleted) === 1 ? count : count + 1),
    0,
  );
  const netBalance = totalPaid - totalGet;
  return {
    netBalance,
    totalPaid,
    totalGet,
    transactionCount,
  };
};

export const hydrateLedgerContactBaseFromDb = ({recordId}) => {
  const resolvedRecordId = String(recordId || '').trim();
  if (!resolvedRecordId) {
    return {
      committed: false,
      reason: 'missing-record-id',
    };
  }

  const transactions = getTransactionsByContact(resolvedRecordId);
  const balance = buildBalanceSnapshot(resolvedRecordId, transactions);
  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.HYDRATE_CONTACT_BASE,
    payload: {
      base: {
        recordId: resolvedRecordId,
        transactions,
        balance,
        updatedAt: Date.now(),
      },
    },
  });

  return {
    committed: true,
    recordId: resolvedRecordId,
    transactions,
    balance,
  };
};

export const commitLedgerEntryCommand = async ({
  recordId,
  entryType,
  amountValue,
  noteValue = '',
  transactionDate = null,
  resolvedGetMode = 'withdraw',
  contactName = 'Contact',
  syncEnabled = false,
  sourceUserId = '',
  peerUserId = '',
  parseLedgerEditHistory = () => [],
}) => {
  const resolvedRecordId = String(recordId || '').trim();
  if (!resolvedRecordId) {
    throw new Error('missing_record_id');
  }

  const previousBase = selectLedgerContactBase(resolvedRecordId);
  const priorTransactions = Array.isArray(previousBase?.transactions)
    ? previousBase.transactions
    : [];

  const createdTxn = createLedgerTransaction(
    resolvedRecordId,
    amountValue,
    entryType,
    noteValue,
    {
      sourceUserId: sourceUserId || '',
      transactionDate,
    },
  );
  const localTxnId = createdTxn?.insertId;
  const localTxn = localTxnId ? getLedgerTransactionById(localTxnId) : null;

  const transactions = localTxn
    ? [
        localTxn,
        ...priorTransactions.filter(item => String(item?.id || '') !== String(localTxn.id || '')),
      ]
    : priorTransactions;
  const balance = buildBalanceSnapshot(resolvedRecordId, transactions);

  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.LEDGER_ENTRY_CREATED,
    payload: {
      recordId: resolvedRecordId,
      transaction: localTxn,
      balance,
    },
  });

  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.HYDRATE_CONTACT_BASE,
    payload: {
      base: {
        recordId: resolvedRecordId,
        transactions,
        balance,
        updatedAt: Date.now(),
      },
    },
  });

  const currentTimeline = selectLedgerContactTimeline(resolvedRecordId);
  const currentItems = Array.isArray(currentTimeline?.items) ? currentTimeline.items : [];
  const newTimelineItem = localTxn
    ? {
        id: `txn-${localTxn.id}`,
        type: 'transaction',
        timestamp: Number(localTxn.transaction_date) || Date.now(),
        data: localTxn,
      }
    : null;
  const nextTimelineItems = newTimelineItem
    ? [newTimelineItem, ...currentItems.filter(item => String(item?.id || '') !== newTimelineItem.id)]
    : currentItems;
  nextTimelineItems.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));

  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.UPSERT_TIMELINE,
    payload: {
      timeline: {
        recordId: resolvedRecordId,
        conversationId: currentTimeline?.conversationId || null,
        hasLoaded: true,
        updatedAt: Date.now(),
        items: nextTimelineItems,
      },
    },
  });

  if (syncEnabled && localTxnId && sourceUserId && peerUserId) {
    const eventPayload = buildLedgerCreateEvent({
      originTxnId: localTxnId,
      sourceUserId,
      peerUserId,
      contactRecordId: resolvedRecordId,
      type: entryType,
      amount: amountValue,
      note: noteValue,
      editHistory: parseLedgerEditHistory(localTxn),
      timestamp: localTxn?.transaction_date || Date.now(),
      createdAt: localTxn?.created_at || Date.now(),
    });
    // Keep UI commit path fast: sync is best-effort and should not block local consistency.
    sendLedgerEvent(eventPayload).catch(error => {
      console.error('[LEDGER_COMMAND] sendLedgerEvent failed:', error);
    });
  }

  return {
    committed: true,
    createdTxn,
    localTxn,
    balance,
    transactionsCount: transactions.length,
  };
};

export const hydrateLedgerTimelineFromDb = ({recordId, conversationId = null}) => {
  const resolvedRecordId = String(recordId || '').trim();
  if (!resolvedRecordId) {
    return {
      committed: false,
      reason: 'missing-record-id',
    };
  }

  const convId = String(conversationId || '').trim();
  const messages = convId ? getMessages(convId) : [];
  const transactionItems = getTransactionsByContact(resolvedRecordId).map(transaction => ({
    id: `txn-${transaction.id}`,
    type: 'transaction',
    timestamp: Number(transaction.transaction_date) || 0,
    data: transaction,
  }));
  const messageItems = messages.map(message => ({
    id: `msg-${message.message_id || message.id}`,
    type: 'message',
    timestamp: Number(message.timestamp) || 0,
    data: message,
  }));
  const items = [...transactionItems, ...messageItems].sort(
    (a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0),
  );

  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.UPSERT_TIMELINE,
    payload: {
      timeline: {
        recordId: resolvedRecordId,
        conversationId: convId || null,
        hasLoaded: true,
        updatedAt: Date.now(),
        items,
      },
    },
  });

  return {
    committed: true,
    recordId: resolvedRecordId,
    conversationId: convId || null,
    items,
  };
};

export default {
  commitLedgerEntryCommand,
  hydrateLedgerContactBaseFromDb,
  hydrateLedgerTimelineFromDb,
};
