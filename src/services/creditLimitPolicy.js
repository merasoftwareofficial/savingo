import {CREDIT_LIMIT_DEFAULT} from '../utils/creditLimitUtils';

const normalizeNumber = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAccountType = account => String(account?.account_type || '').trim().toLowerCase();

const getResolvedCreditLimit = account => {
  const resolved = Number(account?.credit_limit);
  if (Number.isFinite(resolved) && resolved >= 0) {
    return resolved;
  }
  return CREDIT_LIMIT_DEFAULT;
};

export const evaluateCreditLimitDelta = ({
  account = null,
  currentBalance = 0,
  delta = 0,
} = {}) => {
  if (normalizeAccountType(account) !== 'credit') {
    return {
      allowed: true,
      isCreditAccount: false,
      creditLimit: null,
      currentBalance: normalizeNumber(currentBalance),
      projectedBalance: normalizeNumber(currentBalance) + normalizeNumber(delta),
      delta: normalizeNumber(delta),
      remainingLimit: null,
      exceededBy: 0,
    };
  }

  const creditLimit = getResolvedCreditLimit(account);
  const resolvedCurrentBalance = normalizeNumber(currentBalance);
  const resolvedDelta = normalizeNumber(delta);
  const projectedBalance = resolvedCurrentBalance + resolvedDelta;
  const isDebtWorsening = projectedBalance < resolvedCurrentBalance;
  const isOverLimit = projectedBalance < -creditLimit;
  const remainingLimit = Math.max(0, creditLimit + projectedBalance);

  if (isOverLimit && isDebtWorsening) {
    return {
      allowed: false,
      isCreditAccount: true,
      creditLimit,
      currentBalance: resolvedCurrentBalance,
      projectedBalance,
      delta: resolvedDelta,
      remainingLimit,
      exceededBy: Math.abs(projectedBalance) - creditLimit,
      errorCode: 'CREDIT_LIMIT_EXCEEDED',
      message: `Selected credit limit reached. Remaining limit is ₹${Math.max(0, creditLimit + resolvedCurrentBalance).toLocaleString('en-IN')}.`,
    };
  }

  return {
    allowed: true,
    isCreditAccount: true,
    creditLimit,
    currentBalance: resolvedCurrentBalance,
    projectedBalance,
    delta: resolvedDelta,
    remainingLimit,
    exceededBy: 0,
  };
};

