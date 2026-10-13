import AsyncStorage from '@react-native-async-storage/async-storage';
import {ensureCoreDatabasesReady} from './dbLifecycleManager';
import {readCachedSessionUser} from './sessionService';
import {getBackupProfileGateState} from '../utils/profileSetupGate';

export const POST_LOGIN_REQUIRED_ROUTE_KEY = 'auth.requiredRouteAfterLogin';
export const BACKUP_RESTORE_PENDING_KEY = 'backup.restorePending';
export const STARTUP_READINESS_INVARIANTS = Object.freeze({
  accountsVisibleWithoutRestart: 'startup.accounts.visible_without_restart',
  themeAppliedWithoutRestart: 'startup.theme.applied_without_restart',
});

export const isStartupPlaceholderRoute = routeName => {
  const normalizedRoute = String(routeName || '').trim();
  return (
    normalizedRoute === 'Login' ||
    normalizedRoute === 'PreparingApp' ||
    normalizedRoute === 'Boot' ||
    !normalizedRoute
  );
};

export const hasResolvedStartupUserPayload = payload =>
  Boolean(
    String(payload?.firebaseUid || '').trim() ||
      String(payload?.email || '').trim() ||
      String(payload?.username || '').trim()
  );

const normalizeRouteName = routeName => String(routeName || '').trim();

// Signed-in users always open the app. Profile setup is never forced at login:
// it is reached from the "Profile setup pending" ribbon, the Ledger add-contact
// prompt or More > Profile Settings. Older stored values ('ProfileSetup') are
// therefore ignored.
export const POST_LOGIN_ROUTE = 'Home';

export const getResolvedStartupRequiredRoute = () => POST_LOGIN_ROUTE;

export const getStartupSessionFlags = async () => {
  try {
    const entries = await AsyncStorage.multiGet([
      BACKUP_RESTORE_PENDING_KEY,
      POST_LOGIN_REQUIRED_ROUTE_KEY,
    ]);
    const values = Object.fromEntries(entries);
    return {
      restoreDecisionPending:
        String(values[BACKUP_RESTORE_PENDING_KEY] || '').trim() === 'true',
      postLoginRequiredRoute: String(
        values[POST_LOGIN_REQUIRED_ROUTE_KEY] || ''
      ).trim(),
    };
  } catch {
    return {
      restoreDecisionPending: false,
      postLoginRequiredRoute: '',
    };
  }
};

export const resolveStartupSessionFlagsForUser = async ({
  userPayload,
  restoreDecisionPending = null,
  postLoginRequiredRoute = '',
} = {}) => {
  const requiredRoute = getResolvedStartupRequiredRoute({
    userPayload,
    postLoginRequiredRoute,
  });

  if (typeof restoreDecisionPending === 'boolean') {
    return {
      requiredRoute,
      restoreDecisionPending: restoreDecisionPending === true,
    };
  }

  try {
    const gate = await getBackupProfileGateState(userPayload || {});
    return {
      requiredRoute,
      restoreDecisionPending: gate.ready === true,
    };
  } catch {
    return {
      requiredRoute,
      restoreDecisionPending: false,
    };
  }
};

export const writeStartupSessionFlags = async ({
  userPayload,
  restoreDecisionPending = false,
  postLoginRequiredRoute = '',
}) => {
  const resolvedFlags = await resolveStartupSessionFlagsForUser({
    userPayload,
    restoreDecisionPending,
    postLoginRequiredRoute,
  });
  const requiredRoute = resolvedFlags.requiredRoute;
  const shouldRestore = resolvedFlags.restoreDecisionPending === true;
  await AsyncStorage.multiSet([
    [BACKUP_RESTORE_PENDING_KEY, shouldRestore ? 'true' : 'false'],
    [POST_LOGIN_REQUIRED_ROUTE_KEY, requiredRoute],
  ]);
  return {
    requiredRoute,
    restoreDecisionPending: shouldRestore,
  };
};

export const clearStartupSessionFlags = async ({
  restoreDecisionPending = false,
} = {}) => {
  await AsyncStorage.setItem(
    BACKUP_RESTORE_PENDING_KEY,
    restoreDecisionPending ? 'true' : 'false',
  );
  await AsyncStorage.removeItem(POST_LOGIN_REQUIRED_ROUTE_KEY);
};

export const clearStartupStateForLogout = async ({firebaseUid} = {}) => {
  const uid = String(firebaseUid || '').trim();
  const keys = [BACKUP_RESTORE_PENDING_KEY, POST_LOGIN_REQUIRED_ROUTE_KEY];
  if (uid) {
    // Legacy per-user "Set Up Later" flag; no longer written, removed on logout.
    keys.push(`profileSetup.skipped.${uid}`);
  }
  await AsyncStorage.multiRemove(keys);
};

export const readStoredStartupUserPayload = async () => {
  try {
    return await readCachedSessionUser();
  } catch {
    return {};
  }
};

export const ensureStartupHomeReadiness = async () => {
  const readiness = ensureCoreDatabasesReady();
  return {
    ready: readiness.ready,
    accountsCount: readiness.accountsCount,
    hasEarning: readiness.hasEarning,
    hasExpenses: readiness.hasExpenses,
    hasSaving: readiness.hasSaving,
    initOk: readiness.initialized?.ok === true,
    verifyOk: readiness.verified?.ok === true,
  };
};

export const resolveStartupTargetRoute = ({
  isAuthenticated,
  currentRouteName,
  userPayload,
  restoreDecisionPending = false,
  postLoginRequiredRoute = '',
  allowHomeRoutes = null,
}) => {
  if (!isAuthenticated) {
    return normalizeRouteName(currentRouteName) !== 'Login'
      ? {routeName: 'Login'}
      : null;
  }

  const hasUserPayload = hasResolvedStartupUserPayload(userPayload);
  const isPlaceholderRoute = isStartupPlaceholderRoute(currentRouteName);
  const requiredRoute = getResolvedStartupRequiredRoute({
    userPayload,
    postLoginRequiredRoute,
  });
  const needsPreparingRoute = restoreDecisionPending === true;

  if (isPlaceholderRoute && !hasUserPayload) {
    return {waitForUserPayload: true};
  }

  if (
    needsPreparingRoute &&
    isPlaceholderRoute &&
    normalizeRouteName(currentRouteName) !== 'PreparingApp'
  ) {
    return {
      routeName: 'PreparingApp',
      readinessIntents: {
        needsAccountBootstrap: true,
        needsThemeHydration: true,
        invariants: STARTUP_READINESS_INVARIANTS,
      },
    };
  }

  const canOpenResolvedRoute = Array.isArray(allowHomeRoutes)
    ? allowHomeRoutes.includes(normalizeRouteName(currentRouteName))
    : isPlaceholderRoute;

  const readinessIntents = {
    needsAccountBootstrap: true,
    needsThemeHydration: true,
    invariants: STARTUP_READINESS_INVARIANTS,
  };

  if (
    !needsPreparingRoute &&
    hasUserPayload &&
    canOpenResolvedRoute
  ) {
    return {routeName: requiredRoute, readinessIntents};
  }

  return null;
};
