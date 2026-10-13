import AsyncStorage from '@react-native-async-storage/async-storage';
import {initializeCoreDatabases} from './dbLifecycleManager';
import {
  DEFAULT_TAB_AUTO,
  DEFAULT_TAB_STORAGE_KEY,
} from '../utils/defaultTabPreference';
import {perfLog, perfNow} from '../utils/perfLogger';
import {FRESH_INSTALL_DISMISSED_NOTICE_KEYS} from '../utils/featureNotices';

export const FIRST_RUN_ORCHESTRATOR_ENABLED = true;

const FIRST_RUN_COMPLETED_KEY = 'app.firstRunCompleted';
const FIRST_RUN_DEFERRED_COMPLETED_KEY = 'app.firstRunDeferredCompleted';
const CHECKPOINT_PREFS_DONE_KEY = 'init.prefs.done';
const CHECKPOINT_FLAGS_DONE_KEY = 'init.flags.done';
const CHECKPOINT_DB_DONE_KEY = 'init.db.done';
const CHECKPOINT_CACHE_DONE_KEY = 'init.cache.done';
const STARTUP_CACHE_SUMMARY_KEY = 'dashboard.cache.summary.v1';
const STARTUP_CACHE_PROFILE_KEY = 'user.cache.profile.v1';
const STARTUP_CACHE_META_KEY = 'startup.cache.meta.v1';

const markCheckpointDone = async checkpointKey => {
  await AsyncStorage.setItem(checkpointKey, 'true');
};

const isCheckpointDone = async checkpointKey => {
  const value = await AsyncStorage.getItem(checkpointKey);
  return value === 'true';
};

const runStep = async (stepName, checkpointKey, handler) => {
  const startedAt = perfNow();
  if (await isCheckpointDone(checkpointKey)) {
    perfLog('first-run', 'step-skipped', {
      stepName,
      reason: 'already-done',
    });
    return {stepName, skipped: true};
  }
  perfLog('first-run', 'step-start', {stepName});
  await handler();
  await markCheckpointDone(checkpointKey);
  perfLog('first-run', 'step-end', {
    stepName,
    durationMs: Math.max(0, perfNow() - startedAt),
  });
  return {stepName, skipped: false};
};

const ensureMinimalPrefsDefaults = async () => {
  const tabValue = String(
    (await AsyncStorage.getItem(DEFAULT_TAB_STORAGE_KEY)) || '',
  ).trim();
  if (!tabValue) {
    await AsyncStorage.setItem(DEFAULT_TAB_STORAGE_KEY, DEFAULT_TAB_AUTO);
  }
};

const ensureFirstRunFlags = async () => {
  const value = await AsyncStorage.getItem('home.notificationPermissionPrompt.v1');
  if (value == null) {
    await AsyncStorage.setItem('home.notificationPermissionPrompt.v1', 'false');
  }
  // "Now available" notices are for users who had the app before; a new install skips them.
  await AsyncStorage.multiSet(
    FRESH_INSTALL_DISMISSED_NOTICE_KEYS.map(key => [key, 'true']),
  );
};

const ensureCoreDatabasesInitialized = async () => {
  const result = initializeCoreDatabases();
  if (!result.ok) {
    throw new Error('core_database_init_failed');
  }
};

const ensureCacheContainersInitialized = async () => {
  const pairs = await AsyncStorage.multiGet([
    STARTUP_CACHE_SUMMARY_KEY,
    STARTUP_CACHE_PROFILE_KEY,
    STARTUP_CACHE_META_KEY,
  ]);
  const updates = [];
  pairs.forEach(([key, value]) => {
    const normalized = String(value || '').trim();
    if (normalized) {
      return;
    }
    if (key === STARTUP_CACHE_META_KEY) {
      updates.push([key, JSON.stringify({createdAt: Date.now()})]);
      return;
    }
    updates.push([key, '{}']);
  });
  if (updates.length > 0) {
    await AsyncStorage.multiSet(updates);
  }
};

export const runFirstLaunchPhaseA = async () => {
  if (!FIRST_RUN_ORCHESTRATOR_ENABLED) {
    perfLog('first-run', 'orchestrator-disabled');
    return {ran: false, reason: 'flag-disabled'};
  }

  const firstRunCompleted = await AsyncStorage.getItem(FIRST_RUN_COMPLETED_KEY);
  if (firstRunCompleted === 'true') {
    perfLog('first-run', 'orchestrator-skipped', {
      reason: 'already-completed',
    });
    return {ran: false, reason: 'already-completed'};
  }

  const orchestrationStartedAt = perfNow();
  perfLog('first-run', 'orchestrator-start');
  try {
    await runStep('prefs', CHECKPOINT_PREFS_DONE_KEY, ensureMinimalPrefsDefaults);
    await runStep('flags', CHECKPOINT_FLAGS_DONE_KEY, ensureFirstRunFlags);
    await AsyncStorage.setItem(FIRST_RUN_COMPLETED_KEY, 'true');
    perfLog('first-run', 'orchestrator-end', {
      completed: true,
      durationMs: Math.max(0, perfNow() - orchestrationStartedAt),
    });
    return {ran: true, completed: true};
  } catch (error) {
    perfLog('first-run', 'orchestrator-error', {
      error: String(error?.message || error || 'unknown'),
      durationMs: Math.max(0, perfNow() - orchestrationStartedAt),
    });
    return {ran: true, completed: false};
  }
};

export const runFirstLaunchDeferredPhase = async () => {
  if (!FIRST_RUN_ORCHESTRATOR_ENABLED) {
    return {ran: false, reason: 'flag-disabled'};
  }

  const deferredCompleted = await AsyncStorage.getItem(FIRST_RUN_DEFERRED_COMPLETED_KEY);
  if (deferredCompleted === 'true') {
    perfLog('first-run', 'deferred-skipped', {
      reason: 'already-completed',
    });
    return {ran: false, reason: 'already-completed'};
  }

  const startedAt = perfNow();
  perfLog('first-run', 'deferred-start');
  try {
    await runStep('db', CHECKPOINT_DB_DONE_KEY, ensureCoreDatabasesInitialized);
    await runStep('cache', CHECKPOINT_CACHE_DONE_KEY, ensureCacheContainersInitialized);
    await AsyncStorage.setItem(FIRST_RUN_DEFERRED_COMPLETED_KEY, 'true');
    perfLog('first-run', 'deferred-end', {
      completed: true,
      durationMs: Math.max(0, perfNow() - startedAt),
    });
    return {ran: true, completed: true};
  } catch (error) {
    perfLog('first-run', 'deferred-error', {
      error: String(error?.message || error || 'unknown'),
      durationMs: Math.max(0, perfNow() - startedAt),
    });
    return {ran: true, completed: false};
  }
};
