import {
  getAllAccounts,
  initAccountsDatabase,
  resetAccountsDatabaseConnection,
} from './accountsDatabase';
import {
  initTransactionsDatabase,
  resetTransactionsDatabaseConnection,
} from './transactionsDatabase';
import {
  initRecurringDatabase,
  resetRecurringDatabaseConnection,
} from './recurringDatabase';
import {
  getAllContactBalances,
  initLedgerDatabase,
  resetLedgerDatabaseConnection,
} from './ledgerDatabase';
import {
  getConversations,
  initChatDatabase,
  resetChatDatabaseConnection,
} from './chatDatabase';
import {initDatabase, resetLocalDatabaseConnection} from './database';
import {resetMessagingServiceDatabaseState} from './messagingService';
import {resetChatNotificationActionServiceState} from './chatNotificationActionService';

const REQUIRED_ACCOUNT_TYPES = ['earning', 'expenses', 'saving'];

const runSafeStep = (label, handler) => {
  try {
    const result = handler();
    return {
      ok: true,
      label,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      label,
      error: String(error?.message || error || 'unknown'),
    };
  }
};

const ensureStepsReady = (scope, steps) => {
  const failedStep = steps.find(step => !step.ok);
  if (failedStep) {
    throw new Error(
      `[${scope}] ${failedStep.label} failed: ${failedStep.error || 'unknown'}`
    );
  }

  return {
    ok: true,
    scope,
    steps,
  };
};

const ensureStepsReadyWithRecovery = (scope, initSteps, resetSteps = []) => {
  const runInit = () =>
    ensureStepsReady(
      scope,
      initSteps.map(step => runSafeStep(step.label, step.handler)),
    );

  try {
    return runInit();
  } catch {
    resetSteps.forEach(step => {
      runSafeStep(step.label, step.handler);
    });
    return runInit();
  }
};

export const resetCoreDatabaseConnections = () => {
  const steps = [
    runSafeStep('chat:runtime:messaging-reset', resetMessagingServiceDatabaseState),
    runSafeStep('chat:runtime:notif-reset', resetChatNotificationActionServiceState),
    runSafeStep('local', resetLocalDatabaseConnection),
    runSafeStep('accounts', resetAccountsDatabaseConnection),
    runSafeStep('transactions', resetTransactionsDatabaseConnection),
    runSafeStep('ledger', resetLedgerDatabaseConnection),
    runSafeStep('chat', resetChatDatabaseConnection),
  ];

  return {
    ok: steps.every(step => step.ok),
    steps,
  };
};

export const ensureLedgerDatabaseReady = () =>
  ensureStepsReadyWithRecovery(
    'ledger-db',
    [{label: 'ledger:init', handler: initLedgerDatabase}],
    [{label: 'ledger:reset', handler: resetLedgerDatabaseConnection}],
  );

export const ensureTransactionsDatabaseReady = () =>
  ensureStepsReadyWithRecovery(
    'transactions-db',
    [{label: 'transactions:init', handler: initTransactionsDatabase}],
    [{label: 'transactions:reset', handler: resetTransactionsDatabaseConnection}],
  );

export const ensureBackgroundScheduleDatabasesReady = () => {
  return ensureStepsReadyWithRecovery(
    'background-schedule-db',
    [
      {label: 'accounts:init', handler: initAccountsDatabase},
      {label: 'transactions:init', handler: initTransactionsDatabase},
      {label: 'recurring:init', handler: initRecurringDatabase},
    ],
    [
      {label: 'accounts:reset', handler: resetAccountsDatabaseConnection},
      {label: 'transactions:reset', handler: resetTransactionsDatabaseConnection},
      {label: 'recurring:reset', handler: resetRecurringDatabaseConnection},
    ],
  );
};

export const ensureChatDatabaseReady = () =>
  ensureStepsReadyWithRecovery(
    'chat-db',
    [{label: 'chat:init', handler: initChatDatabase}],
    [{label: 'chat:reset', handler: resetChatDatabaseConnection}],
  );

export const ensureLedgerFeatureDatabasesReady = () =>
  ensureStepsReadyWithRecovery(
    'ledger-feature',
    [
      {label: 'ledger:init', handler: initLedgerDatabase},
      {label: 'chat:init', handler: initChatDatabase},
    ],
    [
      {label: 'ledger:reset', handler: resetLedgerDatabaseConnection},
      {label: 'chat:reset', handler: resetChatDatabaseConnection},
    ],
  );

export const ensureLedgerDetailDatabasesReady = () =>
  ensureStepsReadyWithRecovery(
    'ledger-detail',
    [
      {label: 'accounts:init', handler: initAccountsDatabase},
      {label: 'transactions:init', handler: initTransactionsDatabase},
      {label: 'ledger:init', handler: initLedgerDatabase},
      {label: 'chat:init', handler: initChatDatabase},
    ],
    [
      {label: 'accounts:reset', handler: resetAccountsDatabaseConnection},
      {label: 'transactions:reset', handler: resetTransactionsDatabaseConnection},
      {label: 'ledger:reset', handler: resetLedgerDatabaseConnection},
      {label: 'chat:reset', handler: resetChatDatabaseConnection},
    ],
  );

export const initializeCoreDatabases = () => {
  const steps = [
    runSafeStep('local:init', initDatabase),
    runSafeStep('accounts:init', initAccountsDatabase),
    runSafeStep('transactions:init', initTransactionsDatabase),
    runSafeStep('ledger:init', initLedgerDatabase),
    runSafeStep('chat:init', initChatDatabase),
  ];

  return {
    ok: steps.every(step => step.ok),
    steps,
  };
};

export const verifyCoreDatabaseReadiness = () => {
  const accountsResult = runSafeStep('accounts:read', () => getAllAccounts());
  const ledgerResult = runSafeStep('ledger:read', () => getAllContactBalances());
  const chatResult = runSafeStep('chat:read', () => getConversations());

  const accounts = Array.isArray(accountsResult.result) ? accountsResult.result : [];
  const accountTypes = new Set(
    accounts.map(account =>
      String(account?.account_type || '').trim().toLowerCase()
    )
  );

  const readiness = {
    accountsCount: accounts.length,
    hasEarning: accountTypes.has('earning'),
    hasExpenses: accountTypes.has('expenses'),
    hasSaving: accountTypes.has('saving'),
    hasCredit: accountTypes.has('credit'),
  };

  return {
    ok:
      accountsResult.ok &&
      ledgerResult.ok &&
      chatResult.ok &&
      REQUIRED_ACCOUNT_TYPES.every(type => accountTypes.has(type)),
    steps: [accountsResult, ledgerResult, chatResult],
    ...readiness,
  };
};

export const ensureCoreDatabasesReady = () => {
  const initialized = initializeCoreDatabases();
  const verified = verifyCoreDatabaseReadiness();

  return {
    ok: initialized.ok && verified.ok,
    initialized,
    verified,
    ready: initialized.ok && verified.ok,
    accountsCount: verified.accountsCount,
    hasEarning: verified.hasEarning,
    hasExpenses: verified.hasExpenses,
    hasSaving: verified.hasSaving,
    hasCredit: verified.hasCredit,
  };
};

export const reinitializeCoreDatabasesAfterRestore = () => {
  const reset = resetCoreDatabaseConnections();
  const readyState = ensureCoreDatabasesReady();

  return {
    ok: reset.ok && readyState.ok,
    reset,
    readyState,
  };
};
