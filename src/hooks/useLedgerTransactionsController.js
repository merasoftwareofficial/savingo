import {useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTransactionsByContact,
} from '../services/ledgerDatabase';
import {
  commitLedgerEntryCommand,
  hydrateLedgerContactBaseFromDb,
} from '../services/ledgerCommandService';

const useLedgerTransactionsController = ({
  contact,
  contactRecordId,
  currentUserId,
  getContactName,
  getSyncAllEntriesEnabled,
  parseEntryDateToTimestamp,
  parseLedgerEditHistory,
  resolvePeerUserIdForSync,
  writeContactBaseCache,
  setTransactions,
  setBalance,
  blinkLog,
  perfLog,
  persistDraftContactOnce,
}) => {
  const loadLedgerBaseData = useCallback(() => {
    const result = hydrateLedgerContactBaseFromDb({recordId: contactRecordId});
    const txns = result?.transactions || getTransactionsByContact(contactRecordId);
    const bal = result?.balance || {
      netBalance: 0,
      totalPaid: 0,
      totalGet: 0,
      transactionCount: txns.length,
    };
    setTransactions(txns);
    setBalance(bal);
    writeContactBaseCache(contactRecordId, txns, bal);
    blinkLog('base-load-success', {
      contactId: contactRecordId,
      txCount: txns.length,
      netBalance: Number(bal?.netBalance || 0),
    });

    return {txns, bal};
  }, [
    blinkLog,
    contactRecordId,
    setBalance,
    setTransactions,
    writeContactBaseCache,
  ]);

  const submitTransaction = useCallback(async ({
    overrides = null,
  }) => {
    const entryType = overrides?.transactionType || 'paid';
    const noteValue = overrides?.note ?? '';
    const amountValue = Number(overrides?.amount ?? 0);
    const overrideTransactionDate = parseEntryDateToTimestamp(
      overrides?.entryDateIso ?? overrides?.transactionDate ?? null,
    );
    const resolvedGetMode = 'withdraw';
    const resolvedSourceUserId =
      currentUserId || (await AsyncStorage.getItem('firebaseUid'));
    // Get peer ID from cache (resolved during contact load, no await needed)
    const resolvedPeerUserId = await resolvePeerUserIdForSync();
    const syncEnabled = getSyncAllEntriesEnabled();
    const commandResult = await commitLedgerEntryCommand({
      recordId: contact?.recordID,
      entryType,
      amountValue,
      noteValue,
      transactionDate: overrideTransactionDate,
      resolvedGetMode,
      contactName: getContactName(),
      syncEnabled,
      sourceUserId: resolvedSourceUserId,
      peerUserId: resolvedPeerUserId,
      parseLedgerEditHistory,
    });

    if (commandResult?.committed === true) {
      // First ledger entry: a draft contact now belongs in the Ledger list.
      persistDraftContactOnce();
    }

    if (syncEnabled && commandResult?.localTxn?.id) {
      perfLog('[LEDGER_SYNC] queued after local commit', {
        originTxnId: commandResult.localTxn.id,
        sourceUserId: resolvedSourceUserId,
        peerUserId: resolvedPeerUserId,
        type: entryType,
        amount: amountValue,
      });
    }

    return {
      committed: commandResult?.committed === true,
      createdTxn: commandResult?.createdTxn,
      entryType,
      amountValue,
      noteValue,
      resolvedGetMode,
      resolvedSourceUserId,
    };
  }, [
    contact,
    currentUserId,
    getContactName,
    getSyncAllEntriesEnabled,
    parseEntryDateToTimestamp,
    parseLedgerEditHistory,
    perfLog,
    persistDraftContactOnce,
    resolvePeerUserIdForSync,
  ]);

  return {
    loadLedgerBaseData,
    submitTransaction,
  };
};

export default useLedgerTransactionsController;
