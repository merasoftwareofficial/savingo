export const DASHBOARD_SHOW_SAVINGS_BALANCE_KEY =
  'dashboard_show_savings_balance_in_net';

export const isSavingAccount = account =>
  String(account?.account_type || '').trim().toLowerCase() === 'saving';

export const shouldIncludeAccountInNet = (account, showSavingsBalanceInNet = true) =>
  showSavingsBalanceInNet || !isSavingAccount(account);

export const calculateAccountsNetBalance = ({
  accounts = [],
  closingAccountBalances = {},
  showSavingsBalanceInNet = true,
  useHistoricalClosing = false,
}) =>
  (Array.isArray(accounts) ? accounts : []).reduce((total, account) => {
    if (!shouldIncludeAccountInNet(account, showSavingsBalanceInNet)) {
      return total;
    }
    if (useHistoricalClosing) {
      return total + (Number(closingAccountBalances?.[account.id]) || 0);
    }
    return total + (Number(account?.balance) || 0);
  }, 0);

export const getNetBalanceLabel = netBalance =>
  Number(netBalance) < 0 ? 'Outstanding' : 'Net Balance';
