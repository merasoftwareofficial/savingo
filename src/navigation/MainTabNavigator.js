import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  InteractionManager,
  Platform,
} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import DashboardStackNavigator from './DashboardStackNavigator';
import LedgerStackNavigator from './LedgerStackNavigator';
import DashboardScreen from '../screens/DashboardScreen';
import PrototypeAccountsScreen from '../screens/PrototypeAccountsScreen';
import Header from '../components/Header';
import {spacing, fontSize} from '../utils/theme';
import TexturedSurface from '../components/TexturedSurface';
import {useHeaderTextureTheme} from '../context/HeaderTextureContext';
import {useTheme} from '../context/ThemeContext';
import {useSessionUser} from '../context/SessionUserContext';
import {
  DEFAULT_TAB_DASHBOARD,
  DEFAULT_TAB_ACCOUNTS,
  DEFAULT_TAB_FALLBACK,
  DEFAULT_TAB_LEDGER,
  readDefaultTabPreference,
} from '../utils/defaultTabPreference';
import {getNotificationPermissionSnapshot} from '../services/chatNotificationV2Service';
import notifee from '@notifee/react-native';
import WelcomePopup from '../components/WelcomePopup';
import {
  initWelcomePopup,
  markShownThisSession,
  hasShownThisSession,
} from '../utils/welcomePopupManager';
import {perfLog, perfNow} from '../utils/perfLogger';
import {getResolvedHeaderTextureTheme} from '../utils/headerTextureTheme';
import {
  getAllContactBalances,
  getDistinctContactRecordIds,
} from '../services/ledgerDatabase';
import {ensureLedgerFeatureDatabasesReady} from '../services/dbLifecycleManager';
import {requiresProfileSetup} from '../utils/profileReadiness';

const Tab = createBottomTabNavigator();
const MoreTabPlaceholder = () => null;
const HOME_NOTIFICATION_PERMISSION_PROMPT_KEY = 'home.notificationPermissionPrompt.v1';

const MainTabNavigator = ({route, navigation}) => {
  const insets = useSafeAreaInsets();
  const {
    user: initialUser,
    showTutorial,
    suppressSetupPopupOnce = false,
    initialTabOverride = '',
  } = route.params || {};
  const {themeId: tabTextureId} = useHeaderTextureTheme();
  const {colors, isDark} = useTheme();
  const {sessionUser, updateSessionUser} = useSessionUser();
  const user = sessionUser || initialUser || null;
  const resolvedTabTheme = useMemo(
    () => getResolvedHeaderTextureTheme(tabTextureId, isDark),
    [tabTextureId, isDark],
  );
  const [showHeader, setShowHeader] = useState(true);
  const [initialTab, setInitialTab] = useState(DEFAULT_TAB_FALLBACK);
  const [isInitialTabReady, setIsInitialTabReady] = useState(false);
  const [welcomePopupVisible, setWelcomePopupVisible] = useState(false);
  const [welcomeTargetTab, setWelcomeTargetTab] = useState(null);
  const tabPressAtRef = useRef({});
  const ledgerPrewarmScheduledRef = useRef(false);
  const baseTabBarStyle = {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    height: 72 + insets.bottom,
    paddingBottom: Math.max(10, insets.bottom),
    paddingTop: 10,
    paddingHorizontal: 14,
  };
  const styles = useMemo(
    () => createStyles(colors, resolvedTabTheme),
    [colors, resolvedTabTheme],
  );
  const tabBarActiveTintColor = isDark
    ? colors.tabBarActive
    : '#FFFFFF';
  const tabBarInactiveTintColor = isDark
    ? colors.tabBarInactive
    : '#E5E7EB';

  useEffect(() => {
    const initialFirebaseUid = String(initialUser?.firebaseUid || '').trim();
    const sessionFirebaseUid = String(sessionUser?.firebaseUid || '').trim();
    if (!initialFirebaseUid || sessionFirebaseUid) {
      return;
    }
    void updateSessionUser(initialUser);
  }, [initialUser, sessionUser?.firebaseUid, updateSessionUser]);

  useEffect(() => {
    if (!isInitialTabReady) {
      return;
    }

    let isMounted = true;
    const promptTimer = setTimeout(() => {
      void (async () => {
        try {
          const alreadyPrompted = await AsyncStorage.getItem(
            HOME_NOTIFICATION_PERMISSION_PROMPT_KEY,
          );
          const snapshot = await getNotificationPermissionSnapshot();
          if (snapshot?.granted) {
            await AsyncStorage.setItem(
              HOME_NOTIFICATION_PERMISSION_PROMPT_KEY,
              'true',
            );
            return;
          }

          if (alreadyPrompted === 'true') {
            return;
          }

          if (!isMounted) {
            return;
          }

          const requested = await notifee.requestPermission();
          const requestedStatus = requested?.authorizationStatus;
          const grantedAfterRequest =
            requestedStatus === 1 || requestedStatus === 2;

          if (grantedAfterRequest) {
            await AsyncStorage.setItem(
              HOME_NOTIFICATION_PERMISSION_PROMPT_KEY,
              'true',
            );
          }
        } catch (error) {
          console.error('Notification permission bootstrap failed:', error);
        }
      })();
    }, 700);

    return () => {
      isMounted = false;
      clearTimeout(promptTimer);
    };
  }, [isInitialTabReady]);

  useEffect(() => {
    const startAt = perfNow();
    let isMounted = true;

    const loadInitialTab = async () => {
      const normalizedOverride = String(initialTabOverride || '').trim();
      if (
        normalizedOverride === DEFAULT_TAB_DASHBOARD ||
        normalizedOverride === DEFAULT_TAB_ACCOUNTS ||
        normalizedOverride === DEFAULT_TAB_LEDGER
      ) {
        perfLog('main-tabs', 'initial-tab:override', {
          tab: normalizedOverride,
          durationMs: Math.max(0, perfNow() - startAt),
        });
        if (!isMounted) {
          return;
        }
        setInitialTab(normalizedOverride);
        setIsInitialTabReady(true);
        return;
      }
      const storedTab = await readDefaultTabPreference();
      if (!isMounted) {
        return;
      }
      const resolvedTab =
        storedTab === DEFAULT_TAB_LEDGER
          ? DEFAULT_TAB_LEDGER
          : storedTab === DEFAULT_TAB_ACCOUNTS
          ? DEFAULT_TAB_ACCOUNTS
          : DEFAULT_TAB_DASHBOARD;
      setInitialTab(resolvedTab);
      perfLog('main-tabs', 'initial-tab:resolved', {
        tab: resolvedTab,
        durationMs: Math.max(0, perfNow() - startAt),
      });
      setIsInitialTabReady(true);
    };

    loadInitialTab();

    return () => {
      isMounted = false;
    };
  }, [initialTabOverride]);

  useEffect(() => {
    if (
      !isInitialTabReady ||
      Platform.OS !== 'android' ||
      ledgerPrewarmScheduledRef.current
    ) {
      return () => {};
    }
    if (initialTab === DEFAULT_TAB_LEDGER) {
      perfLog('main-tabs', 'ledger-prewarm-skipped', {
        reason: 'ledger-initial-tab',
      });
      return () => {};
    }

    ledgerPrewarmScheduledRef.current = true;
    const scheduledAt = perfNow();
    let interactionTask = null;
    const warmupTimer = setTimeout(() => {
      interactionTask = InteractionManager.runAfterInteractions(() => {
        const prewarmStartedAt = perfNow();
        perfLog('main-tabs', 'ledger-prewarm-start', {
          delayMs: Math.max(0, prewarmStartedAt - scheduledAt),
        });
        try {
          ensureLedgerFeatureDatabasesReady();
          const contactIds = getDistinctContactRecordIds();
          const balances = getAllContactBalances();
          perfLog('main-tabs', 'ledger-prewarm-end', {
            contactIdsCount: Array.isArray(contactIds) ? contactIds.length : 0,
            balancesCount: Object.keys(balances || {}).length,
            balanceEntriesCount: Array.isArray(Object.entries(balances || {}))
              ? Object.entries(balances || {}).length
              : 0,
            durationMs: Math.max(0, perfNow() - prewarmStartedAt),
          });
        } catch (error) {
          perfLog('main-tabs', 'ledger-prewarm-error', {
            durationMs: Math.max(0, perfNow() - prewarmStartedAt),
            error: String(error?.message || error || 'unknown'),
          });
        }
      });
    }, 900);

    return () => {
      clearTimeout(warmupTimer);
      interactionTask?.cancel?.();
    };
  }, [initialTab, isInitialTabReady]);

  const markTabPress = useCallback((tabName) => {
    tabPressAtRef.current[tabName] = perfNow();
    perfLog('main-tabs', 'tab-press', {tab: tabName});
  }, []);

  const markTabFocus = useCallback((tabName) => {
    const focusedAt = perfNow();
    const pressedAt = Number(tabPressAtRef.current[tabName]) || 0;
    perfLog('main-tabs', 'tab-focus', {
      tab: tabName,
      pressToFocusMs: pressedAt > 0 ? Math.max(0, focusedAt - pressedAt) : null,
    });
  }, []);

  // Welcome popup — init once on mount
  useEffect(() => {
    let isMounted = true;
    initWelcomePopup().then(result => {
      if (isMounted && result.shouldShow) {
        setWelcomeTargetTab(result.targetTab);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTabFocus = useCallback((tabName) => {
    if (
      welcomeTargetTab &&
      tabName === welcomeTargetTab &&
      !hasShownThisSession()
    ) {
      markShownThisSession();
      setWelcomePopupVisible(true);
    }
  }, [welcomeTargetTab]);

  const handleWelcomeDismiss = useCallback(() => {
    setWelcomePopupVisible(false);
  }, []);


  const tabBarBackground = useMemo(
    () => () => (
      <TexturedSurface
        style={styles.tabTextureWrap}
        themeId={tabTextureId}
      />
    ),
    [styles.tabTextureWrap, tabTextureId]
  );

  const showSetupRibbon = showHeader && requiresProfileSetup(user);

  const handleSetupNowPress = () => {
    navigation.navigate('ProfileSetup', {user: user || {}});
  };

  if (!isInitialTabReady) {
    return null;
  }

  return (
    <>
      {showHeader && (
        <Header
          user={user}
        />
      )}
      {showSetupRibbon ? (
        <TouchableOpacity
          style={styles.setupRibbon}
          activeOpacity={0.85}
          onPress={handleSetupNowPress}>
          <View style={styles.setupRibbonIconWrap}>
            <Icon name="sparkles-outline" size={16} color={colors.primary} />
          </View>
          <View style={styles.setupRibbonContent}>
            <Text style={styles.setupRibbonTitle}>Profile setup pending</Text>
            <Text style={styles.setupRibbonText}>
              Complete profile setup to unlock all features.
            </Text>
          </View>
          <View style={styles.setupRibbonCtaWrap}>
            <Text style={styles.setupRibbonCta}>Setup now</Text>
            <Icon name="chevron-forward" size={16} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ) : null}
      <Tab.Navigator
        initialRouteName={initialTab}
        screenOptions={{
          headerShown: false,
          detachInactiveScreens: true,
          freezeOnBlur: true,
          tabBarActiveTintColor,
          tabBarInactiveTintColor,
          tabBarBackground,
          tabBarStyle: baseTabBarStyle,
          tabBarLabelStyle: {
            fontSize: fontSize.small,
            fontWeight: '500',
          },
        }}
        backBehavior="history">
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({color, size, focused}) => (
              <Icon name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
            ),
          }}
          listeners={{
            tabPress: () => {
              markTabPress('Dashboard');
              setShowHeader(true);
            },
            focus: () => {
              markTabFocus('Dashboard');
              setShowHeader(true);
              handleTabFocus('Dashboard');
            },
          }}
        />
        <Tab.Screen
          name="Accounts"
          component={DashboardStackNavigator}
          initialParams={{user, showTutorial, suppressSetupPopupOnce}}
          options={{
            tabBarLabel: 'Accounts',
            tabBarIcon: ({color, size, focused}) => (
              <Icon name={focused ? 'wallet' : 'wallet-outline'} size={size} color={color} />
            ),
          }}
          listeners={{
            tabPress: () => {
              markTabPress('Accounts');
              setShowHeader(true);
            },
            focus: () => {
              markTabFocus('Accounts');
              setShowHeader(true);
              handleTabFocus('Accounts');
            },
          }}
        />
        <Tab.Screen
          name="Ledger"
          component={LedgerStackNavigator}
          options={{
            tabBarLabel: 'Ledger Talk',
            tabBarIcon: ({color, size, focused}) => (
              <Icon
                name={focused ? 'chatbox-ellipses' : 'chatbox-ellipses-outline'}
                size={size}
                color={color}
              />
            ),
          }}
          listeners={{
            tabPress: () => {
              markTabPress('Ledger');
              setShowHeader(true);
            },
            focus: () => {
              markTabFocus('Ledger');
              setShowHeader(true);
              handleTabFocus('Ledger');
            },
          }}
        />
        <Tab.Screen
          name="More"
          component={MoreTabPlaceholder}
          options={{
            tabBarIcon: ({color, size, focused}) => (
              <Icon name={focused ? 'grid' : 'grid-outline'} size={size} color={color} />
            ),
          }}
          listeners={({navigation}) => ({
            tabPress: e => {
              e.preventDefault();
              markTabPress('More');
              markTabFocus('More');
              setShowHeader(true);
              navigation.getParent()?.navigate('MoreNative', {user});
            },
          })}
        />
      </Tab.Navigator>
      <WelcomePopup
        visible={welcomePopupVisible}
        onDismiss={handleWelcomeDismiss}
      />
    </>
  );
};

const createStyles = (colors, resolvedTabTheme) =>
  StyleSheet.create({
  setupRibbon: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm + 2,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  setupRibbonIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  setupRibbonContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  setupRibbonTitle: {
    color: colors.text.primary,
    fontSize: fontSize.small,
    fontWeight: '700',
    marginBottom: 2,
  },
  setupRibbonText: {
    color: colors.text.primary,
    fontSize: fontSize.small,
    fontWeight: '500',
    lineHeight: 17,
  },
  setupRibbonCtaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    gap: 2,
  },
  tabTextureWrap: {
    ...StyleSheet.absoluteFillObject,
    top: 6,
    left: 14,
    right: 14,
    bottom: 0,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 14},
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  setupRibbonCta: {
    color: colors.primary,
    fontSize: fontSize.small,
    fontWeight: '700',
  },
  });

export default MainTabNavigator;


