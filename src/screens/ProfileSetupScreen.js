import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
  Keyboard,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {auth} from '../config/firebase';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {
  updateProfile,
  checkUsername,
  checkPhoneNumber,
  fetchUsersByPhones,
  requestPhoneClaim,
} from '../services/api';
import {
  readCachedSessionUser,
  refreshCanonicalSessionUser,
  writeCachedSessionUser,
} from '../services/sessionService';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {initAccountsDatabase} from '../services/accountsDatabase';
import {getFirebaseToken} from '../utils/tokenManager';
import {COUNTRIES, countryToCurrency} from '../utils/countries';
import {
  writeStartupSessionFlags,
} from '../services/startupCoordinator';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import TexturedSurface from '../components/TexturedSurface';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {
  getVaguePhoneError,
  normalizePhoneForCompare,
} from '../utils/phoneValidation';
const COUNTRY_LOCK_MESSAGE =
  'Country is locked after setup. You can update only phone number within the same country.';
const PROFILE_SETUP_LOG = (...args) => {
  if (__DEV__) {
    console.log('[PROFILE_SETUP]', ...args);
  }
};

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

const toSymbolOnlyCurrency = (value, countryCode) => {
  const raw = String(value || '').trim();
  const symbolOnly = raw.replace(/[A-Za-z]/g, '').trim();
  if (symbolOnly) {
    return symbolOnly;
  }
  if (countryCode === 'ZA') {
    return 'R';
  }
  return '';
};

const getCountryFlag = code => {
  if (!code || code.length !== 2) {
    return '🌐';
  }
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map(char => 127397 + char.charCodeAt(0)),
  );
};

const ProfileSetupScreen = ({navigation, route}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
  const initialCountryRef = React.useRef('');
  const manualOccupationInputRef = React.useRef(null);
  const manualEditorAnim = React.useRef(new Animated.Value(0)).current;
  const manualEditorKeyboardOffset = React.useRef(new Animated.Value(0)).current;
  const routeUser = route.params?.user || null;
  const isFromMore = route.params?.fromMore === true;
  const [currentUser, setCurrentUser] = React.useState(routeUser);
  const isCountryLockedForEdit = isFromMore && Boolean(currentUser?.setupComplete);
  const [isHydratingUser, setIsHydratingUser] = React.useState(!isFromMore);
  const [displayName, setDisplayName] = React.useState('');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [selectedCountry, setSelectedCountry] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('');
  const [selectedCurrency, setSelectedCurrency] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [isUsernameLocked, setIsUsernameLocked] = React.useState(false);
  const [checkingUsername, setCheckingUsername] = React.useState(false);
  const [usernameAvailable, setUsernameAvailable] = React.useState(null);
  const [suggestions, setSuggestions] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [showCountryPicker, setShowCountryPicker] = React.useState(false);
  const [showOccupationPicker, setShowOccupationPicker] = React.useState(false);
  const [showManualOccupationEditor, setShowManualOccupationEditor] = React.useState(false);
  const [occupationChoice, setOccupationChoice] = React.useState('');
  const [manualOccupation, setManualOccupation] = React.useState('');
  const [phoneError, setPhoneError] = React.useState('');
  const [checkingPhone, setCheckingPhone] = React.useState(false);
  const [phoneAvailable, setPhoneAvailable] = React.useState(null);
  const [phoneStatusMessage, setPhoneStatusMessage] = React.useState('');
  const [requestingPhoneClaim, setRequestingPhoneClaim] = React.useState(false);
  const [hasPhoneEdited, setHasPhoneEdited] = React.useState(false);
  const [isUsernameFocused, setIsUsernameFocused] = React.useState(false);
  const [isCountryInteracted, setIsCountryInteracted] = React.useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = React.useState(false);
  React.useEffect(() => {
    if (!showManualOccupationEditor) {
      return;
    }
    manualEditorAnim.setValue(0);
    Animated.timing(manualEditorAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [showManualOccupationEditor, manualEditorAnim]);

  const closeManualOccupationEditor = React.useCallback(() => {
    Animated.timing(manualEditorAnim, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setShowManualOccupationEditor(false);
    });
  }, [manualEditorAnim]);

  React.useEffect(() => {
    if (!showManualOccupationEditor) {
      manualEditorKeyboardOffset.setValue(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = event => {
      const toValue = Math.max(0, (event?.endCoordinates?.height || 0) - 12);
      Animated.timing(manualEditorKeyboardOffset, {
        toValue,
        duration: event?.duration || 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const onHide = event => {
      Animated.timing(manualEditorKeyboardOffset, {
        toValue: 0,
        duration: event?.duration || 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [showManualOccupationEditor, manualEditorKeyboardOffset]);

  const getDialCodeByCountry = React.useCallback((countryCodeValue) => {
    const countryObj = COUNTRIES.find(c => c.code === countryCodeValue);
    return countryObj?.dialCode || '';
  }, []);

  const getLocalPhoneNumber = React.useCallback((rawPhone, dialCodeValue) => {
    if (!rawPhone) {
      return '';
    }

    const digitsOnly = String(rawPhone).replace(/\D/g, '');
    const dialDigits = String(dialCodeValue || '').replace(/\D/g, '');

    if (dialDigits && digitsOnly.startsWith(dialDigits)) {
      return digitsOnly.slice(dialDigits.length);
    }

    return digitsOnly;
  }, []);

  const applyUserDataToForm = React.useCallback((userData) => {
    if (!userData) {
      return;
    }
    PROFILE_SETUP_LOG('applyUserDataToForm:start', {
      firebaseUid: String(userData?.firebaseUid || '').trim() || null,
      username: String(userData?.username || '').trim() || null,
      mobile: String(userData?.phoneNumber || userData?.mobile || '').trim() || null,
      country: String(userData?.country || '').trim() || null,
      setupComplete: Boolean(userData?.setupComplete),
    });

    const existingUsername = (userData.username || '').trim().toLowerCase();
    setCurrentUser(userData);
    setDisplayName(userData.displayName || userData.name || '');
    const resolvedCountry = userData.country || '';
    initialCountryRef.current = resolvedCountry;
    const resolvedDialCode = getDialCodeByCountry(resolvedCountry);
    const localPhoneNumber = getLocalPhoneNumber(
      userData.phoneNumber || userData.mobile || '',
      resolvedDialCode,
    );

    setPhoneNumber(localPhoneNumber);
    setHasPhoneEdited(false);
    // Show assigned username and lock editing when username already exists
    setUsername(existingUsername);
    setIsUsernameLocked(Boolean(existingUsername));
    setUsernameAvailable(null);
    setSuggestions([]);

    setSelectedCountry(resolvedCountry);
    setCountryCode(resolvedDialCode);
    const currentOccupation = String(userData.occupation || '').trim();
    const matchedOption = OCCUPATION_OPTIONS.find(
      option => option.value !== 'manual' && option.value === currentOccupation,
    );
    if (matchedOption) {
      setOccupationChoice(matchedOption.value);
      setManualOccupation('');
    } else if (currentOccupation) {
      setOccupationChoice('manual');
      setManualOccupation(currentOccupation);
    } else {
      setOccupationChoice('');
      setManualOccupation('');
    }

    const currency =
      userData.currencySymbol ||
      userData.currency ||
      countryToCurrency[resolvedCountry] ||
      '';
    setSelectedCurrency(toSymbolOnlyCurrency(currency, resolvedCountry));
    PROFILE_SETUP_LOG('applyUserDataToForm:end', {
      resolvedCountry,
      resolvedDialCode,
      localPhoneNumber,
      currency: toSymbolOnlyCurrency(currency, resolvedCountry),
      occupation: currentOccupation || null,
    });
  }, [getDialCodeByCountry, getLocalPhoneNumber]);

  React.useEffect(() => {
    let isCancelled = false;

    const hydrateProfileSetupUser = async () => {
      PROFILE_SETUP_LOG('hydrate:start', {
        isFromMore,
        hasRouteUser: Boolean(routeUser),
      });
      if (!isFromMore) {
        setIsHydratingUser(true);
      }

      let baseUser = routeUser;
      try {
        if (!baseUser) {
          const refreshedUser = await refreshCanonicalSessionUser(routeUser);
          baseUser =
            refreshedUser && Object.keys(refreshedUser).length > 0
              ? refreshedUser
              : null;
        }

        if (baseUser && !isCancelled) {
          PROFILE_SETUP_LOG('hydrate:base-user', {
            firebaseUid: String(baseUser?.firebaseUid || '').trim() || null,
            username: String(baseUser?.username || '').trim() || null,
            mobile: String(baseUser?.phoneNumber || baseUser?.mobile || '').trim() || null,
          });
          applyUserDataToForm(baseUser);
        }
      } catch (error) {
        console.error('Failed to load user for profile setup:', error);
      }

      try {
        const mergedUser = await refreshCanonicalSessionUser(baseUser);

        if (isCancelled) {
          return;
        }

        applyUserDataToForm(mergedUser);
        await writeCachedSessionUser(mergedUser);
        PROFILE_SETUP_LOG('hydrate:user-details-applied', {
          firebaseUid: String(mergedUser?.firebaseUid || '').trim() || null,
          username: String(mergedUser?.username || '').trim() || null,
          mobile: String(mergedUser?.phoneNumber || mergedUser?.mobile || '').trim() || null,
        });
      } catch (error) {
        console.warn('Failed to sync profile setup user from backend:', error);
        PROFILE_SETUP_LOG('hydrate:error', {
          message: error?.message || String(error),
        });
      } finally {
        if (!isCancelled) {
          setIsHydratingUser(false);
          PROFILE_SETUP_LOG('hydrate:end');
        }
      }
    };

    hydrateProfileSetupUser();

    return () => {
      isCancelled = true;
    };
  }, [applyUserDataToForm, isFromMore, routeUser]);

  // Auto-fill currency and country code when country changes
  React.useEffect(() => {
    const currency = countryToCurrency[selectedCountry];
    if (currency) {
      setSelectedCurrency(toSymbolOnlyCurrency(currency, selectedCountry));
    } else {
      setSelectedCurrency('');
    }

    // Set country code based on selected country
    const countryObj = COUNTRIES.find(c => c.code === selectedCountry);
    if (countryObj) {
      setCountryCode(countryObj.dialCode);
    } else {
      setCountryCode('');
    }
    PROFILE_SETUP_LOG('country-change', {
      selectedCountry: selectedCountry || null,
      dialCode: countryObj?.dialCode || null,
      currency: currency ? toSymbolOnlyCurrency(currency, selectedCountry) : null,
    });
  }, [selectedCountry]);

  // Validate phone number format based on country
  const validatePhoneFormat = (phone, country) => {
    if (!phone.trim()) {
      return 'Phone number is required';
    }

    const cleanedPhone = phone.replace(/\D/g, '');

    // For now, basic length check (actual validation will be done on backend)
    if (cleanedPhone.length < 7) {
      return `Phone number must be at least 7 digits for ${selectedCountry}`;
    }

    const vaguePhoneError = getVaguePhoneError(cleanedPhone);
    if (vaguePhoneError) {
      return vaguePhoneError;
    }

    setPhoneError('');
    return null;
  };

  const checkPhoneAlreadyInUse = React.useCallback(
    async (fullPhoneNumber, selfFirebaseUid) => {
      try {
        PROFILE_SETUP_LOG('phone-dup-check:start', {
          fullPhoneNumber,
          normalizedTarget: normalizePhoneForCompare(fullPhoneNumber),
          selfFirebaseUid: String(selfFirebaseUid || '').trim() || null,
        });
        try {
          const availabilityResponse = await checkPhoneNumber(fullPhoneNumber);
          PROFILE_SETUP_LOG('phone-dup-check:check-phone-response', {
            success: Boolean(availabilityResponse?.success),
            available:
              availabilityResponse?.available === undefined
                ? null
                : Boolean(availabilityResponse?.available),
            message: availabilityResponse?.message || null,
          });
          const alreadyInUse = availabilityResponse?.available === false;
          PROFILE_SETUP_LOG('phone-dup-check:end', {
            fullPhoneNumber,
            source: 'check-phone',
            alreadyInUse,
          });
          return alreadyInUse;
        } catch (availabilityError) {
          PROFILE_SETUP_LOG('phone-dup-check:check-phone-error', {
            message: availabilityError?.message || String(availabilityError),
          });
        }

        const response = await fetchUsersByPhones([fullPhoneNumber]);
        if (!response?.success) {
          PROFILE_SETUP_LOG('phone-dup-check:response-failed', {
            success: Boolean(response?.success),
            message: response?.message || null,
          });
          return false;
        }

        const users = Array.isArray(response.users) ? response.users : [];
        PROFILE_SETUP_LOG('phone-dup-check:response', {
          usersCount: users.length,
          users: users.map(userItem => ({
            firebaseUid: String(userItem?.firebaseUid || '').trim() || null,
            mobile: String(userItem?.mobile || '').trim() || null,
            normalizedMobile: String(userItem?.normalizedMobile || '').trim() || null,
            status: String(userItem?.status || '').trim() || null,
          })),
        });

        const alreadyInUse = users.some(
          userItem =>
            String(userItem?.firebaseUid || '').trim() &&
            String(userItem?.firebaseUid || '').trim() !== String(selfFirebaseUid || '').trim(),
        );
        PROFILE_SETUP_LOG('phone-dup-check:end', {
          fullPhoneNumber,
          source: 'users-by-phones-fallback',
          alreadyInUse,
        });
        return alreadyInUse;
      } catch (error) {
        console.warn('Phone duplicate check failed:', error);
        PROFILE_SETUP_LOG('phone-dup-check:error', {
          fullPhoneNumber,
          message: error?.message || String(error),
        });
        return false;
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!hasPhoneEdited) {
      PROFILE_SETUP_LOG('phone-effect:skip', {
        reason: 'not-edited',
      });
      setCheckingPhone(false);
      setPhoneAvailable(null);
      setPhoneStatusMessage('');
      return;
    }

    const cleanedPhone = phoneNumber.replace(/\D/g, '');

    if (cleanedPhone.length !== 10 || !countryCode) {
      PROFILE_SETUP_LOG('phone-effect:skip', {
        reason: 'incomplete',
        cleanedLength: cleanedPhone.length,
        countryCode: countryCode || null,
      });
      setCheckingPhone(false);
      setPhoneAvailable(null);
      setPhoneStatusMessage('');
      return;
    }

    const vaguePhoneError = getVaguePhoneError(cleanedPhone);
    if (vaguePhoneError) {
      PROFILE_SETUP_LOG('phone-effect:vague-error', {
        cleanedPhone,
        vaguePhoneError,
      });
      setCheckingPhone(false);
      setPhoneAvailable(false);
      setPhoneStatusMessage(vaguePhoneError);
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      PROFILE_SETUP_LOG('phone-effect:check-start', {
        phoneNumber,
        cleanedPhone,
        countryCode,
      });
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
          PROFILE_SETUP_LOG('phone-effect:skip', {
            reason: 'missing-self-firebaseUid',
          });
          return;
        }

        const fullPhoneNumber = `${countryCode}${cleanedPhone}`;
        const alreadyInUse = await checkPhoneAlreadyInUse(
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
        PROFILE_SETUP_LOG('phone-effect:check-end', {
          fullPhoneNumber,
          alreadyInUse,
          phoneAvailable: !alreadyInUse,
        });
      } catch (error) {
        if (!cancelled) {
          setPhoneAvailable(null);
          setPhoneStatusMessage('');
        }
        PROFILE_SETUP_LOG('phone-effect:error', {
          message: error?.message || String(error),
        });
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
  }, [
    phoneNumber,
    countryCode,
    currentUser?.firebaseUid,
    checkPhoneAlreadyInUse,
    hasPhoneEdited,
  ]);

  // Validate username format
  const validateUsernameFormat = (text) => {
    const regex = /^[a-zA-Z0-9._-]+$/;
    return regex.test(text);
  };

  // Check username availability (debounced)
  React.useEffect(() => {
    if (isUsernameLocked) {
      setCheckingUsername(false);
      setSuggestions([]);
      setUsernameAvailable(true);
      return;
    }

    if (username.length < 3) {
      setUsernameAvailable(null);
      setSuggestions([]);
      return;
    }

    if (!validateUsernameFormat(username)) {
      setUsernameAvailable(false);
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setCheckingUsername(true);
      PROFILE_SETUP_LOG('username-check:start', {
        username,
      });
      try {
        const response = await checkUsername(username);
        setUsernameAvailable(response.available);
        setSuggestions(response.suggestions || []);
        PROFILE_SETUP_LOG('username-check:end', {
          username,
          available: Boolean(response?.available),
          suggestionsCount: Array.isArray(response?.suggestions)
            ? response.suggestions.length
            : 0,
        });
      } catch (error) {
        console.error('Username check error:', error);
        setUsernameAvailable(false);
        PROFILE_SETUP_LOG('username-check:error', {
          username,
          message: error?.message || String(error),
        });
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [username, isUsernameLocked]);

  const getSelectedOccupationValue = React.useCallback(() => {
    return occupationChoice === 'manual'
      ? manualOccupation.trim()
      : occupationChoice.trim();
  }, [occupationChoice, manualOccupation]);

  const submitProfileSetup = async normalizedUsername => {
    setSaving(true);
    try {
      initAccountsDatabase();
      const storedUser = currentUser
        ? currentUser
        : await readCachedSessionUser();
      const firebaseUid =
        storedUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));
      if (!firebaseUid) {
        themedAlert('Error', 'User authentication error. Please login again.');
        return;
      }

      // Combine country code with phone number for backend
      const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
      const resolvedCountryForSubmit =
        isCountryLockedForEdit && initialCountryRef.current
          ? initialCountryRef.current
          : selectedCountry;
      const resolvedCountryCode = getDialCodeByCountry(resolvedCountryForSubmit);
      const fullPhoneNumber = resolvedCountryCode + cleanedPhoneNumber;
      const resolvedCurrencyForSubmit = toSymbolOnlyCurrency(
        countryToCurrency[resolvedCountryForSubmit] || selectedCurrency,
        resolvedCountryForSubmit,
      );
      const occupationValue = getSelectedOccupationValue();
      const resolvedDisplayName = String(
        displayName ||
          storedUser?.displayName ||
          storedUser?.name ||
          currentUser?.displayName ||
          currentUser?.name ||
          '',
      ).trim();

      PROFILE_SETUP_LOG('submit:start', {
        firebaseUid: String(firebaseUid || '').trim() || null,
        displayName: resolvedDisplayName || null,
        normalizedUsername: normalizedUsername || null,
        cleanedPhoneNumber,
        fullPhoneNumber,
        selectedCountry: resolvedCountryForSubmit || null,
        selectedCurrency: resolvedCurrencyForSubmit || null,
        occupationValue: occupationValue || null,
      });

      const response = await updateProfile(firebaseUid, {
        displayName: resolvedDisplayName || null,
        username: normalizedUsername,
        mobile: fullPhoneNumber,
        country: resolvedCountryForSubmit,
        currency: resolvedCurrencyForSubmit,
        gender: storedUser?.gender || null,
        occupation: occupationValue || null,
        setupComplete: true,
      });
      PROFILE_SETUP_LOG('submit:response', {
        success: Boolean(response?.success),
        message: response?.message || null,
        responseUserFirebaseUid: String(response?.user?.firebaseUid || '').trim() || null,
      });

      if (!response?.success) {
        themedAlert('Error', response?.message || 'Failed to update profile');
        return;
      }

      if (auth().currentUser) {
        await auth().currentUser.updateProfile({
          displayName: resolvedDisplayName,
        });
      }

      const updatedUser = await refreshCanonicalSessionUser({
        ...storedUser,
        ...response.user,
        displayName: resolvedDisplayName,
        username: normalizedUsername,
        phoneNumber: fullPhoneNumber,
        mobile: fullPhoneNumber,
        country: resolvedCountryForSubmit,
        currencySymbol: resolvedCurrencyForSubmit,
        occupation: occupationValue || null,
        setupComplete: true,
      });

      setCurrentUser(updatedUser);
      await writeCachedSessionUser(updatedUser);
      await writeStartupSessionFlags({
        userPayload: updatedUser,
        restoreDecisionPending: false,
        postLoginRequiredRoute: 'Home',
      });
      queueBackupFromStorage();
      initialCountryRef.current = resolvedCountryForSubmit;
      PROFILE_SETUP_LOG('submit:success', {
        isFromMore,
        navigationTarget: isFromMore ? 'goBack/MoreNative' : 'Home',
      });

      if (isFromMore) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.replace('MoreNative', {user: updatedUser});
        }
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{name: 'Boot'}],
      });
    } catch (error) {
      console.error('Failed to save profile setup:', error);
      PROFILE_SETUP_LOG('submit:error', {
        message: error?.message || String(error),
        rawError: error,
      });
      themedAlert('Error', error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    PROFILE_SETUP_LOG('continue:start', {
      displayName: String(displayName || '').trim() || null,
      username: String(username || '').trim() || null,
      isUsernameLocked,
      phoneNumber,
      selectedCountry: selectedCountry || null,
      countryCode: countryCode || null,
      phoneAvailable,
      phoneStatusMessage: phoneStatusMessage || null,
    });
    // Validate country
    if (!selectedCountry) {
      PROFILE_SETUP_LOG('continue:block', {reason: 'missing-country'});
      themedAlert('Error', 'Please select a country');
      return;
    }

    // Validate phone
    const phoneValidationError = validatePhoneFormat(phoneNumber, selectedCountry);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      PROFILE_SETUP_LOG('continue:block', {
        reason: 'phone-validation',
        phoneValidationError,
      });
      themedAlert('Error', phoneValidationError);
      return;
    }

    if (phoneAvailable === false) {
      const message =
        phoneStatusMessage ||
        'This phone number is already in use. Please use another number.';
      setPhoneError(message);
      PROFILE_SETUP_LOG('continue:block', {
        reason: 'phone-available-false',
        message,
      });
      themedAlert('Error', message);
      return;
    }

    const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
    const fullPhoneNumber = `${countryCode}${cleanedPhoneNumber}`;
    const selfFirebaseUid =
      currentUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));
    if (!selfFirebaseUid) {
      PROFILE_SETUP_LOG('continue:block', {
        reason: 'missing-self-firebaseUid',
      });
      themedAlert('Error', 'User authentication error. Please login again.');
      return;
    }

    const alreadyInUse = await checkPhoneAlreadyInUse(
      fullPhoneNumber,
      selfFirebaseUid,
    );
    if (alreadyInUse) {
      const duplicateMessage =
        'This phone number is already in use. Please use another number.';
      setPhoneError(duplicateMessage);
      PROFILE_SETUP_LOG('continue:block', {
        reason: 'phone-dup-check',
        fullPhoneNumber,
        duplicateMessage,
      });
      themedAlert('Error', duplicateMessage);
      return;
    }

    const normalizedUsername = (
      isUsernameLocked ? username || currentUser?.username || '' : username
    )
      .trim()
      .toLowerCase();

    // Validate username only when it is not already locked from existing profile.
    if (!isUsernameLocked) {
      if (!normalizedUsername) {
        PROFILE_SETUP_LOG('continue:block', {reason: 'missing-username'});
        themedAlert('Error', 'Please enter a username');
        return;
      }

      if (!validateUsernameFormat(normalizedUsername)) {
        PROFILE_SETUP_LOG('continue:block', {
          reason: 'invalid-username-format',
          normalizedUsername,
        });
        themedAlert(
          'Invalid Username',
          'Username can only contain letters, numbers, dots, hyphens, and underscores',
        );
        return;
      }

      if (usernameAvailable === false) {
        PROFILE_SETUP_LOG('continue:block', {
          reason: 'username-taken',
          normalizedUsername,
        });
        themedAlert('Error', 'Username is already taken. Please choose another.');
        return;
      }
    }

    const hasInitialCountry = Boolean(initialCountryRef.current);
    const isCountryChanged = hasInitialCountry && selectedCountry !== initialCountryRef.current;
    if (isCountryChanged) {
      if (isCountryLockedForEdit) {
        themedAlert('Country Locked', COUNTRY_LOCK_MESSAGE);
        return;
      }
      PROFILE_SETUP_LOG('continue:country-change-confirm', {
        initialCountry: initialCountryRef.current || null,
        selectedCountry,
      });
      themedAlert(
        'You Are Changing Country/Currency',
        'Changing country/currency may affect app-user detection for contacts without country code.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'OK',
            onPress: () => {
              submitProfileSetup(normalizedUsername);
            },
          },
        ]
      );
      return;
    }

    PROFILE_SETUP_LOG('continue:submit', {
      normalizedUsername,
      fullPhoneNumber,
    });
    await submitProfileSetup(normalizedUsername);
  };

  const handleSkipForNow = async () => {
    try {
      const storedUser = await readCachedSessionUser();
      const updatedUser = {
        ...storedUser,
        ...currentUser,
        setupComplete: false,
      };
      setCurrentUser(updatedUser);
      await writeCachedSessionUser(updatedUser);
      await writeStartupSessionFlags({
        userPayload: updatedUser,
        restoreDecisionPending: false,
        postLoginRequiredRoute: 'Home',
      });

      if (isFromMore) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.replace('MoreNative', {user: updatedUser});
        }
        return;
      }

      navigation.reset({
        index: 0,
        routes: [{name: 'Boot'}],
      });
    } catch (error) {
      console.error('Failed to skip profile setup:', error);
      themedAlert('Error', 'Unable to skip right now. Please try again.');
    }
  };

  const handleRequestThisNumber = async () => {
    const phoneValidationError = validatePhoneFormat(phoneNumber, selectedCountry);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      themedAlert('Error', phoneValidationError);
      return;
    }

    const cleanedPhoneNumber = phoneNumber.replace(/\D/g, '');
    const fullPhoneNumber = `${countryCode}${cleanedPhoneNumber}`;
    const selfFirebaseUid =
      currentUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));

    if (!selfFirebaseUid) {
      themedAlert('Error', 'User authentication error. Please login again.');
      return;
    }

    setRequestingPhoneClaim(true);
    PROFILE_SETUP_LOG('phone-claim-request:start', {
      fullPhoneNumber,
      selfFirebaseUid,
    });
    try {
      const response = await requestPhoneClaim(fullPhoneNumber);
      PROFILE_SETUP_LOG('phone-claim-request:success', {
        fullPhoneNumber,
        claimId: String(response?.claim?._id || '').trim() || null,
        message: response?.message || null,
      });
        themedAlert(
          'Request Sent',
          response?.message ||
            'A request has been sent. The current owner will be asked to approve, reject, or block it when they open Savingo.',
        );
    } catch (error) {
      PROFILE_SETUP_LOG('phone-claim-request:error', {
        fullPhoneNumber,
        message: error?.message || String(error),
      });
      themedAlert(
        'Request Failed',
        error?.message || 'Unable to send the phone transfer request.',
      );
    } finally {
      setRequestingPhoneClaim(false);
    }
  };
  const countryObject = COUNTRIES.find(c => c.code === selectedCountry);
  const isFirstTimeSetup = !currentUser?.setupComplete && !isFromMore;

  if (isHydratingUser) {
    return (
      <View style={styles.container}>
        <TexturedSurface
          style={[
            styles.settingsHeader,
            {
              paddingTop: spacing.sm + insets.top,
            },
          ]}>
          <View style={styles.settingsBackButton} />
          <Text style={styles.settingsHeaderTitle}>Profile Settings</Text>
          <View style={styles.settingsHeaderSpacer} />
        </TexturedSurface>
        <View style={styles.startupLoadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.startupLoadingText}>
            Preparing your account...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TexturedSurface
        style={[
          styles.settingsHeader,
          {
            paddingTop: spacing.sm + insets.top,
          },
        ]}>
        {isFirstTimeSetup ? (
          <View style={styles.settingsBackButton} />
        ) : (
          <TouchableOpacity
            style={styles.settingsBackButton}
            onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={22} color={colors.headerIcon} />
          </TouchableOpacity>
        )}
        <Text style={styles.settingsHeaderTitle}>Profile Settings</Text>
        <View style={styles.settingsHeaderSpacer} />
      </TexturedSurface>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>
          Finish your profile setup to unlock the full app experience.
        </Text>
      </View>

      <View style={styles.formCard}>
      <View style={styles.form}>
        {/* Username Field */}
        <View>
          <Text style={styles.label}>Username *</Text>
            <Text style={styles.note}>
              {isUsernameLocked
                ? 'ⓘ Username is already assigned for this account.'
                : 'ⓘ Set a unique username to continue with full account usage.'}
            </Text>
          <TextInput
            style={[styles.input, isUsernameLocked && styles.inputDisabled]}
            value={username}
            onChangeText={setUsername}
            onFocus={() => setIsUsernameFocused(true)}
            onBlur={() => setIsUsernameFocused(false)}
            placeholder="Choose your username"
            autoCapitalize="none"
            editable={!saving && !isUsernameLocked}
            placeholderTextColor={colors.text.secondary}
          />
          {!isUsernameLocked && !isUsernameFocused && username.trim().length === 0 && (
            <Text style={styles.fieldHelperWarningText}>
              Username is important for ledger entries and global chat.
            </Text>
          )}

          {/* Username Status */}
          {!isUsernameLocked && username.length > 0 && (
            <View style={styles.usernameStatusContainer}>
              {checkingUsername && (
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.checkingText}>Checking username...</Text>
                </View>
              )}
              {!checkingUsername && username.length < 3 && (
                <Text style={styles.errorText}>Username must be at least 3 characters</Text>
              )}
              {!checkingUsername && username.length >= 3 && !validateUsernameFormat(username) && (
                <Text style={styles.errorText}>
                  Username can only contain letters, numbers, dots, hyphens, and underscores
                </Text>
              )}
              {!checkingUsername && usernameAvailable === true && (
                <View style={styles.statusRow}>
                  <Text style={styles.successText}>✓ Username available</Text>
                </View>
              )}
              {!checkingUsername && usernameAvailable === false && (
                <View>
                  <Text style={styles.errorText}>✗ Username already taken</Text>
                  {suggestions.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                      <Text style={styles.suggestionsTitle}>Suggestions:</Text>
                      {suggestions.map((suggestion, index) => (
                        <TouchableOpacity
                          key={index}
                          onPress={() => setUsername(suggestion)}
                          style={styles.suggestionButton}>
                          <Text style={styles.suggestionText}>{suggestion}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
        {/* Country */}
        <View>
          <Text style={styles.label}>Country *</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => {
              if (isCountryLockedForEdit) {
                themedAlert('Country Locked', COUNTRY_LOCK_MESSAGE);
                return;
              }
              setIsCountryInteracted(true);
              setShowCountryPicker(true);
            }}
            disabled={saving}>
            <Text style={styles.pickerButtonText}>
              {countryObject
                ? `${getCountryFlag(countryObject.code)} ${countryObject.name} (${countryCode})`
                : 'Select Country'}
            </Text>
            <Text style={styles.pickerArrow}>▼</Text>
          </TouchableOpacity>
          {!isCountryInteracted && !selectedCountry && (
            <Text style={styles.fieldHelperWarningText}>
              Country selection is required for correct account setup.
            </Text>
          )}
          {countryObject ? (
            <Text style={styles.helperText}>Country code: {countryCode}</Text>
          ) : null}
        </View>



        {/* Phone Number */}
        <View>
          <Text style={styles.label}>Phone Number *</Text>
          <TextInput
            style={[styles.input, phoneError && styles.inputError]}
            value={phoneNumber}
            onChangeText={(text) => {
              setPhoneNumber(text.replace(/\D/g, ''));
              setHasPhoneEdited(true);
              setPhoneError('');
              setPhoneAvailable(null);
              setPhoneStatusMessage('');
            }}
            onFocus={() => setIsPhoneFocused(true)}
            onBlur={() => setIsPhoneFocused(false)}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
            editable={!saving}
            placeholderTextColor={colors.text.secondary}
          />
          {!isPhoneFocused && phoneNumber.trim().length === 0 && (
            <Text style={styles.fieldHelperWarningText}>
              Your phone number is required for global chat, ledger entries, and contact search.
            </Text>
          )}
          {checkingPhone && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.checkingText}>Checking phone number...</Text>
            </View>
          )}
          {!checkingPhone && phoneAvailable === true && (
            <View style={styles.statusRow}>
              <Text style={styles.successText}>✓ Phone number available</Text>
            </View>
          )}
          {!checkingPhone && phoneAvailable === false && !phoneError ? (
            <Text style={styles.errorText}>✗ {phoneStatusMessage}</Text>
          ) : null}
          {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
          {!checkingPhone && phoneAvailable === false && !phoneError ? (
            <View>
              <TouchableOpacity
                style={[
                  styles.claimButton,
                  requestingPhoneClaim && styles.claimButtonDisabled,
                ]}
                onPress={handleRequestThisNumber}
                disabled={saving || checkingPhone || requestingPhoneClaim}>
                {requestingPhoneClaim ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.claimButtonText}>Request This Number</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.claimHelperText}>
                A request has been sent. The current owner will be asked to approve, reject, or block it when they open Savingo.
              </Text>
            </View>
          ) : null}
        </View>



      </View>
      </View>

      <TouchableOpacity
        style={[styles.continueButton, saving && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.continueButtonText}>Continue</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleSkipForNow}
        disabled={saving}>
        <Text style={styles.skipButtonText}>Set Up Later</Text>
      </TouchableOpacity>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={[
                    styles.countryOption,
                    selectedCountry === item.code && styles.countryOptionSelected,
                  ]}
                  onPress={() => {
                    if (isCountryLockedForEdit) {
                      themedAlert('Country Locked', COUNTRY_LOCK_MESSAGE);
                      setShowCountryPicker(false);
                      return;
                    }
                    setSelectedCountry(item.code);
                    setShowCountryPicker(false);
                  }}>
                  <Text
                    style={[
                      styles.countryOptionText,
                      selectedCountry === item.code && styles.countryOptionTextSelected,
                    ]}>
                    {getCountryFlag(item.code)} {item.name} ({item.dialCode})
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOccupationPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setShowOccupationPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Occupation</Text>
              <TouchableOpacity onPress={() => setShowOccupationPicker(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={OCCUPATION_OPTIONS}
              keyExtractor={item => item.value}
              renderItem={({item}) => {
                const isSelected = occupationChoice === item.value;
                return (
                  <TouchableOpacity
                    style={[
                      styles.countryOption,
                      isSelected && styles.countryOptionSelected,
                    ]}
                    onPress={() => {
                      setOccupationChoice(item.value);
                      if (item.value !== 'manual') {
                        setManualOccupation('');
                        closeManualOccupationEditor();
                      }
                      setShowOccupationPicker(false);
                    }}>
                    <View style={styles.occupationOptionRow}>
                      <Text
                        style={[
                          styles.countryOptionText,
                          isSelected && styles.countryOptionTextSelected,
                        ]}>
                        {item.label}
                      </Text>
                      {isSelected && (
                        <Icon name="checkmark" size={18} color={colors.primary} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showManualOccupationEditor}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onShow={() => {
          setTimeout(() => {
            manualOccupationInputRef.current?.focus();
          }, 120);
        }}
        onRequestClose={closeManualOccupationEditor}>
        <View style={styles.manualEditorOverlay}>
          <Animated.View
            style={[
              styles.manualEditorBackdrop,
              {opacity: manualEditorAnim},
            ]}
          />
          <TouchableOpacity
            style={styles.manualEditorBackdropTouch}
            activeOpacity={1}
            onPress={closeManualOccupationEditor}
          />
          <Animated.View
            style={[
              styles.manualEditorCard,
              {
                opacity: manualEditorAnim,
                transform: [
                  {
                    translateY: Animated.subtract(
                      manualEditorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                      manualEditorKeyboardOffset,
                    ),
                  },
                ],
              },
            ]}>
            <Text style={styles.manualEditorTitle}>Enter Occupation</Text>
            <TextInput
              ref={manualOccupationInputRef}
              style={styles.manualEditorInput}
              value={manualOccupation}
              onChangeText={setManualOccupation}
              placeholder="Type occupation"
              editable={!saving}
              placeholderTextColor={colors.text.secondary}
            />
            <View style={styles.manualEditorActions}>
              <TouchableOpacity
                style={[styles.manualEditorBtn, styles.manualEditorBtnSecondary]}
                onPress={closeManualOccupationEditor}>
                <Text style={styles.manualEditorBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualEditorBtn, styles.manualEditorBtnPrimary]}
                onPress={closeManualOccupationEditor}>
                <Text style={styles.manualEditorBtnPrimaryText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      </ScrollView>
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 2,
  },
  settingsBackButton: {
    padding: 6,
  },
  settingsHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.headerText,
  },
  settingsHeaderSpacer: {
    width: 34,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xlarge,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
  },
  startupLoadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  startupLoadingText: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  formCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  form: {
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  label: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    color: colors.text.light,
  },
  inputError: {
    borderColor: colors.error,
  },
  pickerButton: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  pickerArrow: {
    color: colors.text.secondary,
    fontSize: fontSize.small,
  },
  hybridField: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
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
  readOnlyBar: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  readOnlyBarText: {
    fontSize: fontSize.medium,
    color: colors.text.light,
  },
  helperText: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  fieldHelperWarningText: {
    fontSize: fontSize.small,
    color: colors.text.light,
    marginTop: spacing.xs,
  },
  manualOccupationInput: {
    marginTop: spacing.sm,
  },
  manualOccupationPlaceholder: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
  },
  manualOccupationValue: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  manualEditorOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  manualEditorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  manualEditorBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  manualEditorCard: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: spacing.lg,
    paddingBottom: spacing.lg + 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
  },
  manualEditorTitle: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  manualEditorInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text.primary,
  },
  manualEditorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  manualEditorBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  manualEditorBtnSecondary: {
    backgroundColor: colors.surfaceMuted,
  },
  manualEditorBtnPrimary: {
    backgroundColor: colors.primary,
  },
  manualEditorBtnSecondaryText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  manualEditorBtnPrimaryText: {
    fontSize: 15,
    color: colors.white,
    fontWeight: fontWeight.semibold,
  },
  continueButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: colors.white,
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
  },
  skipButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  skipButtonText: {
    color: colors.text.secondary,
    fontSize: fontSize.medium,
    fontWeight: fontWeight.medium,
  },
  note: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  usernameStatusContainer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkingText: {
    fontSize: fontSize.small,
    color: colors.primary,
  },
  successText: {
    fontSize: fontSize.small,
    color: colors.success,
    fontWeight: fontWeight.semibold,
  },
  errorText: {
    fontSize: fontSize.small,
    color: colors.error,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  claimButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
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
    fontSize: fontSize.small,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  suggestionsContainer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  suggestionsTitle: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  suggestionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  suggestionText: {
    fontSize: fontSize.small,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.modal,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.md,
    maxHeight: '80%',
  },
  modalHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  closeButton: {
    fontSize: 15,
    color: colors.text.secondary,
  },
  countryOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countryOptionSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  countryOptionText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  countryOptionTextSelected: {
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  occupationOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default ProfileSetupScreen;



