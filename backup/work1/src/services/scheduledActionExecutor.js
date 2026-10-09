import {getAllAccounts} from './accountsDatabase';
import {
  calculateAccountBalance,
  createTransaction,
  getTransactionsByAccount,
} from './transactionsDatabase';
import {evaluateCreditLimitDelta} from './creditLimitPolicy';
import {
  canWithdrawAtTimestampWithEntries,
} from './transactionTimeline';
import {getStrictEcoEnabled} from './strictEcoService';

const normalizeTimestamp = (value, fallback = Date.now()) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getAccountById = accountId =>
  getAllAccounts().find(acc => String(acc.id) === String(accountId)) || null;

const createScheduledTransaction = async (
  accountId,
  amount,
  remark,
  entryTimestamp,
  imageUri,
  sourceScheduleId,
  entryKind = null,
) =>
  createTransaction(
    accountId,
    amount,
    remark,
    entryTimestamp,
    imageUri || null,
    entryKind,
    {sourceScheduleId},
  );

const executeAddAction = async (schedule, payload, entryTimestamp, sourceScheduleId) => {
  await createScheduledTransaction(
    schedule.account_id,
    Number(schedule.amount) || 0,
    String(payload?.note ?? schedule.remark ?? ''),
    entryTimestamp,
    String(payload?.imageUri || ''),
    sourceScheduleId,
  );
  return true;
};

const executeWithdrawAction = async (
  schedule,
  payload,
  entryTimestamp,
  sourceScheduleId,
) => {
  const amountValue = Math.abs(Number(schedule.amount) || 0);
  const sourceAccount = getAccountById(schedule.account_id);
  const withdrawAccount = getAccountById(
    payload?.targetAccountId || schedule.target_account_id || schedule.account_id,
  );
  if (!withdrawAccount) {
    return false;
  }

  const isCreditWithdrawViaExpensesFlow =
    payload?.isCreditWithdrawViaExpensesFlow === true &&
    String(sourceAccount?.account_type || '').trim().toLowerCase() === 'credit' &&
    String(withdrawAccount?.account_type || '').trim().toLowerCase() === 'expenses';
  if (String(sourceAccount?.account_type || '').trim().toLowerCase() === 'credit') {
    const creditLimitCheck = evaluateCreditLimitDelta({
      account: sourceAccount,
      currentBalance: calculateAccountBalance(sourceAccount.id),
      delta: -amountValue,
    });
    if (!creditLimitCheck.allowed) {
      return false;
    }
  }
  const strictEcoEnabled = await getStrictEcoEnabled();
  if (
    strictEcoEnabled &&
    withdrawAccount.account_type !== 'credit' &&
    !isCreditWithdrawViaExpensesFlow
  ) {
    const accountEntries = getTransactionsByAccount(withdrawAccount.id);
    const pendingEntries = [
      {
        id: 'pending-entry',
        amount: -amountValue,
        transaction_date: entryTimestamp,
        is_deleted: 0,
        orderIndex: 1,
      },
    ];

    if (
      !canWithdrawAtTimestampWithEntries(
        amountValue,
        entryTimestamp,
        accountEntries,
        pendingEntries,
      )
    ) {
      return false;
    }

    const balance = calculateAccountBalance(withdrawAccount.id);
    if (amountValue > balance) {
      return false;
    }
  }

  if (isCreditWithdrawViaExpensesFlow && sourceAccount?.id) {
    const note = String(payload?.note ?? schedule.remark ?? '').trim();
    const transferOutRemark = note
      ? `Transferred to ${withdrawAccount.account_name} - ${note}`
      : `Transferred to ${withdrawAccount.account_name}`;
    const transferInRemark = note
      ? `Transferred from ${sourceAccount.account_name} - ${note}`
      : `Transferred from ${sourceAccount.account_name}`;
    await createScheduledTransaction(
      sourceAccount.id,
      -amountValue,
      transferOutRemark,
      entryTimestamp,
      null,
      sourceScheduleId,
    );
    await createScheduledTransaction(
      withdrawAccount.id,
      amountValue,
      transferInRemark,
      entryTimestamp,
      null,
      sourceScheduleId,
    );
  }

  await createScheduledTransaction(
    withdrawAccount.id,
    -amountValue,
    String(payload?.note ?? schedule.remark ?? ''),
    entryTimestamp,
    String(payload?.imageUri || ''),
    sourceScheduleId,
  );

  if (payload?.logRemark && sourceAccount?.id) {
    await createScheduledTransaction(
      sourceAccount.id,
      0,
      String(payload.logRemark),
      entryTimestamp,
      null,
      sourceScheduleId,
    );
  }

  return true;
};

const executeTransferAction = async (
  schedule,
  payload,
  entryTimestamp,
  sourceScheduleId,
) => {
  const sourceAccount = getAccountById(schedule.account_id);
  const targetAccount = getAccountById(
    payload?.targetAccountId || schedule.target_account_id,
  );
  if (!sourceAccount || !targetAccount) {
    return false;
  }

  const amountValue = Math.abs(Number(schedule.amount) || 0);
  const note = String(payload?.note || schedule.remark || '').trim();
  if (String(sourceAccount?.account_type || '').trim().toLowerCase() === 'credit') {
    const creditLimitCheck = evaluateCreditLimitDelta({
      account: sourceAccount,
      currentBalance: calculateAccountBalance(sourceAccount.id),
      delta: -amountValue,
    });
    if (!creditLimitCheck.allowed) {
      return false;
    }
  }
  const strictEcoEnabled = await getStrictEcoEnabled();
  if (strictEcoEnabled && sourceAccount.account_type !== 'credit') {
    const sourceEntries = getTransactionsByAccount(sourceAccount.id);
    const pendingEntries = [
      {
        id: 'pending-entry',
        amount: -amountValue,
        transaction_date: entryTimestamp,
        is_deleted: 0,
        orderIndex: 1,
      },
    ];
    if (
      !canWithdrawAtTimestampWithEntries(
        amountValue,
        entryTimestamp,
        sourceEntries,
        pendingEntries,
      )
    ) {
      return false;
    }
    const balance = calculateAccountBalance(sourceAccount.id);
    if (amountValue > balance) {
      return false;
    }
  }

  const toRemark = note
    ? `Transferred to ${targetAccount.account_name} - ${note}`
    : `Transferred to ${targetAccount.account_name}`;
  const fromRemark = note
    ? `Transferred from ${sourceAccount.account_name} - ${note}`
    : `Transferred from ${sourceAccount.account_name}`;

  await createScheduledTransaction(
    sourceAccount.id,
    -amountValue,
    toRemark,
    entryTimestamp,
    null,
    sourceScheduleId,
  );
  await createScheduledTransaction(
    targetAccount.id,
    amountValue,
    fromRemark,
    entryTimestamp,
    null,
    sourceScheduleId,
  );
  return true;
};

const executeRequestAction = async (
  schedule,
  payload,
  entryTimestamp,
  sourceScheduleId,
) => {
  const destinationAccount = getAccountById(schedule.account_id);
  const targetAccount = getAccountById(
    payload?.targetAccountId || schedule.target_account_id,
  );
  if (!destinationAccount || !targetAccount) {
    return false;
  }

  const amountValue = Math.abs(Number(schedule.amount) || 0);
  const note = String(payload?.note || schedule.remark || '').trim();
  const isPayBillRequest =
    String(payload?.requestKind || '').trim().toLowerCase() === 'paybill' ||
    String(destinationAccount?.account_type || '').trim().toLowerCase() === 'credit';
  const strictEcoEnabled = await getStrictEcoEnabled();
  if (strictEcoEnabled) {
    const earningEntries = getTransactionsByAccount(targetAccount.id);
    const earningPending = [
      {
        id: 'pending-earning-request',
        amount: -amountValue,
        transaction_date: entryTimestamp,
        is_deleted: 0,
        orderIndex: 1,
      },
    ];
    if (
      !canWithdrawAtTimestampWithEntries(
        amountValue,
        entryTimestamp,
        earningEntries,
        earningPending,
      )
    ) {
      return false;
    }
    const earningBalance = calculateAccountBalance(targetAccount.id);
    if (earningBalance < amountValue) {
      return false;
    }
  }

  const fromRemark = isPayBillRequest
    ? note
      ? `Paid bill to ${destinationAccount.account_name} - ${note}`
      : `Paid bill to ${destinationAccount.account_name}`
    : note
      ? `Requested by ${destinationAccount.account_name} - ${note}`
      : `Requested by ${destinationAccount.account_name}`;
  const toRemark = isPayBillRequest
    ? note
      ? `Paid bill from ${targetAccount.account_name} - ${note}`
      : `Paid bill from ${targetAccount.account_name}`
    : note
      ? `Requested from ${targetAccount.account_name} - ${note}`
      : `Requested from ${targetAccount.account_name}`;

  await createScheduledTransaction(
    targetAccount.id,
    -amountValue,
    fromRemark,
    entryTimestamp,
    null,
    sourceScheduleId,
    isPayBillRequest ? 'pay_bill' : null,
  );
  await createScheduledTransaction(
    destinationAccount.id,
    amountValue,
    toRemark,
    entryTimestamp,
    null,
    sourceScheduleId,
    isPayBillRequest ? 'pay_bill' : null,
  );
  return true;
};

export const executeScheduledAction = async (
  schedule,
  actionPayload,
  runAt,
  sourceScheduleId,
) => {
  const entryTimestamp = normalizeTimestamp(runAt, Date.now());
  const payload =
    actionPayload && typeof actionPayload === 'object' ? actionPayload : {};

  switch (String(schedule?.action_type || 'add').toLowerCase()) {
    case 'withdraw':
      return executeWithdrawAction(schedule, payload, entryTimestamp, sourceScheduleId);
    case 'transfer':
      return executeTransferAction(schedule, payload, entryTimestamp, sourceScheduleId);
    case 'request':
      return executeRequestAction(schedule, payload, entryTimestamp, sourceScheduleId);
    case 'add':
    default:
      return executeAddAction(schedule, payload, entryTimestamp, sourceScheduleId);
  }
};
