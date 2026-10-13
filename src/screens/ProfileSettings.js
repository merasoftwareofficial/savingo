import React from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  AppState,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {auth} from '../config/firebase';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {withAlpha} from '../utils/color';
import {useSessionUser} from '../context/SessionUserContext';
import {useToast} from '../hooks/useToast';
import {
  updateProfile,
  fetchUsersByPhones,
  checkPhoneNumber,
  requestPhoneClaim,
} from '../services/api';
import {syncUserProfileToCloud} from '../services/userProfileService';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {COUNTRIES, countryToCurrency} from '../utils/countries';
import CurrencyPickerModal, {CURRENCIES} from '../components/CurrencyPickerModal';
import TexturedSurface from '../components/TexturedSurface';
import BottomSheet from '../components/BottomSheet';
import {getVaguePhoneError} from '../utils/phoneValidation';

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

const getCurrencyLabel = symbol => {
  const match = CURRENCIES.find(item => item.symbol === symbol);
  return match ? match.label : symbol;
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

const GENDER_OPTIONS = [
  {label: 'Male', value: 'Male'},
  {label: 'Female', value: 'Female'},
  {label: 'I would not prefer', value: 'Other'},
];

const stripToDigits = value => String(value || '').replace(/\D/g, '');

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

const ProfileSettings = ({navigation, route}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const {sessionUser, updateSessionUser} = useSessionUser();
  const {showToast} = useToast();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const routeUser = route.params?.user;
  const [currentUser, setCurrentUser] = React.useState(sessionUser || routeUser || {});
  const [draftName, setDraftName] = React.useState('');
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
  const [occupationModalVisible, setOccupationModalVisible] = React.useState(false);
  const [genderModalVisible, setGenderModalVisible] = React.useState(false);
  const [photoPreviewVisible, setPhotoPreviewVisible] = React.useState(false);
  const [draftPhoto, setDraftPhoto] = React.useState('');
  const [draftCurrency, setDraftCurrency] = React.useState('');
  const [showCurrencyPicker, setShowCurrencyPicker] = React.useState(false);
  const [manualOccupationInputRef] = React.useState(React.createRef());
  const [showManualOccupationEditor, setShowManualOccupationEditor] = React.useState(false);
  const manualEditorAnim = React.useRef(new Animated.Value(0)).current;
  const manualEditorKeyboardOffset = React.useRef(new Animated.Value(0)).current;
  const googlePhotoRefreshPendingRef = React.useRef(false);
  const appStateRef = React.useRef(AppState.currentState);
  const saveInProgressRef = React.useRef(false);
  const bypassBeforeRemoveRef = React.useRef(false);

  const isCountryLockedForProfile = React.useMemo(
    () => Boolean(currentUser?.setupComplete),
    [currentUser?.setupComplete],
  );

  const draftPhotoUri = React.useMemo(
    () => normalizeImageUri(draftPhoto),
    [draftPhoto],
  );

  React.useEffect(() => {
    const dialCode = getCountryDialCode(selectedCountry);
    setCountryCode(dialCode);
  }, [selectedCountry]);

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

  React.useEffect(() => {
    const profileUser = currentUser || {};
    const currentOccupation = profileUser?.occupation || '';
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
    const inferredCountry =
      profileUser?.country ||
      resolveCountryFromPhone(profileUser?.phoneNumber || profileUser?.mobile) ||
      'IN';
    const dialCode = getCountryDialCode(inferredCountry);
    setDraftName(profileUser?.displayName || profileUser?.name || '');
    setPhoneError('');
    setCheckingPhone(false);
    setPhoneAvailable(null);
    setPhoneStatusMessage('');
    setHasPhoneEdited(false);
    setSelectedCountry(inferredCountry);
    setCountryCode(dialCode);
    setDraftPhoneNumber(
      getLocalPhoneNumber(
        profileUser?.phoneNumber || profileUser?.mobile || '',
        dialCode,
      ),
    );
    setDraftGender(profileUser?.gender || '');
    setDraftUsername(profileUser?.username || '');
    setDraftBio(profileUser?.bio || '');
    setDraftPhoto(normalizeImageUri(profileUser?.photoURL || ''));
    const currency =
      profileUser?.currencySymbol ||
      profileUser?.currency ||
      countryToCurrency[inferredCountry] ||
      '';
    setDraftCurrency(currency);
  }, [currentUser]);

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
        setDraftPhoto(normalizeImageUri(latestPhotoURLForUi));

        try {
          await syncUserProfileToCloud({
            displayName: currentUser?.displayName || '',
            phoneNumber: currentUser?.phoneNumber || currentUser?.mobile || '',
            email: currentUser?.email || '',
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
    [currentUser],
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
      refreshGoogleProfilePhoto('appstate-active');
    });
    return () => {
      subscription.remove();
    };
  }, [refreshGoogleProfilePhoto]);

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

  const handlePickImage = async () => {
    googlePhotoRefreshPendingRef.current = true;
    try {
      const googleProfileUrl = 'https://myaccount.google.com/personal-info';
      await Linking.openURL(googleProfileUrl);
    } catch (error) {
      try {
        await Linking.openURL('https://myaccount.google.com/');
      } catch (fallbackError) {
        googlePhotoRefreshPendingRef.current = false;
        console.error('Failed to open Google account settings:', error);
        console.error('Fallback Google account URL open failed:', fallbackError);
        showToast('Failed to open Google account settings', 'error');
      }
    }
  };

  const openPhotoPreview = () => {
    if (!draftPhotoUri) {
      return;
    }
    setPhotoPreviewVisible(true);
  };

  const handleSaveAll = React.useCallback(async () => {
    const firebaseUid =
      currentUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));

    if (!firebaseUid) {
      return;
    }

    const occupationValue =
      occupationChoice === 'manual' ? manualOccupation.trim() : occupationChoice;
    const persistedCountry = String(currentUser?.country || '').trim();
    const effectiveCountry = isCountryLockedForProfile
      ? persistedCountry || selectedCountry || 'IN'
      : selectedCountry;
    const effectiveCountryCode = getCountryDialCode(effectiveCountry);
    const cleanedPhone = draftPhoneNumber.replace(/[\s()-]/g, '');
    const fullPhoneNumber = effectiveCountryCode + cleanedPhone;
    const effectiveCurrency =
      draftCurrency ||
      currentUser?.currencySymbol ||
      countryToCurrency[effectiveCountry] ||
      '₹';

    // Build updated user object from draft state
    const localUpdatedUser = {
      ...currentUser,
      displayName: draftName.trim(),
      mobile: fullPhoneNumber,
      phoneNumber: fullPhoneNumber,
      country: effectiveCountry,
      currencySymbol: effectiveCurrency,
      gender: draftGender || null,
      occupation: occupationValue || null,
      bio: draftBio.trim() || null,
      setupComplete: true,
    };

    // STEP 1: Save to local AsyncStorage IMMEDIATELY (via updateSessionUser)
    try {
      const persisted = await updateSessionUser(localUpdatedUser);
      setCurrentUser(persisted || localUpdatedUser);
    } catch (err) {
      console.warn('[ProfileSettings] Local save failed:', err);
    }

    // STEP 2: Backend sync (non-blocking, fire and forget)
    const payload = {
      displayName: draftName.trim(),
      mobile: fullPhoneNumber || null,
      country: effectiveCountry,
      currencySymbol: effectiveCurrency,
      gender: draftGender || null,
      occupation: occupationValue || null,
      bio: draftBio.trim() || null,
      setupComplete: true,
    };

    updateProfile(firebaseUid, payload)
      .then(response => {
        if (response && response.success) {
          syncUserProfileToCloud({
            displayName: localUpdatedUser.displayName || '',
            phoneNumber: localUpdatedUser.mobile || '',
            email: localUpdatedUser.email || '',
            photoURL: localUpdatedUser.photoURL || '',
          }).catch(err => console.warn('[ProfileSettings] Cloud sync skipped:', err));
          queueBackupFromStorage();
        }
      })
      .catch(err => console.warn('[ProfileSettings] Backend sync failed (will retry later):', err));
  }, [
    currentUser,
    draftName,
    draftPhoneNumber,
    selectedCountry,
    draftGender,
    draftBio,
    draftCurrency,
    occupationChoice,
    manualOccupation,
    isCountryLockedForProfile,
    updateSessionUser,
  ]);

  // Store handleSaveAll in ref to avoid stale closure in back button
  const handleSaveAllRef = React.useRef(handleSaveAll);
  React.useEffect(() => {
    handleSaveAllRef.current = handleSaveAll;
  }, [handleSaveAll]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', event => {
      if (bypassBeforeRemoveRef.current) {
        bypassBeforeRemoveRef.current = false;
        return;
      }

      if (saveInProgressRef.current) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      saveInProgressRef.current = true;

      (async () => {
        try {
          await handleSaveAllRef.current();
        } finally {
          saveInProgressRef.current = false;
          bypassBeforeRemoveRef.current = true;
          navigation.dispatch(event.data.action);
        }
      })();
    });

    return unsubscribe;
  }, [navigation]);

  const handleRequestThisNumber = async () => {
    const cleanedPhone = draftPhoneNumber.replace(/\D/g, '');
    const fullPhoneNumber = `${countryCode}${cleanedPhone}`;
    const selfFirebaseUid =
      currentUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));

    if (!selfFirebaseUid) {
      showToast('User authentication error. Please login again.', 'error');
      return;
    }

    setRequestingPhoneClaim(true);
    try {
      const response = await requestPhoneClaim(fullPhoneNumber);
      showToast(
        response?.message ||
          'Request sent. Current owner will be notified.',
        'success',
      );
    } catch (error) {
      showToast(
        error?.message || 'Unable to send phone transfer request.',
        'error',
      );
    } finally {
      setRequestingPhoneClaim(false);
    }
  };

  return (
    <View style={styles.container}>
      <TexturedSurface
        style={[
          styles.header,
          {
            paddingTop: spacing.sm + insets.top,
          },
        ]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }}>
          <Icon name="chevron-back" size={22} color={colors.headerIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Settings</Text>
        <View style={styles.headerSpacer} />
      </TexturedSurface>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileIdentityCard}>
          <View style={styles.profileIdentityImageWrap}>
            <View style={styles.profileIdentityImageContainer}>
              <TouchableOpacity
                style={styles.profileIdentityImageButton}
                onPress={openPhotoPreview}
                activeOpacity={0.8}>
                {draftPhotoUri ? (
                  <Image
                    source={{uri: draftPhotoUri}}
                    style={styles.profileIdentityImage}
                  />
                ) : (
                  <View style={styles.profileIdentityPlaceholder}>
                    <Icon name="person" size={38} color={colors.text.secondary} />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.profileIdentityCameraBadge}
                onPress={handlePickImage}
                accessibilityLabel="Change profile photo">
                <Icon name="camera" size={13} color={colors.onPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.profileIdentityHintText}>Tap to change on Google</Text>
          </View>
          <View style={styles.profileIdentityInfo}>
            <Text style={styles.profileIdentityLabel}>Email</Text>
            <Text style={styles.profileIdentityValue} numberOfLines={1}>
              {currentUser?.email || '-'}
            </Text>
            <Text style={[styles.profileIdentityLabel, styles.profileIdentityLabelSpacing]}>
              Username
            </Text>
            <Text style={styles.profileIdentityValue} numberOfLines={1}>
              {draftUsername || currentUser?.username || '-'}
            </Text>
          </View>
        </View>

          <View style={styles.formCard}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Enter your name"
          />

          <View style={styles.formSectionDivider} />

          <Text style={styles.label}>Country & Phone Number</Text>
          <View style={[styles.hybridField, phoneError && styles.inputError]}>
            <TouchableOpacity
              style={styles.hybridCountryButton}
              onPress={() => {
                if (isCountryLockedForProfile) {
                  showToast('Country is locked after setup', 'info');
                  return;
                }
                setShowCountryPicker(true);
              }}>
              <Text style={styles.hybridCountryText} numberOfLines={1}>
                {getCountryFlag(selectedCountry)} {countryCode}
              </Text>
              <Icon
                name="chevron-down"
                size={16}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
            <View style={styles.hybridDivider} />

            <TextInput
              style={styles.hybridPhoneInput}
              value={draftPhoneNumber}
              onChangeText={text => {
                setDraftPhoneNumber(text);
                setHasPhoneEdited(true);
                setPhoneError('');
                setPhoneAvailable(null);
                setPhoneStatusMessage('');
              }}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
            />
          </View>
          {checkingPhone && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.checkingText}>
                Checking phone number...
              </Text>
            </View>
          )}
          {!checkingPhone && phoneAvailable === true && (
            <View style={styles.statusRow}>
              <Text style={styles.successText}>
                ✓ Phone number available
              </Text>
            </View>
          )}
          {!checkingPhone && phoneAvailable === false && !phoneError ? (
            <Text style={styles.errorText}>✗ {phoneStatusMessage}</Text>
          ) : null}
          {phoneError ? (
            <Text style={styles.errorText}>{phoneError}</Text>
          ) : null}
          {!checkingPhone && phoneAvailable === false && !phoneError ? (
            <View>
              <TouchableOpacity
                style={[
                  styles.claimButton,
                  requestingPhoneClaim && styles.claimButtonDisabled,
                ]}
                onPress={handleRequestThisNumber}
                disabled={checkingPhone || requestingPhoneClaim}>
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

          <View style={styles.formSectionDivider} />

          <Text style={styles.label}>Currency</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowCurrencyPicker(true)}>
            <Text style={styles.pickerButtonText}>
              {draftCurrency || countryToCurrency[selectedCountry] || '₹'}
              {'  '}
              {getCurrencyLabel(draftCurrency || countryToCurrency[selectedCountry] || '₹')}
            </Text>
            <Icon
              name="chevron-down"
              size={18}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          <View style={styles.formSectionDivider} />

          <Text style={styles.label}>Gender</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setGenderModalVisible(true)}>
            <Text style={styles.pickerButtonText}>
              {draftGender
                ? draftGender === 'Other'
                  ? 'I would not prefer'
                  : draftGender
                : 'Select gender'}
            </Text>
            <Icon
              name="chevron-down"
              size={18}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          <View style={styles.formSectionDivider} />

          <Text style={styles.label}>Occupation</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setOccupationModalVisible(true)}>
            <Text style={styles.pickerButtonText}>
              {occupationChoice === 'manual'
                ? manualOccupation || 'Manual'
                : occupationChoice || 'Select Occupation (Optional)'}
            </Text>
            <Icon
              name="chevron-down"
              size={18}
              color={colors.text.secondary}
            />
          </TouchableOpacity>
          {occupationChoice === 'manual' && (
            <TextInput
              style={styles.input}
              value={manualOccupation}
              onChangeText={setManualOccupation}
              placeholder="Enter occupation"
            />
          )}

          <View style={styles.formSectionDivider} />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.inputBio]}
            value={draftBio}
            onChangeText={setDraftBio}
            placeholder="Write something about yourself..."
            multiline
            maxLength={150}
          />
          <Text style={styles.bioCharCount}>{draftBio.length}/150</Text>
        </View>
      </ScrollView>

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
                    if (isCountryLockedForProfile) {
                      showToast('Country is locked after setup', 'info');
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

      <CurrencyPickerModal
        visible={showCurrencyPicker}
        currentSymbol={draftCurrency || countryToCurrency[selectedCountry] || '₹'}
        isSaving={false}
        onClose={() => setShowCurrencyPicker(false)}
        onSelect={item => {
          setDraftCurrency(item?.symbol || '');
          setShowCurrencyPicker(false);
        }}
      />

      <BottomSheet
        visible={genderModalVisible}
        onClose={() => setGenderModalVisible(false)}>
        <Text style={styles.bottomSheetTitle}>Select Gender</Text>
        {GENDER_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.dropdownOption,
              draftGender === option.value && styles.dropdownOptionActive,
            ]}
            onPress={() => {
              setDraftGender(option.value);
              setGenderModalVisible(false);
            }}>
            <Text
              style={[
                styles.dropdownOptionText,
                draftGender === option.value && styles.dropdownOptionTextActive,
              ]}>
              {option.label}
            </Text>
            {draftGender === option.value && (
              <Icon name="checkmark" size={18} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={occupationModalVisible}
        onClose={() => setOccupationModalVisible(false)}>
        <Text style={styles.bottomSheetTitle}>Select Occupation</Text>
        {OCCUPATION_OPTIONS.map(option => {
          const isSelected = occupationChoice === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.dropdownOption,
                isSelected && styles.dropdownOptionActive,
              ]}
              onPress={() => {
                setOccupationChoice(option.value);
                if (option.value !== 'manual') {
                  setManualOccupation('');
                }
                setOccupationModalVisible(false);
              }}>
              <Text
                style={[
                  styles.dropdownOptionText,
                  isSelected && styles.dropdownOptionTextActive,
                ]}>
                {option.label}
              </Text>
              {isSelected && (
                <Icon name="checkmark" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <Modal
        visible={photoPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoPreviewVisible(false)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity
            style={styles.previewBackdrop}
            activeOpacity={1}
            onPress={() => setPhotoPreviewVisible(false)}
          />
          {draftPhotoUri ? (
            <Image
              source={{uri: draftPhotoUri}}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : null}
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPhotoPreviewVisible(false)}>
            <Icon name="close" size={18} color={colors.white} />
          </TouchableOpacity>
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
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      elevation: 2,
    },
    backButton: {
      padding: spacing.xs,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
      color: colors.headerText,
    },
    headerSpacer: {
      width: 32,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
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
      shadowColor: colors.shadow,
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
      shadowColor: colors.shadow,
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
    formCard: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: fontSize.small,
      fontWeight: fontWeight.semibold,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
      marginTop: spacing.sm + 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.md,
    },
    input: {
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
    inputBio: {
      minHeight: 90,
      paddingVertical: spacing.md,
      textAlignVertical: 'top',
    },
    inputError: {
      borderColor: withAlpha(colors.error, 0.4),
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
    readOnlyBar: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      backgroundColor: colors.input,
      marginBottom: spacing.md,
      marginHorizontal: spacing.md,
    },
    readOnlyBarText: {
      fontSize: fontSize.medium,
      color: colors.text.light,
    },
    pickerButton: {
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
    pickerButtonText: {
      fontSize: fontSize.medium,
      color: colors.text.primary,
      flex: 1,
      marginRight: spacing.sm,
    },
    formSectionDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
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
    bioCharCount: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      textAlign: 'right',
      marginBottom: spacing.md,
      marginTop: -spacing.sm,
      marginHorizontal: spacing.md,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
      marginHorizontal: spacing.md,
      borderWidth: 0,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 3,
    },
    saveButtonDisabled: {
      opacity: 1,
      backgroundColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    saveButtonText: {
      color: colors.onPrimary,
      fontSize: fontSize.medium,
      fontWeight: fontWeight.semibold,
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
      color: colors.onPrimary,
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

export default ProfileSettings;
