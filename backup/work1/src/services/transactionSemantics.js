export const TRANSACTION_ENTRY_KIND = Object.freeze({
  NORMAL: 'normal',
  EARNING_WITHDRAW_LOG: 'earning_withdraw_log',
  CREDIT_WITHDRAW_LOG: 'credit_withdraw_log',
  TRANSFER: 'transfer',
  LEGACY_TRANSFER: 'legacy_transfer',
  REQUEST: 'request',
  PAY_BILL: 'pay_bill',
});

const normalizeText = value => String(value || '').trim().toLowerCase();

export const isPayBillTransaction = txn => {
  const entryKind = normalizeText(txn?.entry_kind);
  if (entryKind === TRANSACTION_ENTRY_KIND.PAY_BILL) {
    return true;
  }

  const remark = normalizeText(txn?.remark);
  return remark.startsWith('paid bill to ') || remark.startsWith('paid bill from ');
};

