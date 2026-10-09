export const CREDIT_LIMIT_MIN = 1000;
export const CREDIT_LIMIT_MAX = 500000;
export const CREDIT_LIMIT_DEFAULT = 5000;

export const formatCreditLimit = (value) => {
  if (!value && value !== 0) return '₹0';
  return `₹${value.toLocaleString('en-IN')}`;
};

export const isCreditAccount = (accountType) => accountType === 'credit';

export const getBillCycleConfig = () => null;
