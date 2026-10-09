const DASHBOARD_LOG_PREFIX = '[DASHBOARD]';

export const getDashboardAccountLogPayload = account => ({
  accountId: String(account?.id ?? ''),
  accountName: String(account?.account_name ?? '').trim(),
  accountType: String(account?.account_type ?? '').trim(),
  isPrimary: Number(account?.is_primary) === 1,
});

export const logDashboardEvent = (eventName, payload = {}) => {
  console.log(`${DASHBOARD_LOG_PREFIX} ${eventName}`, {
    timestamp: new Date().toISOString(),
    ...payload,
  });
};

