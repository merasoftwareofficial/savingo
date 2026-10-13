/**
 * Account Android App
 * Main App Entry Point
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { enableScreens } from 'react-native-screens';
import {
  StatusBar,
  View,
  StyleSheet,
  InteractionManager,
  Alert,
  Modal,
  Text,
  TouchableOpacity,
  AppState,
  NativeModules,
  Platform,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator, {navigationRef} from './src/navigation/AppNavigator';
import { ChatStoreProvider } from './src/context/ChatStore';
import { ToastProvider } from './src/context/ToastContext';
import {
  HeaderTextureProvider,
  useHeaderTextureTheme,
} from './src/context/HeaderTextureContext';
import {ThemeProvider, useTheme} from './src/context/ThemeContext';
import {AppAlertProvider} from './src/context/AppAlertContext';
import {SessionUserProvider} from './src/context/SessionUserContext';
import ToastContainer from './src/components/ToastContainer';
import {getResolvedHeaderTextureTheme} from './src/utils/headerTextureTheme';
import {
  checkAndroidInAppUpdate,
  openPlayStoreForUpdate,
  startAndroidFlexibleUpdate,
} from './src/services/inAppUpdateService';
import { processPendingLedgerEvents } from './src/services/ledgerSyncService';
import {getAllAccounts, initAccountsDatabase} from './src/services/accountsDatabase';
import {consumePendingChatNavigation} from './src/services/notificationNavigationService';
import {
  consumePendingPhoneClaimNavigation,
  subscribeToPendingPhoneClaimUpdates,
} from './src/services/phoneClaimNavigationService';
import {initMessagingService} from './src/services/messagingService';
import {
  consumeInitialChatNotificationAction,
  flushPendingChatNotificationActions,
  registerForegroundChatNotificationActions,
} from './src/services/chatNotificationActionService';
import {getPhoneClaimsInbox, respondToPhoneClaim} from './src/services/api';
import {
  runFirstLaunchDeferredPhase,
  runFirstLaunchPhaseA,
} from './src/services/startupOrchestrator';
import {startLedgerDomainShadowEventBridge} from './src/services/ledgerDomain/ledgerDomainShadowService';
import {
  ensureStartupHomeReadiness,
  getStartupSessionFlags,
  readStoredStartupUserPayload,
  resolveStartupTargetRoute,
} from './src/services/startupCoordinator';
import {readCachedSessionUser, writeCachedSessionUser} from './src/services/sessionService';
import PhoneClaimDecisionModal from './src/components/PhoneClaimDecisionModal';
import {createPerfTimer, perfLog, perfNow} from './src/utils/perfLogger';
// import { initializeChatFeature } from './src/services/chatInitializer';

type StartupGlobal = {
  __startupTimestamps?: Record<string, number>;
};
type PhoneClaimModalState = {
  claimId: string;
  requesterName: string;
  phoneLastFour: string;
  phoneNormalized: string;
};
declare const global: any;

enableScreens(true);

const FEATURE_FLAGS = {
  startupSplashlessEnabled: true,
  notifV3RouterEnabled: true,
  launchCoordinatorV1Enabled: true,
};
const STARTUP_ROUTE_RESOLVE_MIN_GAP_MS = 500;
const PHONE_CLAIM_SYNC_COOLDOWN_MS = 30000;
const LAUNCH_SURFACE_COLOR = '#111318';

function AppContent() {
  const {themeId, isReady: isHeaderThemeReady} = useHeaderTextureTheme();
  const {colors, isDark, isReady: isThemeReady} = useTheme();
  const [updateVisible, setUpdateVisible] = useState(false);
  const [updatingNow, setUpdatingNow] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [storeVersion, setStoreVersion] = useState('');
  const [currentVersionName, setCurrentVersionName] = useState('');
  const [startupP0Ready, setStartupP0Ready] = useState(false);
  const [activePhoneClaim, setActivePhoneClaim] = useState<PhoneClaimModalState | null>(null);
  const [phoneClaimActionLoading, setPhoneClaimActionLoading] = useState('');
  const appContentMountedAtRef = useRef(perfNow());
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedHeaderTheme = useMemo(
    () => getResolvedHeaderTextureTheme(themeId, isDark),
    [themeId, isDark],
  );
  const statusBarStyle = resolvedHeaderTheme?.statusBarStyle || 'light-content';
  const checkingUpdateRef = useRef(false);
  const currentAppStateRef = useRef(AppState.currentState);
  const navigationReadyRef = useRef(false);
  const shortcutInProgressRef = useRef(false);
  const pendingChatOpenInProgressRef = useRef(false);
  const pendingChatOpenScheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChatActionFlushInProgressRef = useRef(false);
  const postNavDeferredWorkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialChatActionConsumeInProgressRef = useRef(false);
  const startupRouteResolveInProgressRef = useRef(false);
  const startupRouteResolvedRef = useRef(false);
  const startupRouteResolveLastAttemptAtRef = useRef(0);
  const messagingInitForUidRef = useRef('');
  const startupUpdateCheckQueuedRef = useRef(false);
  const startupLedgerSyncQueuedRef = useRef(false);
  const startupDeferredRoutePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupDeferredUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupDeferredLedgerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupDeferredMessagingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupDeferredNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneClaimSyncInFlightRef = useRef(false);
  const lastPhoneClaimSyncAtRef = useRef(0);

  const isNavigationReady = useCallback(
    () =>
      Platform.OS !== 'android' ||
      (navigationReadyRef.current && Boolean(navigationRef?.isReady?.())),
    [],
  );

  const isDashboardReadyRoute = useCallback(
    (routeName: string) => routeName === 'Home',
    [],
  );

  const scheduleDashboardDeferredStartupWork = useCallback(
    () => {
      if (Platform.OS !== 'android' || !startupP0Ready || !isNavigationReady()) {
        return false;
      }
      const currentRouteName = String(navigationRef.getCurrentRoute?.()?.name || '');
      if (!isDashboardReadyRoute(currentRouteName)) {
        return false;
      }

      if (!startupUpdateCheckQueuedRef.current) {
        startupUpdateCheckQueuedRef.current = true;
        startupDeferredUpdateTimerRef.current = setTimeout(() => {
          startupDeferredUpdateTimerRef.current = null;
          runUpdateCheck();
        }, 500);
      }

      if (!startupLedgerSyncQueuedRef.current) {
        startupLedgerSyncQueuedRef.current = true;
        startupDeferredLedgerTimerRef.current = setTimeout(() => {
          startupDeferredLedgerTimerRef.current = null;
          perfLog('startup', 'pending ledger sync start:deferred');
          processPendingLedgerEvents()
            .then(() => {
              perfLog('startup', 'pending ledger sync complete:deferred');
            })
            .catch(error => {
              console.error('Failed to process pending ledger events:', error);
              perfLog('startup', 'pending ledger sync failed:deferred');
            });
        }, 1400);
      }

      return true;
    },
    [isDashboardReadyRoute, isNavigationReady, runUpdateCheck, startupP0Ready],
  );

  // Messaging belongs to the signed-in account, not to the focused screen:
  // getCurrentRoute() returns the nested tab ('Dashboard'), so a route gate
  // could miss 'Home' and leave FCM listeners/receipt recovery unregistered.
  const scheduleMessagingInitForUser = useCallback((uid: string) => {
    const nextUid = String(uid || '').trim();
    if (!nextUid || messagingInitForUidRef.current === nextUid) {
      return;
    }
    if (startupDeferredMessagingTimerRef.current) {
      clearTimeout(startupDeferredMessagingTimerRef.current);
    }
    messagingInitForUidRef.current = nextUid;
    startupDeferredMessagingTimerRef.current = setTimeout(() => {
      startupDeferredMessagingTimerRef.current = null;
      if (auth().currentUser?.uid !== nextUid) {
        messagingInitForUidRef.current = '';
        return;
      }
      initMessagingService().catch(error => {
        messagingInitForUidRef.current = '';
        console.error('[FCM] deferred init failed:', error);
      });
    }, 2200);
  }, []);

  const normalizePhoneClaimModalState = useCallback(
    (claim: Record<string, any> | null | undefined): PhoneClaimModalState | null => {
      const claimId = String(claim?._id || claim?.claimId || '').trim();
      if (!claimId) {
        return null;
      }
      const requester =
        claim?.requester && typeof claim.requester === 'object' ? claim.requester : {};
      const phoneNormalized = String(
        claim?.phoneNormalized || claim?.phone_normalized || '',
      ).trim();
      return {
        claimId,
        requesterName: String(
          requester?.displayName || requester?.username || requester?.email || claim?.requesterName || 'User',
        ).trim() || 'User',
        phoneLastFour:
          String(claim?.phoneLastFour || '').trim() ||
          (phoneNormalized ? phoneNormalized.slice(-4) : ''),
        phoneNormalized,
      };
    },
    [],
  );

  const syncPendingPhoneClaimModal = useCallback(
    async ({
      launchSource = 'unknown',
      authState = {authenticated: false},
      pendingEvent,
      allowFetchWithoutPending = false,
      force = false,
    }: {
      launchSource?: string;
      authState?: {authenticated: boolean};
      pendingEvent?: Record<string, any> | null;
      allowFetchWithoutPending?: boolean;
      force?: boolean;
    } = {}) => {
      if (
        Platform.OS !== 'android' ||
        !authState?.authenticated ||
        phoneClaimSyncInFlightRef.current
      ) {
        return false;
      }
      const now = perfNow();
      const sinceLastSyncMs = now - lastPhoneClaimSyncAtRef.current;
      if (
        !force &&
        lastPhoneClaimSyncAtRef.current > 0 &&
        sinceLastSyncMs < PHONE_CLAIM_SYNC_COOLDOWN_MS
      ) {
        perfLog('phone-claim', 'sync-skipped-cooldown', {
          launchSource,
          sinceLastSyncMs: Math.max(0, Math.round(sinceLastSyncMs)),
        });
        return false;
      }

      phoneClaimSyncInFlightRef.current = true;
      lastPhoneClaimSyncAtRef.current = now;
      try {
        const resolvedPendingEvent =
          pendingEvent ||
          (await consumePendingPhoneClaimNavigation({
            launchSource,
            authState,
          }));
        if (!allowFetchWithoutPending && !resolvedPendingEvent) {
          perfLog('phone-claim', 'sync-skipped-no-pending-event', {
            launchSource,
          });
          return false;
        }

        const response = await getPhoneClaimsInbox();
        const claims = Array.isArray(response?.claims) ? response.claims : [];
        if (!claims.length) {
          setActivePhoneClaim(null);
          return false;
        }

        const preferredClaimId =
          String(
            resolvedPendingEvent?.type === 'phone_claim_request'
              ? resolvedPendingEvent?.claimId
              : '',
          ).trim() || '';
        const selectedClaim =
          claims.find(
            item => String(item?._id || '').trim() === preferredClaimId,
          ) || claims[0];
        const nextClaim = normalizePhoneClaimModalState(selectedClaim);
        setActivePhoneClaim(nextClaim);
        return Boolean(nextClaim);
      } catch (error) {
        console.error('[PHONE_CLAIM] modal sync failed:', error);
        return false;
      } finally {
        phoneClaimSyncInFlightRef.current = false;
      }
    },
    [normalizePhoneClaimModalState],
  );

  const navigateOwnerToSetNewNumber = useCallback(async (updatedUser: Record<string, any>) => {
    if (!isNavigationReady()) {
      return;
    }
    navigationRef.navigate('ProfileSettingsNative', {
      user: updatedUser,
      profileOnly: true,
    });
  }, [isNavigationReady]);

  const handlePhoneClaimDecision = useCallback(
    async (action: 'approve' | 'reject' | 'block') => {
      const claim = activePhoneClaim;
      if (!claim?.claimId || phoneClaimActionLoading) {
        return;
      }

      setPhoneClaimActionLoading(action);
      try {
        const response = await respondToPhoneClaim(claim.claimId, action, {
          pinApproved: action === 'approve',
        });

        setActivePhoneClaim(null);

        if (action === 'approve') {
          try {
            const storedUser = await readCachedSessionUser();
            const currentUserOwnsClaimPhone =
              String(storedUser?.mobileNormalized || '').trim() ===
              String(claim.phoneNormalized || '').trim();
            const updatedUser = {
              ...(storedUser || {}),
              mobile: currentUserOwnsClaimPhone ? null : storedUser?.mobile || null,
              phoneNumber:
                currentUserOwnsClaimPhone
                  ? null
                  : storedUser?.phoneNumber || storedUser?.mobile || null,
              mobileNormalized:
                currentUserOwnsClaimPhone
                  ? null
                  : storedUser?.mobileNormalized || null,
              setupComplete:
                currentUserOwnsClaimPhone ? false : storedUser?.setupComplete,
            };
            await writeCachedSessionUser(updatedUser);
            Alert.alert(
              'Number Transferred',
              'This number has been transferred. You now need to set a new number for your account.',
              [
                {text: 'Later', style: 'cancel'},
                {
                  text: 'Set New Number',
                  onPress: () => {
                    void navigateOwnerToSetNewNumber(updatedUser);
                  },
                },
              ],
            );
          } catch (userSyncError) {
            console.error('[PHONE_CLAIM] approve local user sync failed:', userSyncError);
          }
        } else {
          Alert.alert('Success', response?.message || 'Request updated successfully.');
        }

        await syncPendingPhoneClaimModal({
          launchSource: `after-${action}`,
          authState: {authenticated: true},
          allowFetchWithoutPending: true,
        });
      } catch (error: any) {
        Alert.alert(
          'Error',
          error?.message ||
            `Failed to ${action === 'block' ? 'reject and block' : action} request.`,
        );
      } finally {
        setPhoneClaimActionLoading('');
      }
    },
    [
      activePhoneClaim,
      navigateOwnerToSetNewNumber,
      phoneClaimActionLoading,
      syncPendingPhoneClaimModal,
    ],
  );

  const processPendingAccountShortcut = useCallback(async () => {
    if (Platform.OS !== 'android' || shortcutInProgressRef.current) {
      return;
    }
    const accountShortcutModule = NativeModules?.AccountShortcut;
    if (!accountShortcutModule?.consumePendingShortcut) {
      return;
    }
    if (!isNavigationReady()) {
      return;
    }
    const currentRoute = navigationRef.getCurrentRoute()?.name;
    if (
      !currentRoute ||
      currentRoute === 'Login' ||
      currentRoute === 'ProfileSetup'
    ) {
      return;
    }

    shortcutInProgressRef.current = true;
    try {
      const payload = await accountShortcutModule.consumePendingShortcut();
      const accountId = String(payload?.accountId || '').trim();
      if (!accountId) {
        return;
      }

      initAccountsDatabase();
      const accounts = getAllAccounts();
      const targetAccount = accounts.find(
        item => String(item.id) === accountId
      );
      if (!targetAccount) {
        (navigationRef as any).navigate('Home');
        return;
      }

      const routeName =
        targetAccount.account_type === 'earning'
          ? 'AccountDetail'
          : 'ExpensesAccountDetail';
      (navigationRef as any).navigate(routeName, {
        account: targetAccount,
        openedFromShortcut: true,
      });
    } catch (error) {
      console.error('Failed to process pending shortcut in App:', error);
    } finally {
      shortcutInProgressRef.current = false;
    }
  }, [isNavigationReady]);

  const runUpdateCheck = useCallback(async () => {
    const perf = createPerfTimer('startup', 'update-check');
    if (Platform.OS !== 'android' || checkingUpdateRef.current) {
      perf.end({skipped: true});
      return;
    }
    checkingUpdateRef.current = true;
    try {
      const resolvedVersionName =
        String(NativeModules?.VersionInfo?.versionName || '').trim();
      setCurrentVersionName(resolvedVersionName);
      const currentVersion = resolvedVersionName || '0.0.0';
      const result = await checkAndroidInAppUpdate(currentVersion);
      if (result?.shouldUpdate) {
        setStoreUrl(result.storeUrl || '');
        setStoreVersion(result.storeVersion || '');
        setUpdateVisible(true);
      } else {
        setUpdateVisible(false);
      }
      perf.end({
        shouldUpdate: Boolean(result?.shouldUpdate),
      });
    } catch (error) {
      perf.fail(error);
    } finally {
      checkingUpdateRef.current = false;
    }
  }, []);

  const consumePendingChatOpenIntent = useCallback(
    async ({
      launchSource = 'unknown',
      authState = {authenticated: false},
    }: {
      launchSource?: string;
      authState?: {authenticated: boolean};
    } = {}) => {
    if (
      Platform.OS !== 'android' ||
      pendingChatOpenInProgressRef.current ||
      !FEATURE_FLAGS.notifV3RouterEnabled ||
      !isNavigationReady()
    ) {
      return false;
    }
    pendingChatOpenInProgressRef.current = true;
    try {
      const opened = await consumePendingChatNavigation(navigationRef, {
        launchSource,
        authState,
      });
      if (__DEV__ && opened) {
        console.log('[CHAT_NOTIF_V2] pending open intent consumed in app');
      }
      return opened;
    } catch (error) {
      console.error('[CHAT_NOTIF_V2] consume pending open failed:', error);
      return false;
    } finally {
      pendingChatOpenInProgressRef.current = false;
    }
  }, [isNavigationReady]);

  const consumePendingNotificationOpenIntents = useCallback(
    async ({
      launchSource = 'unknown',
      authState = {authenticated: false},
      includePhoneClaims = false,
    }: {
      launchSource?: string;
      authState?: {authenticated: boolean};
      includePhoneClaims?: boolean;
    } = {}) => {
      const phoneClaimOpened = includePhoneClaims
        ? await syncPendingPhoneClaimModal({
            launchSource,
            authState,
          })
        : false;
      const chatOpened = await consumePendingChatOpenIntent({
        launchSource,
        authState,
      });
      return phoneClaimOpened || chatOpened;
    },
    [consumePendingChatOpenIntent, syncPendingPhoneClaimModal],
  );

  const schedulePendingChatOpenIntent = useCallback(
    ({
      launchSource = 'unknown',
      authState = {authenticated: false},
      delayMs = 60,
    }: {
      launchSource?: string;
      authState?: {authenticated: boolean};
      delayMs?: number;
    } = {}) => {
      if (Platform.OS !== 'android' || !FEATURE_FLAGS.notifV3RouterEnabled) {
        return;
      }
      if (pendingChatOpenScheduleTimerRef.current) {
        clearTimeout(pendingChatOpenScheduleTimerRef.current);
      }
      pendingChatOpenScheduleTimerRef.current = setTimeout(() => {
        pendingChatOpenScheduleTimerRef.current = null;
        void consumePendingNotificationOpenIntents({
          launchSource,
          authState,
        });
      }, Math.max(0, Number(delayMs || 0)));
    },
    [consumePendingNotificationOpenIntents],
  );

  const flushPendingChatActions = useCallback(async () => {
    if (Platform.OS !== 'android' || pendingChatActionFlushInProgressRef.current) {
      return {processed: 0, remaining: 0};
    }
    pendingChatActionFlushInProgressRef.current = true;
    try {
      return await flushPendingChatNotificationActions({
        onOpenRequested: (args: any) =>
          consumePendingNotificationOpenIntents({
            ...(args || {}),
            includePhoneClaims: false,
          }),
      });
    } catch (error) {
      console.error('[CHAT_NOTIF_V2] pending action flush failed:', error);
      return {processed: 0, remaining: 0};
    } finally {
      pendingChatActionFlushInProgressRef.current = false;
    }
  }, [consumePendingNotificationOpenIntents]);

  const consumeInitialChatAction = useCallback(async () => {
    if (Platform.OS !== 'android' || initialChatActionConsumeInProgressRef.current) {
      return false;
    }
    initialChatActionConsumeInProgressRef.current = true;
    try {
      return await consumeInitialChatNotificationAction();
    } catch (error) {
      console.error('[CHAT_NOTIF_V2] initial action consume failed in app:', error);
      return false;
    } finally {
      initialChatActionConsumeInProgressRef.current = false;
    }
  }, []);

  const runDeferredStartupNotificationWork = useCallback(
    ({
      launchSource = 'startup-deferred',
      authState = {authenticated: false},
      delayMs = 120,
    }: {
      launchSource?: string;
      authState?: {authenticated: boolean};
      delayMs?: number;
    } = {}) => {
      if (Platform.OS !== 'android' || !FEATURE_FLAGS.notifV3RouterEnabled) {
        return;
      }
      if (startupDeferredNotifTimerRef.current) {
        clearTimeout(startupDeferredNotifTimerRef.current);
      }
      startupDeferredNotifTimerRef.current = setTimeout(() => {
        startupDeferredNotifTimerRef.current = null;
        void (async () => {
          try {
            await consumeInitialChatAction();
            await consumePendingNotificationOpenIntents({
              launchSource,
              authState,
              includePhoneClaims: false,
            });
            perfLog('startup', 'deferred-notification-intents-consumed', {
              launchSource,
              authenticated: authState?.authenticated === true,
            });
          } catch (error) {
            console.error('[CHAT_NOTIF_V2] deferred consume failed:', error);
          }
        })();
      }, Math.max(0, Number(delayMs || 0)));
    },
    [consumeInitialChatAction, consumePendingNotificationOpenIntents],
  );

  const applyResolvedStartupRoute = useCallback(
    async ({startupTarget, userPayload, readinessPerfLabel = 'startup'}) => {
      const routeName = String(startupTarget?.routeName || '').trim();
      const readinessIntents =
        startupTarget && typeof startupTarget === 'object'
          ? startupTarget.readinessIntents || null
          : null;
      if (!routeName || !navigationRef?.isReady?.()) {
        return {applied: false, routeName};
      }
      if (readinessIntents) {
        perfLog('startup', 'readiness-intents', {
          routeName,
          needsAccountBootstrap:
            readinessIntents.needsAccountBootstrap === true,
          needsThemeHydration: readinessIntents.needsThemeHydration === true,
        });
      }

      if (routeName === 'PreparingApp') {
        navigationRef.resetRoot({
          index: 0,
          routes: [{name: routeName, params: {user: userPayload}}],
        });
        await new Promise(resolve => setTimeout(resolve, 80));
        return {applied: true, routeName};
      }

      if (routeName === 'Home') {
        const readiness = await ensureStartupHomeReadiness();
        perfLog('startup', readinessPerfLabel, readiness);
        if (!readiness.ready) {
          return {
            applied: false,
            routeName,
            blockedReason: 'home-not-ready',
            readiness,
          };
        }

        navigationRef.resetRoot({
          index: 0,
          routes: [{name: 'Home', params: {user: userPayload}}],
        });
        await new Promise(resolve => setTimeout(resolve, 80));
        return {applied: true, routeName};
      }

      if (routeName === 'Login') {
        navigationRef.resetRoot({
          index: 0,
          routes: [{name: 'Login'}],
        });
        return {applied: true, routeName};
      }

      return {applied: false, routeName};
    },
    [],
  );

  const resolveStartupRouteAndIntents = useCallback(async ({force = false} = {}) => {
    const perf = createPerfTimer('startup', 'resolve-route-intents');
    if (
      Platform.OS !== 'android' ||
      !FEATURE_FLAGS.launchCoordinatorV1Enabled ||
      !FEATURE_FLAGS.startupSplashlessEnabled ||
      startupRouteResolveInProgressRef.current ||
      (!force && startupRouteResolvedRef.current) ||
      !isNavigationReady()
    ) {
      perf.end({skipped: true, forced: force});
      return;
    }
    const now = perfNow();
    const sinceLastAttemptMs = now - startupRouteResolveLastAttemptAtRef.current;
    if (
      !force &&
      startupRouteResolveLastAttemptAtRef.current > 0 &&
      sinceLastAttemptMs < STARTUP_ROUTE_RESOLVE_MIN_GAP_MS
    ) {
      perf.end({
        skipped: true,
        reason: 'throttled',
        sinceLastAttemptMs: Math.max(0, Math.round(sinceLastAttemptMs)),
      });
      return;
    }
    startupRouteResolveLastAttemptAtRef.current = now;

    startupRouteResolveInProgressRef.current = true;
    try {
      const currentUser = auth().currentUser;
      const isAuthenticated = Boolean(currentUser?.uid);
      const currentRouteName = String(navigationRef.getCurrentRoute?.()?.name || '');
      const {
        restoreDecisionPending,
        postLoginRequiredRoute,
      } = isAuthenticated
        ? await getStartupSessionFlags()
        : {
            restoreDecisionPending: false,
            postLoginRequiredRoute: '',
          };

      if (isAuthenticated) {
        const userPayload = await readStoredStartupUserPayload();
        const startupTarget = resolveStartupTargetRoute({
          isAuthenticated,
          currentRouteName,
          userPayload,
          restoreDecisionPending,
          postLoginRequiredRoute,
        });
        if (startupTarget?.waitForUserPayload) {
          return;
        }
        const applyResult = await applyResolvedStartupRoute({
          startupTarget,
          userPayload,
          readinessPerfLabel: 'home-readiness-check',
        });
        if (startupTarget?.routeName && !applyResult.applied) {
          if (applyResult.blockedReason === 'home-not-ready') {
            perf.end({
              resolved: false,
              reason: applyResult.blockedReason,
              ...(applyResult.readiness || {}),
            });
            return;
          }
          perf.end({
            resolved: false,
            reason: 'route-not-applied',
            requestedRoute: startupTarget.routeName,
          });
          return;
        }
      } else if (currentRouteName !== 'Login') {
        await applyResolvedStartupRoute({
          startupTarget: {routeName: 'Login'},
        });
      }
      startupRouteResolvedRef.current = true;
      if (isAuthenticated) {
        runDeferredStartupNotificationWork({
          launchSource: 'startup',
          authState: {authenticated: true},
          delayMs: 140,
        });
      }
      perf.end({
        resolved: true,
        currentRoute: String(navigationRef.getCurrentRoute?.()?.name || ''),
      });
    } catch (error) {
      console.error('[CHAT_NOTIF_V2] startup route resolve failed:', error);
      perf.fail(error);
    } finally {
      startupRouteResolveInProgressRef.current = false;
    }
  }, [
    applyResolvedStartupRoute,
    isNavigationReady,
    runDeferredStartupNotificationWork,
  ]);

  const handleNavigationReady = useCallback(() => {
    const navReadyAt = perfNow();
    perfLog('startup', 'navigation-ready-callback', {
      sinceAppContentMountMs: Math.max(0, navReadyAt - appContentMountedAtRef.current),
    });
    navigationReadyRef.current = true;
    void (async () => {
      // Do not block post-nav startup work on full route resolve.
      // Route resolve continues in background and no longer serializes this pipeline.
      void resolveStartupRouteAndIntents();
      const perf = createPerfTimer('startup', 'post-navigation-ready-work');
      if (postNavDeferredWorkTimerRef.current) {
        clearTimeout(postNavDeferredWorkTimerRef.current);
      }
      postNavDeferredWorkTimerRef.current = setTimeout(() => {
        postNavDeferredWorkTimerRef.current = null;
        InteractionManager.runAfterInteractions(() => {
          void (async () => {
            try {
              await flushPendingChatActions();
              await processPendingAccountShortcut();
              perf.end({deferred: true});
            } catch (error) {
              perf.fail(error, {deferred: true});
            }
          })();
        });
      }, 120);

    })();
  }, [
    flushPendingChatActions,
    processPendingAccountShortcut,
    resolveStartupRouteAndIntents,
  ]);

  const handleAppNavigatorRouteChange = useCallback(
    currentRouteName => {
      if (Platform.OS !== 'android') {
        return;
      }
      const normalizedRoute = String(currentRouteName || '').trim();
      if (normalizedRoute !== 'Boot') {
        return;
      }
      if (!isNavigationReady()) {
        return;
      }
      void resolveStartupRouteAndIntents({force: true});
    },
    [isNavigationReady, resolveStartupRouteAndIntents],
  );

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        await runFirstLaunchPhaseA();
      } finally {
        if (isMounted) {
          setStartupP0Ready(true);
          perfLog('startup', 'p0-ready');
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const stopLedgerDomainBridge = startLedgerDomainShadowEventBridge();
    return () => {
      if (typeof stopLedgerDomainBridge === 'function') {
        stopLedgerDomainBridge();
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !startupP0Ready) {
      return () => {};
    }
    const deferredTask = InteractionManager.runAfterInteractions(() => {
      void runFirstLaunchDeferredPhase();
    });
    return () => {
      deferredTask.cancel();
    };
  }, [startupP0Ready]);

  useEffect(() => {
    navigationReadyRef.current = false;
    return () => {
      navigationReadyRef.current = false;
      if (postNavDeferredWorkTimerRef.current) {
        clearTimeout(postNavDeferredWorkTimerRef.current);
        postNavDeferredWorkTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !startupP0Ready) {
      return () => {};
    }

    void (async () => {
      const authState = {authenticated: Boolean(auth().currentUser?.uid)};
      const pending = await consumePendingPhoneClaimNavigation({
        launchSource: 'pending-bootstrap',
        authState,
      });
      if (!pending) {
        return;
      }
      await syncPendingPhoneClaimModal({
        launchSource: 'pending-bootstrap',
        authState,
        pendingEvent: pending,
        force: true,
      });
    })();

    const unsubscribe = subscribeToPendingPhoneClaimUpdates((payload: Record<string, any>) => {
      void syncPendingPhoneClaimModal({
        launchSource: 'pending-update',
        authState: {authenticated: Boolean(auth().currentUser?.uid)},
        pendingEvent: payload,
        force: true,
      });
    });

    return unsubscribe;
  }, [startupP0Ready, syncPendingPhoneClaimModal]);

  useEffect(() => {
    perfLog('startup', 'app-content-mounted', {
      platform: Platform.OS,
    });
    const startupGlobal = global as unknown as StartupGlobal;
    startupGlobal.__startupTimestamps = startupGlobal.__startupTimestamps || {};
    const appStart = startupGlobal.__startupTimestamps.jsEntry ?? Date.now();

    if (!startupGlobal.__startupTimestamps.appContentMounted) {
      startupGlobal.__startupTimestamps.appContentMounted = Date.now();
    }

    const mark = (label: string) => {
      perfLog('startup', label, {sinceJsEntryMs: Date.now() - appStart});
    };

    mark('bootstrap begin');

    GoogleSignin.configure({
      webClientId: '787026486912-0od795pc1mv0tffcu13usmq73i0vvvkv.apps.googleusercontent.com',
    });
    mark('google signin configured');

    // Initialize chat feature
    // initializeChatFeature();

    mark('pending ledger sync deferred-until-dashboard');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !startupP0Ready) {
      return;
    }
    const intervalMs = 500;
    const lagAlertThresholdMs = 180;
    let previousTickAt = perfNow();
    const intervalId = setInterval(() => {
      const now = perfNow();
      const driftMs = now - previousTickAt - intervalMs;
      if (driftMs >= lagAlertThresholdMs) {
        perfLog('js-thread', 'stall-detected', {
          driftMs: Math.round(driftMs),
          appState: currentAppStateRef.current,
        });
      }
      previousTickAt = now;
    }, intervalMs);
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !startupP0Ready) {
      return;
    }
    const startupResolveSafetyTimer = setTimeout(() => {
      if (!startupRouteResolvedRef.current && isNavigationReady()) {
        resolveStartupRouteAndIntents();
      }
    }, 1200);
    scheduleDashboardDeferredStartupWork();
    if (startupDeferredRoutePollRef.current) {
      clearInterval(startupDeferredRoutePollRef.current);
    }
    startupDeferredRoutePollRef.current = setInterval(() => {
      if (scheduleDashboardDeferredStartupWork()) {
        if (startupDeferredRoutePollRef.current) {
          clearInterval(startupDeferredRoutePollRef.current);
          startupDeferredRoutePollRef.current = null;
        }
      }
    }, 350);
    const appStateSubscription = AppState.addEventListener(
      'change',
      nextState => {
        const wasBackgrounded = currentAppStateRef.current.match(
          /inactive|background/
        );
        currentAppStateRef.current = nextState;
        if (wasBackgrounded && nextState === 'active') {
          runUpdateCheck();
          InteractionManager.runAfterInteractions(() => {
            void processPendingAccountShortcut();
            void flushPendingChatActions();
          });
          schedulePendingChatOpenIntent({
            launchSource: 'app-active',
            authState: {authenticated: Boolean(auth().currentUser?.uid)},
          });
          if (!startupRouteResolvedRef.current) {
            resolveStartupRouteAndIntents();
          }
        }
      }
    );
    const foregroundActionUnsubscribe = registerForegroundChatNotificationActions({
      onOpenRequested: () =>
        schedulePendingChatOpenIntent({
          launchSource: 'foreground-action',
          authState: {authenticated: Boolean(auth().currentUser?.uid)},
        }),
    });
    const authStateUnsubscribe = auth().onAuthStateChanged(nextUser => {
      void (async () => {
        try {
          if (nextUser?.uid) {
            const {
              restoreDecisionPending,
              postLoginRequiredRoute,
            } = await getStartupSessionFlags();
            const nextUid = String(nextUser.uid).trim();
            scheduleDashboardDeferredStartupWork();
            scheduleMessagingInitForUser(nextUid);
            schedulePendingChatOpenIntent({
              launchSource: 'auth-state',
              authState: {authenticated: true},
            });
            flushPendingChatActions();
            if (!startupRouteResolvedRef.current) {
              resolveStartupRouteAndIntents();
              return;
            }
            if (navigationRef?.isReady?.()) {
              const currentRouteName = String(navigationRef.getCurrentRoute?.()?.name || '');
              const userPayload = await readStoredStartupUserPayload();
              const startupTarget = resolveStartupTargetRoute({
                isAuthenticated: true,
                currentRouteName,
                userPayload,
                restoreDecisionPending,
                postLoginRequiredRoute,
                allowHomeRoutes: ['Login', 'Boot'],
              });
              if (startupTarget?.waitForUserPayload) {
                return;
              }
              const applyResult = await applyResolvedStartupRoute({
                startupTarget,
                userPayload,
                readinessPerfLabel: 'home-readiness-check:auth-state',
              });
              if (startupTarget?.routeName && !applyResult.applied) {
                return;
              }
            }
          } else {
            messagingInitForUidRef.current = '';
            if (startupDeferredMessagingTimerRef.current) {
              clearTimeout(startupDeferredMessagingTimerRef.current);
              startupDeferredMessagingTimerRef.current = null;
            }
            if (!startupRouteResolvedRef.current) {
              resolveStartupRouteAndIntents();
              return;
            }
            if (navigationRef?.isReady?.()) {
              const currentRouteName = String(navigationRef.getCurrentRoute?.()?.name || '');
              if (currentRouteName && currentRouteName !== 'Login') {
                navigationRef.resetRoot({
                  index: 0,
                  routes: [{name: 'Login'}],
                });
              }
            }
          }
        } catch (error) {
          console.error('[APP_AUTH] auth state route handling failed:', error);
        }
      })();
    });
    return () => {
      clearTimeout(startupResolveSafetyTimer);
      if (startupDeferredRoutePollRef.current) {
        clearInterval(startupDeferredRoutePollRef.current);
        startupDeferredRoutePollRef.current = null;
      }
      if (startupDeferredUpdateTimerRef.current) {
        clearTimeout(startupDeferredUpdateTimerRef.current);
        startupDeferredUpdateTimerRef.current = null;
      }
      if (startupDeferredLedgerTimerRef.current) {
        clearTimeout(startupDeferredLedgerTimerRef.current);
        startupDeferredLedgerTimerRef.current = null;
      }
      if (startupDeferredMessagingTimerRef.current) {
        clearTimeout(startupDeferredMessagingTimerRef.current);
        startupDeferredMessagingTimerRef.current = null;
        // The init never ran; let the re-subscribed auth listener schedule it.
        messagingInitForUidRef.current = '';
      }
      if (pendingChatOpenScheduleTimerRef.current) {
        clearTimeout(pendingChatOpenScheduleTimerRef.current);
        pendingChatOpenScheduleTimerRef.current = null;
      }
      if (startupDeferredNotifTimerRef.current) {
        clearTimeout(startupDeferredNotifTimerRef.current);
        startupDeferredNotifTimerRef.current = null;
      }
      appStateSubscription.remove();
      authStateUnsubscribe();
      if (typeof foregroundActionUnsubscribe === 'function') {
        foregroundActionUnsubscribe();
      }
    };
  }, [
    applyResolvedStartupRoute,
    flushPendingChatActions,
    resolveStartupRouteAndIntents,
    processPendingAccountShortcut,
    runUpdateCheck,
    isNavigationReady,
    scheduleDashboardDeferredStartupWork,
    scheduleMessagingInitForUser,
    schedulePendingChatOpenIntent,
    startupP0Ready,
  ]);

  const handleSkipUpdate = useCallback(() => {
    setUpdateVisible(false);
  }, []);

  const handleUpdateNow = useCallback(async () => {
    if (updatingNow) {
      return;
    }
    setUpdatingNow(true);
    const started = await startAndroidFlexibleUpdate();
    if (!started) {
      await openPlayStoreForUpdate(storeUrl);
    }
    setUpdatingNow(false);
    setUpdateVisible(false);
  }, [storeUrl, updatingNow]);

  const visibleVersionLabel = currentVersionName || storeVersion;

  if (!isHeaderThemeReady || !isThemeReady || !startupP0Ready) {
    return <View style={styles.launchFallback} />;
  }

  return (
    <ChatStoreProvider>
      <ToastProvider>
        <SessionUserProvider>
          <StatusBar
            translucent
            barStyle={statusBarStyle}
            backgroundColor="transparent"
          />
          <View style={styles.root}>
            <AppNavigator
              onReady={handleNavigationReady}
              onRouteChange={handleAppNavigatorRouteChange}
            />
            <PhoneClaimDecisionModal
              visible={Boolean(activePhoneClaim)}
              claim={activePhoneClaim}
              loadingAction={phoneClaimActionLoading}
              onApprove={() => {
                void handlePhoneClaimDecision('approve');
              }}
              onReject={() => {
                void handlePhoneClaimDecision('reject');
              }}
              onBlock={() => {
                void handlePhoneClaimDecision('block');
              }}
            />
            <ToastContainer />
            <Modal
              visible={updateVisible}
              transparent
              animationType="fade"
              onRequestClose={handleSkipUpdate}>
              <View style={styles.updateOverlay}>
                <View style={styles.updateCard}>
                  <Text style={styles.updateTitle}>Update available</Text>
                  <Text style={styles.updateMessage}>
                    A newer app version
                    {visibleVersionLabel ? ` (${visibleVersionLabel})` : ''} is
                    available. Update now for the latest improvements.
                  </Text>
                  <View style={styles.updateActions}>
                    <TouchableOpacity
                      style={styles.updateSkipButton}
                      onPress={handleSkipUpdate}
                      disabled={updatingNow}>
                      <Text style={styles.updateSkipText}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.updateNowButton}
                      onPress={handleUpdateNow}
                      disabled={updatingNow}>
                      <Text style={styles.updateNowText}>
                        {updatingNow ? 'Opening...' : 'Update now'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        </SessionUserProvider>
      </ToastProvider>
    </ChatStoreProvider>
  );
}

function App() {
  useEffect(() => {
    const startupGlobal = global as unknown as StartupGlobal;
    startupGlobal.__startupTimestamps = startupGlobal.__startupTimestamps || {};
    const base = startupGlobal.__startupTimestamps.jsEntry ?? Date.now();
    if (!startupGlobal.__startupTimestamps.appMounted) {
      startupGlobal.__startupTimestamps.appMounted = Date.now();
    }
    if (__DEV__) {
      console.log(
        `[STARTUP][App] root mounted: ${startupGlobal.__startupTimestamps.appMounted - base}ms`,
      );
    }

    requestAnimationFrame(() => {
      const firstFrameMs = Date.now();
      startupGlobal.__startupTimestamps = startupGlobal.__startupTimestamps || {};
      if (!startupGlobal.__startupTimestamps.firstFrame) {
        startupGlobal.__startupTimestamps.firstFrame = firstFrameMs;
      }
      if (__DEV__) {
        console.log(
          `[STARTUP][App] first frame: ${startupGlobal.__startupTimestamps.firstFrame - base}ms`,
        );
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <HeaderTextureProvider>
        <ThemeProvider>
          <AppAlertProvider>
            <AppContent />
          </AppAlertProvider>
        </ThemeProvider>
      </HeaderTextureProvider>
    </SafeAreaProvider>
  );
}

const createStyles = colors => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  launchFallback: {
    flex: 1,
    backgroundColor: LAUNCH_SURFACE_COLOR,
  },
  updateOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  updateCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.modal,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  updateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  updateMessage: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  updateActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  updateSkipButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  updateSkipText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  updateNowButton: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  updateNowText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default App;

