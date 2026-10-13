import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  SectionList,
  TextInput,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Share,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Contacts from 'react-native-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {fetchUsersByPhones} from '../services/api';
import {COUNTRIES} from '../utils/countries';
import {useAppAlert} from '../context/AppAlertContext';
import {useTheme} from '../context/ThemeContext';
import {cacheUserData} from '../services/chatDatabase';
import {readCachedSessionUser} from '../services/sessionService';
import {isLedgerContactSaved} from '../services/ledgerContactBootstrapService';
import {
  isInstalledAppUser,
  normalizePhoneForLookup,
  buildUsersByPhoneMap,
  pickMatchedUserForPhones,
} from '../services/appUserRecognition';

const DEVICE_CONTACTS_CACHE_KEY = 'ledgerDeviceContacts';
const APP_USERS_CACHE_KEY = 'ledgerAppUsersCache';
const APP_USERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INVITE_MESSAGE = `Hey! I've been using Savingo to track expenses, manage credit records and chat for acknowledgements — all in one app. You should try it too!

Download: https://play.google.com/store/apps/details?id=com.jasmeet.accountapp`;

const requestIdle = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (cb) => setTimeout(() => cb({timeRemaining: () => 0, didTimeout: true}), 0);

const INITIAL_RENDER_COUNT = 8;
const WINDOW_SIZE = 5;

const getDialCodeByCountry = countryCodeValue => {
  const countryObj = COUNTRIES.find(item => item.code === countryCodeValue);
  return countryObj?.dialCode || '';
};

const logPerf = (label, start) => {
  void label;
  void start;
};

const ContactRow = React.memo(function ContactRow({
  item,
  isAppUser,
  onAdd,
  optimisticActionId,
  styles,
  colors,
}) {
  const name = item.displayNameComputed || item.displayName || item.givenName || item.familyName || 'Unnamed Contact';
  const phoneStructuredName = [item.givenName, item.familyName].filter(Boolean).join(' ').trim();
  const isEmailLike = s => Boolean(s) && String(s).includes('@');
  const isUsernameLike = s => Boolean(s) && !String(s).includes(' ') && String(s) === String(s).toLowerCase() && String(s).length > 5;
  const nameForInitial = phoneStructuredName
    || (!isEmailLike(name) && !isUsernameLike(name) && name)
    || (!isEmailLike(item?.appUser?.displayName) && item?.appUser?.displayName)
    || '?';
  const phone = item.phoneComputed || 'No phone number';
  const numberChanged = isAppUser && item?.userStatus === 'number_changed';
  const isOptimistic = optimisticActionId && String(item.recordID) === optimisticActionId;

  const photoUri = String(item?.appUser?.photoURL || item?.appUser?.photo_url || '').trim();

  return (
    <Pressable
      onPress={() => onAdd(item)}
      android_ripple={{color: 'rgba(0,0,0,0.06)'}}
      style={({pressed}) => [
        styles.modalContactRow,
        pressed && styles.rowPressed,
        isOptimistic && styles.rowOptimistic,
      ]}>
      <View
        style={[
          styles.contactAvatar,
          styles.modalContactAvatar,
          isAppUser && !photoUri && styles.contactAvatarAppUser,
          photoUri && styles.contactAvatarPhoto,
        ]}>
        {photoUri ? (
          <Image
            source={{uri: photoUri}}
            style={styles.contactAvatarImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.contactAvatarText}>
            {(nameForInitial || '?').charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.modalContactDetails}>
        <Text style={styles.contactName} numberOfLines={1}>
          {name}
          {isAppUser && item?.appUser?.username ? (
            <Text style={styles.contactUsernameInline}>{' · '}{item.appUser.username}</Text>
          ) : null}
        </Text>
        <Text style={styles.contactPhone} numberOfLines={1}>
          {phone}
        </Text>
        {numberChanged ? (
          <Text style={styles.numberChangedText} numberOfLines={1}>
            Number changed: now on {item?.currentPhone || 'new number'}
          </Text>
        ) : null}
      </View>
      <View style={styles.contactAction}>
        <Icon
          name="add-circle-outline"
          size={20}
          color={isAppUser ? colors.success : colors.primary}
        />
      </View>
    </Pressable>
  );
});

const LedgerAddContactScreen = ({navigation, route}) => {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {showAlert} = useAppAlert();
  const themedAlert = useCallback(
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
  const [contactOptions, setContactOptions] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef(null);
  const [appUsers, setAppUsers] = useState([]);
  const [inviteContacts, setInviteContacts] = useState([]);
  const [userLookupLoading, setUserLookupLoading] = useState(false);
  const [userLookupError, setUserLookupError] = useState('');
  const [defaultDialCode, setDefaultDialCode] = useState('');
  const [selfUserId, setSelfUserId] = useState('');
  const [selfPhoneKeys, setSelfPhoneKeys] = useState([]);
  const [listReady, setListReady] = useState(false);
  const [optimisticActionId, setOptimisticActionId] = useState(null);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isOpening, setIsOpening] = useState(true);
  const contactsFetchInFlight = useRef(false);
  const appUsersFetchInFlight = useRef(false);
  const hasFreshCache = useRef(false);
  const isScreenActive = useRef(true);

  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(contactSearch);
    }, 300);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [contactSearch]);

  useEffect(() => {
    let cancelled = false;
    const task = requestIdle(() => {
      const loadCachedDeviceContacts = async () => {
        const start = Date.now();
        try {
          const cached = await AsyncStorage.getItem(DEVICE_CONTACTS_CACHE_KEY);
          logPerf('AsyncStorage read', start);
          if (cancelled || !isScreenActive.current) {
            return;
          }
          if (cached) {
            const parseStart = Date.now();
            const parsed = JSON.parse(cached);
            logPerf('JSON parse', parseStart);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (isScreenActive.current) {
                setContactOptions(parsed);
              }
            }
          }
        } catch (error) {
          console.error('Failed to load cached device contacts:', error);
        }
      };
      loadCachedDeviceContacts();
    });

    return () => {
      cancelled = true;
      if (task && typeof task.cancel === 'function') {
        task.cancel();
      }
    };
  }, []);

  useEffect(() => {
    const onFocus = navigation.addListener('focus', () => {
      isScreenActive.current = true;
      setListReady(false);
      requestIdle(() => {
        if (!isScreenActive.current) {
          return;
        }
        setListReady(true);
        setIsOpening(false);
        if (contactOptions.length === 0) {
          loadDeviceContacts();
        }
      });
    });
    const onBlur = navigation.addListener('blur', () => {
      isScreenActive.current = false;
      setListReady(false);
    });
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation, contactOptions.length, loadDeviceContacts]);

  useEffect(() => {
    if (!listReady || contactOptions.length === 0) {
      return;
    }
    const runLookup = async () => {
      const usedCache = await loadAppUsersCache();
      if (!usedCache) {
        fetchAppUsers();
      }
    };
    runLookup();
  }, [listReady, contactOptions, loadAppUsersCache, fetchAppUsers]);

  useEffect(() => {
    const loadUserDialCode = async () => {
      try {
        const parsedUser = await readCachedSessionUser();
        const countryCodeValue = String(parsedUser?.country || '').trim().toUpperCase();
        const resolvedDialCode = getDialCodeByCountry(countryCodeValue);
        const resolvedUserId = String(
          parsedUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid')) || ''
        ).trim();
        if (resolvedUserId) {
          setSelfUserId(resolvedUserId);
        }
        const ownRawPhones = [parsedUser?.phoneNumber, parsedUser?.mobile]
          .map(item => String(item || '').trim())
          .filter(Boolean);
        const ownLookupCandidates = new Set();
        ownRawPhones.forEach(rawValue => {
          const digits = rawValue.replace(/\D/g, '');
          if (!digits) {
            return;
          }
          const normalized = normalizePhoneForLookup(rawValue);
          if (normalized) {
            ownLookupCandidates.add(normalized);
          }
          if (rawValue.startsWith('+') || digits.length > 10) {
            ownLookupCandidates.add(`+${digits}`);
            return;
          }
          const dialDigits = String(resolvedDialCode || '').replace(/\D/g, '');
          if (dialDigits && digits.length >= 8 && digits.length <= 10) {
            ownLookupCandidates.add(`+${dialDigits}${digits}`);
          }
        });
        setSelfPhoneKeys(Array.from(ownLookupCandidates));
        if (resolvedDialCode) {
          setDefaultDialCode(resolvedDialCode);
        }
      } catch (error) {
        console.error('Failed to load user dial code:', error);
      }
    };
    loadUserDialCode();
  }, []);

  const requestContactsPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      const alreadyGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      if (alreadyGranted) {
        return true;
      }
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        {
          title: 'Contacts Permission',
          message: 'Allow access to your contacts to add people to ledger.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        }
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        return true;
      }
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        themedAlert(
          'Permission Blocked',
          'Please enable contacts access in Settings.',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: () => Linking.openSettings()},
          ]
        );
        return false;
      }
      return false;
    }

    const permission = await Contacts.requestPermission();
    return permission === 'authorized';
  }, []);

  const getContactNameFromDevice = useCallback(contact => {
    if (contact.displayNameComputed) {
      return contact.displayNameComputed;
    }
    const fullName = [contact.givenName, contact.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || contact.displayName || 'Unnamed Contact';
  }, []);

  const getContactPhone = useCallback(contact => {
    if (contact.phoneComputed) {
      return contact.phoneComputed;
    }
    const phone = contact.phoneNumbers?.find(item =>
      String(item.number || '').trim()
    )?.number;
    return phone || 'No phone number';
  }, []);

  const normalizeDeviceContacts = contactsList =>
    contactsList.map(contact => {
      const fullName = [contact.givenName, contact.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const displayNameComputed = fullName || contact.displayName || 'Unnamed Contact';
      const phoneComputed = contact.phoneNumbers?.find(item =>
        String(item.number || '').trim()
      )?.number || 'No phone number';
      const searchKey = `${displayNameComputed} ${phoneComputed}`.toLowerCase();
      const sortKey = displayNameComputed.toLowerCase();

      return {
        recordID: contact.recordID,
        displayName: contact.displayName || '',
        givenName: contact.givenName || '',
        familyName: contact.familyName || '',
        phoneNumbers: (contact.phoneNumbers || [])
          .map(item => ({number: item.number}))
          .filter(item => String(item.number || '').trim()),
        displayNameComputed,
        phoneComputed,
        searchKey,
        sortKey,
      };
    });

  const loadDeviceContacts = useCallback(async () => {
    if (contactsFetchInFlight.current) {
      return [];
    }
    contactsFetchInFlight.current = true;
    const start = Date.now();
    try {
      const granted = await requestContactsPermission();
      logPerf('permission check', start);
      if (!granted) {
        themedAlert('Permission Required', 'Please allow contacts access.');
        return [];
      }
      const fetcher = Contacts.getAllWithoutPhotos || Contacts.getAll;
      const fetchStart = Date.now();
      const list = await fetcher();
      logPerf('contacts fetch', fetchStart);
      const filterStart = Date.now();
      const filtered = list.filter(contact => {
        const hasPhone = contact.phoneNumbers?.some(item =>
          String(item.number || '').trim()
        );
        const hasName = [contact.displayName, contact.givenName, contact.familyName]
          .some(value => String(value || '').trim());
        return hasPhone && hasName;
      });
      logPerf('contacts filter', filterStart);
      const normalizeStart = Date.now();
      const normalized = normalizeDeviceContacts(filtered);
      logPerf('contacts normalize', normalizeStart);

      const sortStart = Date.now();
      const sorted = normalized.sort((a, b) => {
        const aKey = a.sortKey || '';
        const bKey = b.sortKey || '';
        if (aKey < bKey) return -1;
        if (aKey > bKey) return 1;
        return 0;
      });
      logPerf('contacts sort', sortStart);

      if (isScreenActive.current) {
        setContactOptions(sorted);
      }
      const saveStart = Date.now();
      await AsyncStorage.setItem(
        DEVICE_CONTACTS_CACHE_KEY,
        JSON.stringify(sorted)
      );
      logPerf('contacts cache save', saveStart);
      return sorted;
    } catch (error) {
      console.error('Failed to load contacts:', error);
      themedAlert('Error', 'Failed to load contacts.');
      return [];
    } finally {
      logPerf('total loadDeviceContacts', start);
      contactsFetchInFlight.current = false;
    }
  }, [requestContactsPermission, getContactNameFromDevice]);

  const getLookupPhones = useCallback(
    contact => {
      const rawNumbers = (contact.phoneNumbers || [])
        .map(item => String(item?.number || '').trim())
        .filter(Boolean);
      const lookupCandidates = new Set();

      rawNumbers.forEach(rawValue => {
        const digits = String(rawValue).replace(/\D/g, '');
        if (!digits) {
          return;
        }

        const hasExplicitCountryCode = rawValue.startsWith('+');
        const normalized = normalizePhoneForLookup(rawValue);
        if (normalized) {
          lookupCandidates.add(normalized);
        }

        if (hasExplicitCountryCode) {
          lookupCandidates.add(`+${digits}`);
          return;
        }

        if (digits.length > 10) {
          lookupCandidates.add(`+${digits}`);
          return;
        }

        const dialDigits = String(defaultDialCode || '').replace(/\D/g, '');
        if (dialDigits && digits.length >= 8 && digits.length <= 10) {
          lookupCandidates.add(`+${dialDigits}${digits}`);
        }
      });

      return Array.from(lookupCandidates);
    },
    [defaultDialCode]
  );

  const buildContactLists = useCallback((usersByPhone, contactsList = contactOptions) => {
    const appList = [];
    const inviteList = [];
    const selfPhonesSet = new Set(selfPhoneKeys.map(value => String(value).trim()).filter(Boolean));
    const seenAppUserIds = new Set();

    contactsList.forEach(contact => {
      const lookupPhones = getLookupPhones(contact);
      const isSelfByPhone = lookupPhones.some(value => selfPhonesSet.has(String(value)));
      if (isSelfByPhone) {
        return;
      }
      const matchedPhone = lookupPhones.find(value => usersByPhone.has(value));
      const matched = pickMatchedUserForPhones(usersByPhone, lookupPhones);
      if (matched?.matchedPhone) {
        const matchedUser = matched.user || {};
        if (!isInstalledAppUser(matchedUser)) {
          inviteList.push({
            ...contact,
            lookupPhone: matched.matchedPhone,
          });
          return;
        }
        const matchedUserId = String(matchedUser.firebaseUid || matchedUser.userId || '').trim();
        if (selfUserId && matchedUserId && matchedUserId === selfUserId) {
          return;
        }
        if (matchedUserId && seenAppUserIds.has(matchedUserId)) {
          return;
        }
        if (matchedUserId) {
          seenAppUserIds.add(matchedUserId);
        }
        appList.push({
          ...contact,
          lookupPhone: matched.matchedPhone,
          appUser: matchedUser,
          isAppUser: 1,
          userId: matchedUser.firebaseUid || matchedUser.userId || '',
          username: matchedUser.username || '',
          appInstallState: String(matchedUser.appInstallState || 'installed').trim().toLowerCase(),
          userStatus: matchedUser.status || 'app_user',
          oldPhone: matchedUser.oldPhone || '',
          currentPhone: matchedUser.currentPhone || matchedUser.mobile || '',
        });
      } else {
        inviteList.push({
          ...contact,
          lookupPhone: lookupPhones[0] || '',
        });
      }
    });

    setAppUsers(appList);
    setInviteContacts(inviteList);
  }, [contactOptions, getLookupPhones, selfPhoneKeys, selfUserId]);

  const loadAppUsersCache = useCallback(async () => {
    try {
      const cachedRaw = await AsyncStorage.getItem(APP_USERS_CACHE_KEY);
      if (!cachedRaw) {
        if (isScreenActive.current) {
          setAppUsers([]);
          setInviteContacts(contactOptions);
        }
        return false;
      }
      const cached = JSON.parse(cachedRaw);
      const ts = cached?.ts || 0;
      const users = Array.isArray(cached?.users) ? cached.users : [];
    if (!ts || users.length === 0 || Date.now() - ts > APP_USERS_CACHE_TTL_MS) {
        if (isScreenActive.current) {
          setAppUsers([]);
          setInviteContacts(contactOptions);
        }
        return false;
      }
      const usersByPhone = new Map();
      const mappedUsersByPhone = buildUsersByPhoneMap(users);
      mappedUsersByPhone.forEach((value, key) => {
        usersByPhone.set(key, value);
      });
      hasFreshCache.current = true;
      if (isScreenActive.current) {
        buildContactLists(usersByPhone, contactOptions);
      }
      return true;
    } catch (error) {
      if (isScreenActive.current) {
        setAppUsers([]);
        setInviteContacts(contactOptions);
      }
      return false;
    }
  }, [contactOptions, buildContactLists]);

  const fetchAppUsers = useCallback(async (force = false, contactsOverride = null) => {
    if (appUsersFetchInFlight.current) {
      return;
    }
    if (!force && hasFreshCache.current) {
      return;
    }
    appUsersFetchInFlight.current = true;
    if (isScreenActive.current) {
      setUserLookupLoading(true);
      setUserLookupError('');
    }

    try {
      const phoneStart = Date.now();
      const sourceContacts = Array.isArray(contactsOverride) ? contactsOverride : contactOptions;
      const phones = Array.from(
        new Set(sourceContacts.flatMap(contact => getLookupPhones(contact)).filter(Boolean))
      );
      logPerf('phones map/filter', phoneStart);

      if (phones.length === 0) {
        if (isScreenActive.current) {
          setAppUsers([]);
          setInviteContacts(sourceContacts);
        }
        return;
      }

      const fetchStart = Date.now();
      const response = await fetchUsersByPhones(phones);
      logPerf('users-by-phones fetch', fetchStart);
      const users = Array.isArray(response?.users) ? response.users : [];
      const mapStart = Date.now();
      const usersByPhone = buildUsersByPhoneMap(users);
      logPerf('users map', mapStart);

      if (isScreenActive.current) {
        const buildStart = Date.now();
        if (Array.isArray(contactsOverride)) {
          setContactOptions(sourceContacts);
        }
        buildContactLists(usersByPhone, sourceContacts);
        logPerf('buildContactLists', buildStart);
      }

      const saveStart = Date.now();
      await AsyncStorage.setItem(
        APP_USERS_CACHE_KEY,
        JSON.stringify({ts: Date.now(), users})
      );
      logPerf('users cache save', saveStart);

      // Cache user photos in SQLite so LedgerScreen can display them
      users.forEach(user => {
        const uid = String(user?.userId || user?.firebaseUid || user?.id || '').trim();
        if (uid) {
          cacheUserData({
            userId: uid,
            username: user.username || '',
            displayName: user.displayName || '',
            phoneNumber: user.mobile || user.phoneNumber || '',
            photoURL: user.photoURL || '',
            isOnline: false,
            lastOnline: Date.now(),
          });
        }
      });
    } catch (error) {
      if (isScreenActive.current) {
        setUserLookupError('Failed to check app users');
        setAppUsers([]);
        setInviteContacts(contactOptions);
      }
    } finally {
      if (isScreenActive.current) {
        setUserLookupLoading(false);
      }
      appUsersFetchInFlight.current = false;
    }
  }, [contactOptions, buildContactLists, getLookupPhones]);

  const handleRefreshContacts = useCallback(async () => {
    if (!isScreenActive.current || contactsFetchInFlight.current || appUsersFetchInFlight.current) {
      return;
    }

    hasFreshCache.current = false;
    setUserLookupError('');
    await AsyncStorage.removeItem(APP_USERS_CACHE_KEY);

    const latestContacts = await loadDeviceContacts();
    const normalizedContacts = Array.isArray(latestContacts) ? latestContacts : [];
    await fetchAppUsers(true, normalizedContacts);
  }, [fetchAppUsers, loadDeviceContacts]);

  const handleInviteContact = useCallback(async (contact) => {
    setOptimisticActionId(String(contact.recordID));
    try {
      const name = getContactNameFromDevice(contact);
      const message = name ? `${INVITE_MESSAGE} - ${name}` : INVITE_MESSAGE;
      await Share.share({message});
    } catch (error) {
      themedAlert('Error', 'Failed to open share');
    } finally {
      setOptimisticActionId(null);
    }
  }, [getContactNameFromDevice]);

  const handleAddContact = useCallback(async (contact) => {
    const incomingUserId = String(
      contact?.userId || contact?.appUser?.firebaseUid || contact?.appUser?.userId || ''
    ).trim();
    const appInstallState = String(
      contact?.appInstallState || contact?.appUser?.appInstallState || 'installed'
    ).trim().toLowerCase();
    const contactPhones = getLookupPhones(contact);
    const selfPhonesSet = new Set(selfPhoneKeys.map(value => String(value).trim()).filter(Boolean));
    const isSelfByPhone = contactPhones.some(value => selfPhonesSet.has(String(value)));
    if ((selfUserId && incomingUserId && incomingUserId === selfUserId) || isSelfByPhone) {
      themedAlert('Not Allowed', 'You cannot add your own contact.');
      return;
    }
    const canonicalContact = incomingUserId
      ? {
          ...contact,
          recordID: `app_${incomingUserId}`,
          isAppUser: isInstalledAppUser({appInstallState}) ? 1 : 0,
          userId: incomingUserId,
          appInstallState,
          numberChanged: contact?.userStatus === 'number_changed',
          oldPhone: contact?.oldPhone || '',
          currentPhone: contact?.currentPhone || '',
        }
      : contact;

    setOptimisticActionId(String(canonicalContact.recordID || contact.recordID));
    // Open the chat right away. The contact is saved to the Ledger list only when
    // the first message or entry is created (see LedgerContactDetailScreen).
    let alreadySaved = false;
    try {
      alreadySaved = await isLedgerContactSaved({
        recordID: canonicalContact.recordID,
        userId: incomingUserId,
      });
    } catch (error) {
      console.error('Failed to check saved ledger contact:', error);
    }
    isScreenActive.current = false;
    navigation.replace('LedgerContactDetail', {
      contact: canonicalContact,
      isDraftContact: !alreadySaved,
    });
  }, [navigation, getLookupPhones, selfPhoneKeys, selfUserId]);

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const filterContacts = useCallback(
    (list) => {
      if (!normalizedSearch) {
        return list;
      }
      return list.filter(item => {
        const key = item.searchKey || `${getContactNameFromDevice(item)} ${getContactPhone(item)}`.toLowerCase();
        return key.includes(normalizedSearch);
      });
    },
    [normalizedSearch, getContactNameFromDevice, getContactPhone],
  );

  const filteredAppUsers = useMemo(() => filterContacts(appUsers), [appUsers, filterContacts]);
  const filteredInviteContacts = useMemo(() => filterContacts(inviteContacts), [inviteContacts, filterContacts]);

  const sections = useMemo(
    () =>
      [
        {
          key: 'onApp',
          title: `On App (${filteredAppUsers.length})`,
          data: filteredAppUsers,
        },
        {
          key: 'invite',
          title: `Invite (${filteredInviteContacts.length})`,
          data: filteredInviteContacts,
        },
      ].filter(section => section.data.length > 0),
    [filteredAppUsers, filteredInviteContacts]
  );



  const renderContactOption = useCallback(({item, section}) => {
    const isAppUser = section?.key === 'onApp';
    return (
      <ContactRow
        item={item}
        isAppUser={isAppUser}
        onAdd={handleAddContact}
        optimisticActionId={optimisticActionId}
        styles={styles}
        colors={colors}
      />
    );
  }, [handleAddContact, optimisticActionId, styles, colors]);

  const renderSectionHeader = useCallback(({section}) => (
    <View style={styles.modalSectionHeader}>
      <Text style={styles.modalSectionTitle}>{section.title}</Text>
    </View>
  ), [styles]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (isNavigatingBack) {
              return;
            }
            setIsNavigatingBack(true);
            isScreenActive.current = false;
            navigation.goBack();
          }}
          disabled={isNavigatingBack}
          style={({pressed}) => [
            styles.backButton,
            (pressed || isNavigatingBack) && styles.backButtonPressed,
          ]}>
          <Icon name="chevron-back" size={22} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Contact</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search" size={18} color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          value={contactSearch}
          onChangeText={setContactSearch}
          placeholder="Search by name or number"
          placeholderTextColor={colors.text.light}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {contactSearch !== debouncedSearch ? (
        <Text style={styles.searchingText}>Searching...</Text>
      ) : null}
      <Pressable
        onPress={handleRefreshContacts}
        android_ripple={{color: 'rgba(0,0,0,0.06)'}}
        style={({pressed}) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}>
        <Icon name="refresh" size={16} color={colors.text.secondary} />
        <Text style={styles.refreshButtonText}>Refresh contacts</Text>
      </Pressable>
      <View>
          {userLookupLoading ? (
            <View style={styles.modalLookupBanner}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Checking app users...</Text>
            </View>
          ) : null}
          {userLookupError ? (
            <Text style={styles.modalErrorText}>{userLookupError}</Text>
          ) : null}
          {listReady ? (
            sections.length > 0 ? (
              <SectionList
                initialNumToRender={INITIAL_RENDER_COUNT}
                maxToRenderPerBatch={INITIAL_RENDER_COUNT}
                windowSize={WINDOW_SIZE}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews
                sections={sections}
                keyExtractor={item => String(item.recordID)}
                renderItem={renderContactOption}
                renderSectionHeader={renderSectionHeader}
                contentContainerStyle={styles.modalList}
                stickySectionHeadersEnabled={false}
              />
            ) : (
              <View style={styles.modalEmpty}>
                <Icon name="people-outline" size={48} color={colors.text.light} />
                <Text style={styles.modalEmptyText}>
                  {normalizedSearch ? 'No matches found' : 'No contacts found'}
                </Text>
                <Text style={styles.modalEmptySubtext}>
                  {normalizedSearch
                    ? 'Try a different name or number'
                    : 'Try again or check contacts permission'}
                </Text>
              </View>
            )
          ) : null}
      </View>
      {isNavigatingBack ? (
        <View pointerEvents="none" style={styles.backOverlay} />
      ) : null}

      {isOpening ? (
        <View pointerEvents="none" style={styles.openOverlay} />
      ) : null}
    </View>
  );
};

const createCardBase = colors => ({
  backgroundColor: colors.card,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.border,
  elevation: 1,
  shadowColor: colors.shadow,
  shadowOffset: {width: 0, height: 1},
  shadowOpacity: 0.05,
  shadowRadius: 2,
});

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.card,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 36,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    margin: spacing.md,
    backgroundColor: colors.input,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: fontSize.regular,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  refreshButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  refreshButtonText: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  modalLookupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalErrorText: {
    color: colors.error,
    fontSize: fontSize.small,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  modalSectionHeader: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  modalList: {
    paddingBottom: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowOptimistic: {
    backgroundColor: colors.panelMuted || colors.surfaceMuted,
  },
  modalContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  modalContactAvatar: {
    marginRight: spacing.md,
  },
  modalContactDetails: {
    flex: 1,
    minWidth: 0,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  contactAvatarAppUser: {
    backgroundColor: colors.success,
  },
  contactAvatarPhoto: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  contactAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  contactAvatarText: {
    color: colors.onPrimary,
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
  },
  contactName: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: 4,
  },
  contactUsernameInline: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.text.secondary,
  },
  contactPhone: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  numberChangedText: {
    marginTop: 2,
    fontSize: 12,
    color: colors.warning,
  },
  contactAction: {
    alignItems: 'flex-end',
  },
  inviteButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteButtonText: {
    color: colors.onPrimary,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  modalLoading: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  modalEmpty: {
    ...createCardBase(colors),
    padding: spacing.xl,
    alignItems: 'center',
    marginHorizontal: spacing.md,
  },
  modalEmptyText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  modalEmptySubtext: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  searchingText: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    opacity: 0.08,
  },
  openOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    opacity: 0.18,
  },
});

export default LedgerAddContactScreen;

