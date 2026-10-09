import React from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  AppState,
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  BackHandler,
  TextInput,
  NativeModules,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {auth} from '../config/firebase';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {
  spacing,
  fontSize,
  fontWeight,
  headerTexture,
} from '../utils/theme';
import {clearLocalData} from '../services/database';
import {clearAllAccountsData} from '../services/accountsDatabase';
import {clearAllLedgerData} from '../services/ledgerDatabase';
import {
  queueBackupFromStorage,
  resumeBackupQueue,
  suspendBackupQueue,
  waitForBackupQueueIdle,
} from '../utils/backupQueue';
import {syncUserProfileToCloud} from '../services/userProfileService';
import BottomSheet from '../components/BottomSheet';
import CollapsibleSection from '../components/CollapsibleSection';
import CollapsibleMenuItem from '../components/CollapsibleMenuItem';
import {
  updateProfile,
  fetchUsersByPhones,
  checkPhoneNumber,
  requestPhoneClaim,
  logout as logoutFromApi,
} from '../services/api';
import {useToast} from '../hooks/useToast';
import {COUNTRIES, countryToCurrency} from '../utils/countries';
import TexturedSurface from '../components/TexturedSurface';
import TapEffect from '../components/ui/TapEffect';
import {getVaguePhoneError} from '../utils/phoneValidation';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {useSessionUser} from '../context/SessionUserContext';
import {clearStartupStateForLogout} from '../services/startupCoordinator';

const OCCUPATION_OPTIONS = [
  {label: 'Accountant', value: 'Accountant'},
  {label: 'Doctor', value: 'Doctor'},
  {label: 'Driver', value: 'Driver'},
  {label: 'Engineer', value: 'Engineer'},
  {label: 'Farmer', value: 'Farmer'},
  {label: 'Housewife', value: 'Housewife'},
  {label: 'Lawyer', value: 'Lawyer'},
  {label: 'Manager', value: 'Manager'},
  {label: 'Nurse', value: 'Nurse'},
  {label: 'Owner', value: 'Owner'},
  {label: 'Plumber', value: 'Plumber'},
  {label: 'Student', value: 'Student'},
  {label: 'Teacher', value: 'Teacher'},
  {label: 'Technician', value: 'Technician'},
  {label: 'Trader', value: 'Trader'},
  {label: 'Other (Manual)', value: 'manual'},
];
const normalizeImageUri = uri => {
  if (!uri) {
    return '';
  }
  if (
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('file://') ||
    uri.startsWith('content://')
  ) {
    return uri;
  }
  return `file://${uri}`;
};
const withImageCacheBust = uri => {
  const normalized = normalizeImageUri(uri);
  if (!normalized || (!normalized.startsWith('http://') && !normalized.startsWith('https://'))) {
    return normalized;
  }
  const withoutOldBust = normalized
    .replace(/([?&])cb=\d+(&|$)/, (_m, prefix, suffix) =>
      suffix === '&' ? prefix : '',
    )
    .replace(/[?&]$/, '');
  const joiner = withoutOldBust.includes('?') ? '&' : '?';
  return `${withoutOldBust}${joiner}cb=${Date.now()}`;
};

const stripToDigits = value => String(value || '').replace(/\D/g, '');
const COUNTRY_LOCK_MESSAGE =
  'Country is locked after setup. You can update only phone number within the same country.';

const getCountryDialCode = countryCode => {
  const countryObj = COUNTRIES.find(country => country.code === countryCode);
  return countryObj?.dialCode || '+91';
};

const getCountryFlag = code => {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0)),
  );
};

const resolveCountryFromPhone = phone => {
  const digits = stripToDigits(phone);
  if (!digits) {
    return null;
  }
  const sorted = [...COUNTRIES].sort(
    (a, b) =>
      stripToDigits(b.dialCode).length - stripToDigits(a.dialCode).length,
  );
  const match = sorted.find(country =>
    digits.startsWith(stripToDigits(country.dialCode)),
  );
  return match?.code || null;
};

const getLocalPhoneNumber = (phone, dialCode) => {
  const digits = stripToDigits(phone);
  const codeDigits = stripToDigits(dialCode);
  if (codeDigits && digits.startsWith(codeDigits) && digits.length > codeDigits.length) {
    return digits.slice(codeDigits.length);
  }
  return digits;
};

const moreLog = (event, payload) => {
  if (__DEV__) {
    console.log('[MORE]', event, payload || {});
  }
};

const getUserSyncSignature = userValue => {
  const user = userValue && typeof userValue === 'object' ? userValue : {};
  return [
    String(user?.firebaseUid || ''),
    String(user?.email || ''),
    String(user?.displayName || ''),
    String(user?.photoURL || ''),
    String(user?.mobile || ''),
    String(user?.phoneNumber || ''),
    String(user?.mobileNormalized || ''),
    String(user?.country || ''),
    String(user?.username || ''),
    String(user?.bio || ''),
    String(user?.gender || ''),
    String(user?.occupation || ''),
    String(user?.setupComplete ?? ''),
  ].join('|');
};

const isPhoneAlreadyInUse = async (fullPhoneNumber, selfFirebaseUid) => {
  try {
    try {
      const availabilityResponse = await checkPhoneNumber(fullPhoneNumber);
      return availabilityResponse?.available === false;
    } catch (availabilityError) {
      console.warn('Phone availability check failed, using fallback:', availabilityError);
    }

    const response = await fetchUsersByPhones([fullPhoneNumber]);
    if (!response?.success) {
      return false;
    }
    const users = Array.isArray(response.users) ? response.users : [];

    return users.some(
      userItem =>
        String(userItem?.firebaseUid || '').trim() &&
        String(userItem?.firebaseUid || '').trim() !== String(selfFirebaseUid || '').trim(),
    );
  } catch (error) {
    console.warn('Phone duplicate check failed:', error);
    return false;
  }
};

const MoreScreen = ({navigation, route, user, onProfileUpdate}) => {
  const insets = useSafeAreaInsets();
  const profileOnly = route.params?.profileOnly === true;
  const routeUser = route.params?.user;
  const openProfileOnFocus = route.params?.openProfileOnFocus;
  const returnToDashboardOnSave = route.params?.returnToDashboardOnSave;
  const {showToast} = useToast();
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const {sessionUser, refreshSessionUser, updateSessionUser} = useSessionUser();
  const themedAlert = React.useCallback(
    (title, message, actions) => {
      const safeActions =
        Array.isArray(actions) && actions.length
          ? actions.map(action => ({
              text: String(action?.text || 'OK'),
              style: action?.style || 'default',
              onPress: action?.onPress,
            }))
          : [{text: 'OK'}];
      showAlert({
        title: String(title || ''),
        message: String(message || ''),
        actions: safeActions,
      });
    },
    [showAlert],
  );
  const [currentUser, setCurrentUser] = React.useState(
    sessionUser || user || routeUser || {},
  );
  const [profileVisible, setProfileVisible] = React.useState(false);
  const [draftName, setDraftName] = React.useState('');
  const [draftPhoto, setDraftPhoto] = React.useState('');
  const [draftPhoneNumber, setDraftPhoneNumber] = React.useState('');
  const [selectedCountry, setSelectedCountry] = React.useState('IN');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [showCountryPicker, setShowCountryPicker] = React.useState(false);
  const [phoneError, setPhoneError] = React.useState('');
  const [checkingPhone, setCheckingPhone] = React.useState(false);
  const [phoneAvailable, setPhoneAvailable] = React.useState(null);
  const [phoneStatusMessage, setPhoneStatusMessage] = React.useState('');
  const [requestingPhoneClaim, setRequestingPhoneClaim] = React.useState(false);
  const [hasPhoneEdited, setHasPhoneEdited] = React.useState(false);
  const [draftGender, setDraftGender] = React.useState('');
  const [draftUsername, setDraftUsername] = React.useState('');
  const [draftBio, setDraftBio] = React.useState('');
  const [occupationChoice, setOccupationChoice] = React.useState('');
  const [manualOccupation, setManualOccupation] = React.useState('');
  const [occupationModalVisible, setOccupationModalVisible] =
    React.useState(false);
  const [genderModalVisible, setGenderModalVisible] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [photoPreviewVisible, setPhotoPreviewVisible] = React.useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = React.useState(false);
  const [logoutProcessing, setLogoutProcessing] = React.useState(false);
  const isCountryLockedForProfile = React.useMemo(
    () => Boolean(currentUser?.setupComplete),
    [currentUser?.setupComplete],
  );
  const screenWidth = Dimensions.get('window').width;
  const profileSlideX = React.useRef(new Animated.Value(screenWidth)).current;
  const profileVisibleRef = React.useRef(false);
  const profileBackRef = React.useRef(() => {});
  const profileOnlyClosingRef = React.useRef(false);
  const currentUserRef = React.useRef(currentUser);
  const googlePhotoRefreshPendingRef = React.useRef(false);
  const appStateRef = React.useRef(AppState.currentState);

  const syncCurrentUser = React.useCallback((nextUser, reason = 'unknown') => {
    if (!nextUser || typeof nextUser !== 'object') {
      return currentUserRef.current || {};
    }

    const previousUser = currentUserRef.current || {};
    const previousSignature = getUserSyncSignature(previousUser);
    const nextSignature = getUserSyncSignature(nextUser);

    if (previousSignature === nextSignature) {
      moreLog('current-user:sync-skipped', {
        reason,
        firebaseUid: nextUser?.firebaseUid || null,
      });
      return previousUser;
    }

    moreLog('current-user:sync-applied', {
      reason,
      firebaseUid: nextUser?.firebaseUid || null,
      previousMobileNormalized: previousUser?.mobileNormalized || null,
      nextMobileNormalized: nextUser?.mobileNormalized || null,
      previousSetupComplete: previousUser?.setupComplete,
      nextSetupComplete: nextUser?.setupComplete,
    });
    currentUserRef.current = nextUser;
    setCurrentUser(nextUser);
    return nextUser;
  }, []);

  React.useEffect(() => {
    const dialCode = getCountryDialCode(selectedCountry);
    moreLog('country-code:update', {selectedCountry, dialCode});
    setCountryCode(dialCode);
  }, [selectedCountry]);

  React.useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const openedProfileFromPromptRef = React.useRef(false);
  const profilePanResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const {dx, dy} = gestureState;
        return Math.abs(dx) > Math.abs(dy) && dx > 10;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const shouldClose =
          gestureState.dx > screenWidth * 0.25 || gestureState.vx > 0.6;
        if (shouldClose) {
          profileBackRef.current();
        }
      },
    }),
  ).current;

  React.useEffect(() => {
    if (sessionUser && typeof sessionUser === 'object') {
      moreLog('current-user:sync-from-session-context', {
        firebaseUid: sessionUser?.firebaseUid || null,
        setupComplete: sessionUser?.setupComplete,
        mobileNormalized: sessionUser?.mobileNormalized || null,
      });
      syncCurrentUser(sessionUser, 'session-context');
    }
  }, [sessionUser, syncCurrentUser]);

  React.useEffect(() => {
    if (user || routeUser) {
      moreLog('current-user:sync-from-props', {
        hasUser: Boolean(user),
        hasRouteUser: Boolean(routeUser),
        firebaseUid: user?.firebaseUid || routeUser?.firebaseUid || null,
      });
      syncCurrentUser(user || routeUser, 'props');
    }
  }, [user, routeUser, syncCurrentUser]);

  React.useEffect(() => {
    profileVisibleRef.current = profileVisible;
  }, [profileVisible]);

  React.useEffect(() => {
    if (!hasPhoneEdited) {
      setCheckingPhone(false);
      setPhoneAvailable(null);
      setPhoneStatusMessage('');
      return;
    }

    const cleanedPhone = draftPhoneNumber.replace(/\D/g, '');

    if (cleanedPhone.length !== 10 || !countryCode) {
      setCheckingPhone(false);
      setPhoneAvailable(null);
      setPhoneStatusMessage('');
      return;
    }

    const vaguePhoneError = getVaguePhoneError(cleanedPhone);
    if (vaguePhoneError) {
      setCheckingPhone(false);
      setPhoneAvailable(false);
      setPhoneStatusMessage(vaguePhoneError);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setCheckingPhone(true);
      setPhoneAvailable(null);
      setPhoneStatusMessage('');
      try {
        const selfFirebaseUid =
          currentUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));
        if (!selfFirebaseUid) {
          if (!cancelled) {
            setCheckingPhone(false);
          }
          return;
        }

        const fullPhoneNumber = `${countryCode}${cleanedPhone}`;
        const alreadyInUse = await isPhoneAlreadyInUse(
          fullPhoneNumber,
          selfFirebaseUid,
        );
        if (cancelled) {
          return;
        }
        setPhoneAvailable(!alreadyInUse);
        setPhoneStatusMessage(
          alreadyInUse
            ? 'This phone number is already in use. Please use another number.'
            : 'Phone number available',
        );
      } catch (error) {
        if (!cancelled) {
          setPhoneAvailable(null);
          setPhoneStatusMessage('');
        }
      } finally {
        if (!cancelled) {
          setCheckingPhone(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [draftPhoneNumber, countryCode, currentUser?.firebaseUid, hasPhoneEdited]);

  const getLatestLocalUser = React.useCallback(async () => {
    try {
      const refreshedUser = await refreshSessionUser();
      if (refreshedUser && typeof refreshedUser === 'object') {
        moreLog('local-user:loaded', {
          firebaseUid: refreshedUser?.firebaseUid || null,
          setupComplete: refreshedUser?.setupComplete,
          mobileNormalized: refreshedUser?.mobileNormalized || null,
        });
        return syncCurrentUser(refreshedUser, 'local-user');
      }
    } catch (error) {
      console.error('Failed to read latest local user:', error);
      moreLog('local-user:error', {message: error?.message || String(error)});
    }
    return currentUserRef.current || routeUser || user || {};
  }, [refreshSessionUser, routeUser, user, syncCurrentUser]);

  const refreshGoogleProfilePhoto = React.useCallback(
    async reason => {
      try {
        const firebaseUser = auth().currentUser;
        const firebaseUid = String(firebaseUser?.uid || '').trim();
        if (!firebaseUid) {
          return false;
        }

        let googlePhotoURL = '';
        try {
          const silentUser = await GoogleSignin.signInSilently();
          googlePhotoURL = normalizeImageUri(
            silentUser?.data?.user?.photo || silentUser?.user?.photo || '',
          );
        } catch (silentRefreshError) {
          console.warn('Google silent refresh skipped:', silentRefreshError);
        }

        await firebaseUser.reload();
        const reloadedUser = auth().currentUser;
        const firebasePhotoURL = normalizeImageUri(reloadedUser?.photoURL || '');
        const latestPhotoURL = googlePhotoURL || firebasePhotoURL;
        if (!latestPhotoURL) {
          return false;
        }
        const latestPhotoURLForUi = withImageCacheBust(latestPhotoURL);

        const mergedUser = {
          ...(sessionUser || currentUserRef.current || {}),
          firebaseUid:
            String(sessionUser?.firebaseUid || '').trim() ||
            firebaseUid,
          userId:
            String(sessionUser?.userId || '').trim() ||
            firebaseUid,
          photoURL: latestPhotoURLForUi,
        };

        const persistedUser = await updateSessionUser(mergedUser);
        const syncedUser = syncCurrentUser(
          persistedUser,
          `google-photo-refresh:${reason || 'unknown'}`,
        );
        setDraftPhoto(
          normalizeImageUri(syncedUser?.photoURL || latestPhotoURLForUi),
        );
        try {
          await syncUserProfileToCloud({
            displayName: syncedUser?.displayName || '',
            phoneNumber: syncedUser?.phoneNumber || syncedUser?.mobile || '',
            email: syncedUser?.email || '',
            photoURL: latestPhotoURL,
          });
        } catch (syncError) {
          console.warn('Google photo cloud sync skipped (non-blocking):', syncError);
        }
        return true;
      } catch (error) {
        console.warn('Failed to refresh Google profile photo:', error);
        return false;
      }
    },
    [sessionUser, syncCurrentUser, updateSessionUser],
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      const becameActive =
        (prevState === 'background' || prevState === 'inactive') &&
        nextState === 'active';
      if (!becameActive || !googlePhotoRefreshPendingRef.current) {
        return;
      }
      googlePhotoRefreshPendingRef.current = false;
      void refreshGoogleProfilePhoto('appstate-active');
    });
    return () => {
      subscription.remove();
    };
  }, [refreshGoogleProfilePhoto]);

  const navigateToProfileSettings = React.useCallback(
    async profileUser => {
      const resolvedUser = profileUser || (await getLatestLocalUser());
      moreLog('navigate-profile-settings:start', {
        profileOnly,
        firebaseUid: resolvedUser?.firebaseUid || null,
        setupComplete: resolvedUser?.setupComplete,
        mobileNormalized: resolvedUser?.mobileNormalized || null,
      });
      const effectiveUser = resolvedUser || currentUserRef.current || {};
      navigation.navigate('ProfileSettings', {
        user: effectiveUser,
      });
    },
    [navigation, getLatestLocalUser, profileOnly]
  );

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const parsedUser = await refreshSessionUser();
        if (parsedUser && typeof parsedUser === 'object') {
          moreLog('screen-user:loaded-from-storage', {
            firebaseUid: parsedUser?.firebaseUid || null,
            setupComplete: parsedUser?.setupComplete,
            mobileNormalized: parsedUser?.mobileNormalized || null,
          });
          return syncCurrentUser(parsedUser, 'screen-focus-storage');
        }
        const fallbackUser = user || routeUser || {};
        moreLog('screen-user:fallback', {
          firebaseUid: fallbackUser?.firebaseUid || null,
          setupComplete: fallbackUser?.setupComplete,
          mobileNormalized: fallbackUser?.mobileNormalized || null,
        });
        return syncCurrentUser(fallbackUser, 'screen-focus-fallback');
      } catch (error) {
        console.error('Failed to load user:', error);
        moreLog('screen-user:error', {message: error?.message || String(error)});
        return currentUserRef.current || user || routeUser || {};
      }
    };
    const handleFocus = () => {
      moreLog('screen-focus', {
        openProfileOnFocus: Boolean(openProfileOnFocus),
        openedProfileFromPrompt: openedProfileFromPromptRef.current,
      });
      const runFocusTasks = async () => {
        if (googlePhotoRefreshPendingRef.current) {
          googlePhotoRefreshPendingRef.current = false;
          await refreshGoogleProfilePhoto('screen-focus');
        }
        return loadUser();
      };
      runFocusTasks().then(loadedUser => {
        if (openProfileOnFocus && !openedProfileFromPromptRef.current) {
          moreLog('screen-focus:auto-open-profile', {
            firebaseUid: loadedUser?.firebaseUid || null,
            setupComplete: loadedUser?.setupComplete,
            mobileNormalized: loadedUser?.mobileNormalized || null,
          });
          openedProfileFromPromptRef.current = true;
          navigateToProfileSettings(loadedUser);
          navigation.setParams({openProfileOnFocus: false});
        }
      });
    };
    const unsubscribe = navigation.addListener('focus', handleFocus);
    return unsubscribe;
  }, [
    navigation,
    user,
    routeUser,
    openProfileOnFocus,
    navigateToProfileSettings,
    refreshSessionUser,
    refreshGoogleProfilePhoto,
    syncCurrentUser,
  ]);

  const handleLogout = () => {
    setLogoutConfirmVisible(true);
  };

  const confirmLogout = async () => {
    if (logoutProcessing) {
      return;
    }
    setLogoutProcessing(true);
    suspendBackupQueue({cancelQueued: true});
    const backupIdle = await waitForBackupQueueIdle();
    if (!backupIdle) {
      console.warn('Logout continuing while backup queue is still busy.');
    }
    let hadLogoutWarnings = false;
    const logoutFirebaseUid =
      String(currentUser?.firebaseUid || '').trim() ||
      String(auth().currentUser?.uid || '').trim();
    try {
      try {
        const idToken = await auth().currentUser?.getIdToken?.();
        if (idToken) {
          await logoutFromApi(idToken);
        }
      } catch (logoutApiError) {
        hadLogoutWarnings = true;
        console.warn('Backend logout warning:', logoutApiError);
      }

      try {
        await GoogleSignin.signOut();
      } catch (googleError) {
        hadLogoutWarnings = true;
        console.warn('Google sign-out warning:', googleError);
      }

      try {
        await auth().signOut();
      } catch (firebaseError) {
        hadLogoutWarnings = true;
        console.warn('Firebase sign-out warning:', firebaseError);
      }

      const cleanupResults = await Promise.allSettled([
        AsyncStorage.clear(),
        Promise.resolve(clearLocalData()),
        clearAllAccountsData(),
        clearAllLedgerData(),
      ]);

      const cleanupFailed = cleanupResults.some(
        result => result.status === 'rejected'
      );
      if (cleanupFailed) {
        hadLogoutWarnings = true;
        cleanupResults.forEach(result => {
          if (result.status === 'rejected') {
            console.warn('Logout cleanup warning:', result.reason);
          }
        });
      }

      await clearStartupStateForLogout({
        firebaseUid: logoutFirebaseUid,
      });

      setLogoutConfirmVisible(false);
      navigation.replace('Login');
      if (hadLogoutWarnings) {
        showToast('Logout successful.', 'info');
      }
    } catch (error) {
      console.error('Logout error:', error);
      setLogoutConfirmVisible(false);
      navigation.replace('Login');
    } finally {
      resumeBackupQueue();
      setLogoutProcessing(false);
    }
  };

  const menuItems = [
    {
      id: 'profile-settings',
      title: 'Profile Settings',
      icon: 'person-outline',
      type: 'direct',
      onPress: () => {
        navigation.navigate('ProfileSettings', {user: currentUser});
      },
    },
    {
      id: 'backup',
      title: 'Backup & Restore',
      icon: 'cloud-upload-outline',
      type: 'direct',
      onPress: () => {
        navigation.navigate('Backup');
      },
    },
    // {
    //   id: 'notification-settings',
    //   title: 'Notification Settings',
    //   icon: 'notifications-outline',
    //   type: 'direct',
    //   onPress: () => {
    //     skipNextSlideInRef.current = true;
    //     navigation.navigate('NotificationSettings');
    //   },
    // },
    {
      id: 'help',
      title: 'Help & Support',
      icon: 'help-circle-outline',
      type: 'collapsible',
      subItems: [
        {
          id: 'faqs',
          title: 'FAQs',
          onPress: () => {
            navigation.navigate('FAQs');
          },
        },
        {
          id: 'help-whatsapp',
          title: 'Help on WhatsApp',
          onPress: () => {
            const message = 'Hello, I would like to learn about Savingo.';
            const whatsappURL = `whatsapp://send?text=${encodeURIComponent(message)}`;
            Linking.openURL(whatsappURL).catch(err =>
              themedAlert('Error', 'WhatsApp is not installed on your device.'),
            );
          },
        },
      ],
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: 'settings-outline',
      type: 'direct',
      onPress: () => {
        navigation.navigate('Settings');
      },
    },
    {
      id: 'about',
      title: 'About Us',
      icon: 'information-circle-outline',
      type: 'collapsible',
      subItems: [
        {
          id: 'about-app',
          title: 'About App',
          onPress: () => {
            const versionName = NativeModules?.VersionInfo?.versionName ?? 'unknown';
            const versionCode = NativeModules?.VersionInfo?.versionCode ?? 'unknown';
            themedAlert('Savingo', `Version ${versionName} (${versionCode})`);
          },
        },
        {
          id: 'privacy-policy',
          title: 'Privacy Policy',
          onPress: () => {
            Linking.openURL('https://savingo.merasoftware.com/privacy-policy').catch(err =>
              themedAlert('Error', 'Unable to open link. Please try again.'),
            );
          },
        },
        {
          id: 'terms-conditions',
          title: 'Terms & Conditions',
          onPress: () => {
             Linking.openURL('https://savingo.merasoftware.com/terms-of-service').catch(err =>
              themedAlert('Error', 'Unable to open link. Please try again.'),
            );
          },
        },
      ],
    },
  ];

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Dashboard');
  }, [navigation]);

  const profilePhotoUri = normalizeImageUri(currentUser?.photoURL || '');
  const draftPhotoUri = normalizeImageUri(draftPhoto || '');
  const selectedCountryObj = COUNTRIES.find(
    country => country.code === selectedCountry,
  );

  return (
    <View style={styles.container}>
      <Animated.View style={styles.animatedContainer}>
        <TexturedSurface
          style={[
            styles.moreHeader,
            {
              marginTop: -insets.top,
              paddingTop: 42 + insets.top,
            },
          ]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            accessibilityLabel="Go back">
            <Icon name="chevron-back" size={22} color={headerTexture.icon} />
          </TouchableOpacity>
          <Text style={styles.moreHeaderTitle}>More</Text>
          <View style={styles.moreHeaderSpacer} />
        </TexturedSurface>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}>
          <TapEffect
            style={styles.profileSection}
            onPress={() => {
              void navigateToProfileSettings();
            }}
            accessibilityRole="button"
            accessibilityLabel="Open profile settings">
            {profilePhotoUri ? (
              <Image
                source={{uri: profilePhotoUri}}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Icon name="person" size={28} color={colors.white} />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {currentUser?.displayName || 'User'}
              </Text>
              <Text style={styles.profileEmail}>{currentUser?.email || ''}</Text>
            </View>
            <Icon
              name="pencil"
              size={20}
              color={colors.text.light}
              style={styles.profileArrow}
            />
          </TapEffect>

          <View style={styles.menuSection}>
            {menuItems.map(item => {
              if (item.type === 'collapsible') {
                return (
                  <CollapsibleSection
                    key={item.id}
                    title={item.title}
                    icon={item.icon}
                    initialExpanded={false}>
                    <View>
                      {item.subItems?.map((subItem, index) => (
                        <CollapsibleMenuItem
                          key={subItem.id}
                          title={subItem.title}
                          onPress={subItem.onPress}
                        />
                      ))}
                    </View>
                  </CollapsibleSection>
                );
              }

              // Direct menu item
              return (
                <TapEffect
                  key={item.id}
                  style={styles.directMenuItem}
                  onPress={item.onPress}>
                  <View style={styles.menuIconContainer}>
                    <Icon name={item.icon} size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.menuText}>{item.title}</Text>
                  <Icon
                    name="chevron-forward"
                    size={20}
                    color={colors.text.light}
                  />
                </TapEffect>
              );
            })}
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Icon name="log-out-outline" size={24} color={colors.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
      <Modal
        visible={logoutConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!logoutProcessing) {
            setLogoutConfirmVisible(false);
          }
        }}>
        <View style={styles.logoutModalOverlay}>
          <TouchableOpacity
            style={styles.logoutModalBackdrop}
            activeOpacity={1}
            onPress={() => {
              if (!logoutProcessing) {
                setLogoutConfirmVisible(false);
              }
            }}
          />
          <View style={styles.logoutModalCard}>
            <Text style={styles.logoutModalTitle}>Logout</Text>
            <Text style={styles.logoutModalMessage}>
              Are you sure you want to logout?
            </Text>
            <View style={styles.logoutModalActions}>
              <TouchableOpacity
                style={styles.logoutCancelButton}
                disabled={logoutProcessing}
                onPress={() => setLogoutConfirmVisible(false)}>
                <Text style={styles.logoutCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutDangerButton}
                disabled={logoutProcessing}
                onPress={confirmLogout}>
                {logoutProcessing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.logoutDangerText}>Logout</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  animatedContainer: {
    flex: 1,
  },
  moreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: headerTexture.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  moreHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
  },
  moreHeaderSpacer: {
    width: 32,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  profileArrow: {
    marginLeft: spacing.sm,
  },
  profileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profilePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: fontSize.xlarge,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  profileEmail: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
  },
  menuSection: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  claimInboxCard: {
    backgroundColor: colors.panel,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  claimInboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  claimInboxTitle: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  claimInboxItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  claimInboxItemTitle: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  claimInboxItemText: {
    marginTop: 4,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  claimActionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  claimActionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimApproveButton: {
    backgroundColor: colors.surfaceMuted,
  },
  claimRejectButton: {
    backgroundColor: colors.surfaceMuted,
  },
  claimBlockButton: {
    backgroundColor: colors.surfaceMuted,
  },
  claimApproveButtonText: {
    color: '#0F8A4B',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.small,
  },
  claimRejectButtonText: {
    color: '#C0392B',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.small,
  },
  claimBlockButtonText: {
    color: '#475569',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.small,
  },
  directMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: fontSize.regular,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  menuSubtitle: {
    fontSize: fontSize.regular,
    color: colors.text.secondary,
    marginRight: spacing.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.error,
  },
  logoutText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.error,
    marginLeft: spacing.sm,
  },
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  logoutModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.modal,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  logoutModalTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  logoutModalMessage: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  logoutModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  logoutCancelButton: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutCancelText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  logoutDangerButton: {
    flex: 1,
    backgroundColor: colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutDangerText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  profileScreen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: headerTexture.border,
  },
  profileHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
  },
  profileScroll: {
    flex: 1,
  },
  profileContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  profileIdentityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  profileIdentityImageWrap: {
    width: 108,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  profileIdentityImageContainer: {
    width: 88,
    height: 88,
    position: 'relative',
  },
  profileIdentityImageButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: colors.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 2,
  },
  profileIdentityImage: {
    width: '100%',
    height: '100%',
  },
  profileIdentityPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  profileIdentityCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5,
  },
  profileIdentityHintText: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  profileIdentityInfo: {
    flex: 1,
  },
  profileIdentityLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  profileIdentityLabelSpacing: {
    marginTop: spacing.sm + 2,
  },
  profileIdentityValue: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
    marginTop: 3,
  },
  profileFormCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  profileImageFrame: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  profileImageButton: {
    flex: 1,
  },
  profileHeroImage: {
    width: '100%',
    height: '100%',
    borderRadius: 90,
  },
  profileHeroPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEditButton: {
    position: 'absolute',
    left: '50%',
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{translateX: -16}],
  },
  profileLabel: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm + 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
    backgroundColor: colors.input,
    marginHorizontal: spacing.md,
  },
  profileInputDisabled: {
    color: colors.text.secondary,
    opacity: 0.7,
    backgroundColor: colors.surfaceMuted,
  },
  profileInputError: {
    borderColor: '#EF4444',
  },
  profileInputBio: {
    minHeight: 90,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
  },
  profileErrorText: {
    fontSize: fontSize.small,
    color: colors.error,
    fontWeight: fontWeight.semibold,
    marginTop: -spacing.sm + 2,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
  },
  claimButton: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    fontSize: fontSize.small,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  claimHelperText: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
    fontSize: fontSize.small,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  profileStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  profileCheckingText: {
    fontSize: fontSize.small,
    color: colors.primary,
  },
  profileSuccessText: {
    fontSize: fontSize.small,
    color: '#10B981',
    fontWeight: fontWeight.semibold,
  },
  bioCharCount: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    textAlign: 'right',
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
    marginHorizontal: spacing.md,
  },
  occupationPicker: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.input,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  occupationPickerText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  hybridField: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
  },
  hybridCountryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 110,
  },
  hybridCountryText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    marginRight: 8,
  },
  hybridDivider: {
    width: 1,
    height: '65%',
    backgroundColor: colors.border,
  },
  hybridPhoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  profileSaveButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 0,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  profileSaveButtonDisabled: {
    opacity: 1,
    backgroundColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  profileSaveText: {
    color: colors.white,
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
  },
  profileSaveTextDisabled: {
    color: colors.text.secondary,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewClose: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  profilePhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  profileCountryPickerInline: {
    flex: 0.38,
    marginHorizontal: 0,
    marginBottom: spacing.md,
    minHeight: 48,
  },
  profilePhoneInputInline: {
    flex: 0.62,
    marginHorizontal: 0,
    minHeight: 48,
  },
  bottomSheetTitle: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dropdownOptionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.panelMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryFlagEmoji: {
    fontSize: 22,
    marginRight: 4,
  },
  dropdownOptionActive: {
    backgroundColor: colors.surfaceMuted,
  },
  dropdownOptionText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  dropdownOptionTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
});

export default MoreScreen;





