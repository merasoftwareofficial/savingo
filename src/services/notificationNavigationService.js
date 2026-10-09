import AsyncStorage from '@react-native-async-storage/async-storage';
import {StackActions} from '@react-navigation/native';
import {getContactName} from './ledgerDatabase';
import {
  DEFAULT_TAB_DASHBOARD,
  DEFAULT_TAB_ACCOUNTS,
  DEFAULT_TAB_LEDGER,
  readDefaultTabPreference,
} from '../utils/defaultTabPreference';
import {resolveConversationOpenIntent} from './chatSystem';
import {ensureLedgerDatabaseReady} from './dbLifecycleManager';
import {resolveInitialContactIdentity} from './ledgerContactBootstrapService';

const PENDING_CHAT_NAV_KEY = 'pendingChatNavigation';
const PENDING_CHAT_NAV_LAST_HANDLED_KEY = 'pendingChatNavigation:lastHandled';
const LEDGER_CONTACTS_KEY = 'ledgerContacts';
const NAV_DEDUPE_WINDOW_MS = 6000;
const DEBUG_NOTIFICATION_ROUTER = false;
const GENERIC_CONTACT_NAMES = new Set([
  'contact',
  'app user',
  'user',
  'unknown contact',
  'universal contact',
]);

const normalizeText = value => String(value || '').trim();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let notificationOpenInFlight = false;
let notificationOpenAttemptSeq = 0;

const summarizePayload = payload => {
  const normalized = normalizePendingChatNavigationPayload(payload);
  if (!normalized) {
    return {valid: false};
  }
  return {
    valid: true,
    eventId: normalizeText(normalized.eventId),
    notifVersion: normalizeText(normalized.notifVersion),
    conversationId: normalizeText(normalized.conversationId),
    senderId: normalizeText(normalized.senderId),
    contactRecordId: normalizeText(normalized.contactRecordId),
    notificationId: normalizeText(normalized.notificationId),
    openMode: normalizeText(normalized.openMode),
    pressedAt: Number(normalized.pressedAt || 0),
  };
};

const summarizeRoute = route => ({
  name: normalizeText(route?.name),
  hasParams: Boolean(route?.params),
  contactRecordId: normalizeText(route?.params?.contact?.recordID),
  conversationId: normalizeText(route?.params?.initialConversationId),
});

const getSafeCurrentRoute = navigationRef => {
  if (!navigationRef?.isReady?.() || !navigationRef?.getCurrentRoute) {
    return null;
  }
  try {
    return navigationRef.getCurrentRoute();
  } catch {
    return null;
  }
};

const getRootRouteTrail = navigationRef => {
  if (!navigationRef?.isReady?.()) {
    return [];
  }
  try {
    const state = navigationRef?.getRootState?.();
    if (!state || !Array.isArray(state.routes)) {
      return [];
    }
    return state.routes.map(item => normalizeText(item?.name)).filter(Boolean);
  } catch {
    return [];
  }
};
const normalizeValidName = value => {
  const name = normalizeText(value);
  if (!name) {
    return '';
  }
  if (GENERIC_CONTACT_NAMES.has(name.toLowerCase())) {
    return '';
  }
  return name;
};

const normalizeContactRecordId = (value, senderId) => {
  const raw = normalizeText(value);
  if (raw) {
    return raw;
  }
  const sid = normalizeText(senderId);
  return sid ? `app_${sid}` : '';
};

export const normalizePendingChatNavigationPayload = raw => {
  const conversationId = normalizeText(raw?.conversationId || raw?.conversation_id);
  const senderId = normalizeText(raw?.senderId || raw?.sender_id);
  const senderName = normalizeText(raw?.senderName || raw?.sender_name);
  const contactRecordId = normalizeContactRecordId(
    raw?.contactRecordId || raw?.contact_record_id,
    senderId,
  );
  const notificationId = normalizeText(raw?.notificationId || raw?.messageId || raw?.message_id);
  const eventId = normalizeText(raw?.eventId || raw?.event_id);
  const notifVersion = normalizeText(raw?.notifVersion || raw?.notif_version);
  const pressedAt = Number(raw?.pressedAt || Date.now()) || Date.now();
  const openMode = normalizeText(raw?.openMode || 'direct');
  const returnTo =
    raw?.returnTo && typeof raw.returnTo === 'object'
      ? {
          name: normalizeText(raw.returnTo?.name),
          params:
            raw.returnTo?.params && typeof raw.returnTo.params === 'object'
              ? raw.returnTo.params
              : {},
        }
      : null;
  const fallbackRoute =
    raw?.fallbackRoute && typeof raw.fallbackRoute === 'object'
      ? {
          name: normalizeText(raw.fallbackRoute?.name),
          params:
            raw.fallbackRoute?.params && typeof raw.fallbackRoute.params === 'object'
              ? raw.fallbackRoute.params
              : {},
        }
      : null;

  if (!conversationId && !senderId && !contactRecordId) {
    return null;
  }

  return {
    conversationId,
    senderId,
    senderName,
    contactRecordId,
    notificationId,
    eventId,
    notifVersion,
    pressedAt,
    openMode,
    returnTo,
    fallbackRoute,
  };
};

export const buildPendingChatSignature = payload => {
  const normalized = normalizePendingChatNavigationPayload(payload);
  if (!normalized) {
    return '';
  }
  return [
    normalizeText(normalized.eventId),
    normalizeText(normalized.conversationId),
    normalizeText(normalized.senderId),
    normalizeText(normalized.contactRecordId),
    normalizeText(normalized.notificationId),
  ].join('|');
};

export const storePendingChatNavigation = async rawPayload => {
  const payload = normalizePendingChatNavigationPayload(rawPayload);
  if (!payload) {
    logRouter('pending-store-skip-invalid', {
      rawKeys: Object.keys(rawPayload || {}),
    });
    return null;
  }
  await AsyncStorage.setItem(PENDING_CHAT_NAV_KEY, JSON.stringify(payload));
  logRouter('pending-store', {
    payload: summarizePayload(payload),
    signature: buildPendingChatSignature(payload),
  });
  return payload;
};

export const readPendingChatNavigation = async () => {
  const raw = await AsyncStorage.getItem(PENDING_CHAT_NAV_KEY);
  if (!raw) {
    logRouter('pending-read-empty');
    return null;
  }
  try {
    const parsed = normalizePendingChatNavigationPayload(JSON.parse(raw));
    logRouter('pending-read', {
      payload: summarizePayload(parsed),
      signature: buildPendingChatSignature(parsed),
    });
    return parsed;
  } catch {
    logRouter('pending-read-parse-failed');
    return null;
  }
};

export const clearPendingChatNavigation = async () => {
  await AsyncStorage.removeItem(PENDING_CHAT_NAV_KEY);
  logRouter('pending-clear');
};

export const markPendingChatNavigationHandled = async payload => {
  const signature = buildPendingChatSignature(payload);
  if (!signature) {
    logRouter('pending-mark-handled-skip-invalid');
    return;
  }
  const value = JSON.stringify({
    signature,
    handledAt: Date.now(),
  });
  await AsyncStorage.setItem(PENDING_CHAT_NAV_LAST_HANDLED_KEY, value);
  logRouter('pending-mark-handled', {
    signature,
    payload: summarizePayload(payload),
  });
  await clearPendingChatNavigation();
};

export const wasPendingChatNavigationHandledRecently = async (
  payload,
  windowMs = NAV_DEDUPE_WINDOW_MS,
) => {
  const signature = buildPendingChatSignature(payload);
  if (!signature) {
    logRouter('pending-was-handled-skip-invalid');
    return false;
  }
  const raw = await AsyncStorage.getItem(PENDING_CHAT_NAV_LAST_HANDLED_KEY);
  if (!raw) {
    logRouter('pending-was-handled-empty', {signature});
    return false;
  }
  try {
    const parsed = JSON.parse(raw);
    const handledAt = Number(parsed?.handledAt || 0);
    const handled =
      normalizeText(parsed?.signature) === signature &&
      handledAt > 0 &&
      Date.now() - handledAt < windowMs;
    logRouter('pending-was-handled-result', {
      handled,
      signature,
      storedSignature: normalizeText(parsed?.signature),
      handledAt,
      ageMs: handledAt > 0 ? Date.now() - handledAt : null,
      windowMs,
    });
    return handled;
  } catch {
    logRouter('pending-was-handled-parse-failed', {signature});
    return false;
  }
};

export const buildLedgerContactFromPendingChat = payload => {
  const normalized = normalizePendingChatNavigationPayload(payload);
  if (!normalized) {
    return null;
  }
  return {
    recordID: normalized.contactRecordId || '',
    userId: normalized.senderId || '',
    displayName: normalizeValidName(normalized.senderName) || 'Contact',
    phoneNumbers: [],
    isAppUser: true,
  };
};

const readLedgerContacts = async () => {
  try {
    const raw = await AsyncStorage.getItem(LEDGER_CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const findMatchingLedgerContact = (contacts, normalized) => {
  const list = Array.isArray(contacts) ? contacts : [];
  const senderId = normalizeText(normalized?.senderId);
  const recordId = normalizeText(normalized?.contactRecordId);
  return (
    list.find(item => normalizeText(item?.recordID) === recordId) ||
    list.find(item => normalizeText(item?.userId || item?.firebaseUid) === senderId) ||
    null
  );
};

const deriveDisplayName = ({normalized, matchedContact, dbName}) => {
  const pendingName = normalizeValidName(normalized?.senderName);
  const savedName = normalizeValidName(matchedContact?.savedName);
  const dbSavedName = normalizeValidName(dbName);
  const fullName = normalizeValidName(
    [matchedContact?.givenName, matchedContact?.familyName].filter(Boolean).join(' '),
  );
  const contactDisplay = normalizeValidName(matchedContact?.displayName);
  return pendingName || savedName || dbSavedName || fullName || contactDisplay || 'Contact';
};

export const resolveLedgerContactFromPendingChat = async payload => {
  const normalized = normalizePendingChatNavigationPayload(payload);
  if (!normalized) {
    return null;
  }

  const contacts = await readLedgerContacts();
  const matchedContact = findMatchingLedgerContact(contacts, normalized);
  const recordID =
    normalizeText(matchedContact?.recordID) ||
    normalizeText(normalized.contactRecordId) ||
    normalizeContactRecordId('', normalized.senderId);

  let dbSavedName = '';
  try {
    if (recordID) {
      ensureLedgerDatabaseReady();
      dbSavedName = normalizeValidName(getContactName(recordID));
    }
  } catch {
    dbSavedName = '';
  }

  const displayName = deriveDisplayName({
    normalized,
    matchedContact,
    dbName: dbSavedName,
  });

  const bootstrappedContact = await resolveInitialContactIdentity({
    contact: matchedContact,
    recordID: recordID || '',
    userId:
      normalizeText(matchedContact?.userId || matchedContact?.firebaseUid) ||
      normalizeText(normalized.senderId),
    senderName: displayName,
    conversationId: normalizeText(normalized.conversationId),
  });

  return {
    ...bootstrappedContact,
    recordID: normalizeText(bootstrappedContact?.recordID || recordID || ''),
    userId:
      normalizeText(bootstrappedContact?.userId || bootstrappedContact?.firebaseUid) ||
      normalizeText(matchedContact?.userId || matchedContact?.firebaseUid) ||
      normalizeText(normalized.senderId),
    displayName:
      normalizeValidName(bootstrappedContact?.displayName) ||
      displayName ||
      'Contact',
    savedName:
      normalizeValidName(bootstrappedContact?.savedName) ||
      dbSavedName ||
      normalizeValidName(matchedContact?.savedName) ||
      null,
    givenName: normalizeText(bootstrappedContact?.givenName || matchedContact?.givenName),
    familyName: normalizeText(
      bootstrappedContact?.familyName || matchedContact?.familyName,
    ),
    phoneNumbers: Array.isArray(bootstrappedContact?.phoneNumbers)
      ? bootstrappedContact.phoneNumbers
      : Array.isArray(matchedContact?.phoneNumbers)
      ? matchedContact.phoneNumbers
      : [],
  };
};

const getContactKey = contact => {
  const recordId = normalizeText(contact?.recordID);
  if (recordId) {
    return `rid:${recordId}`;
  }
  const userId = normalizeText(contact?.userId || contact?.firebaseUid);
  if (userId) {
    return `uid:${userId}`;
  }
  return '';
};

const getRouteContactKey = route => {
  if (!route) {
    return '';
  }
  const contact = route?.params?.contact || {};
  return getContactKey(contact);
};

const getRouteConversationId = route =>
  normalizeText(
    route?.params?.initialConversationId ||
      route?.params?.notificationPayload?.conversationId,
  );

const logRouter = (event, payload = {}) => {
  if (!__DEV__ || !DEBUG_NOTIFICATION_ROUTER) {
    return;
  }
  console.log('[NOTIF_ROUTER]', event, payload);
};

const buildLedgerContactRouteParams = (contact, payload) => ({
  contact,
  openedFromNotification: true,
  notificationPayload: payload,
  initialConversationId: normalizeText(payload?.conversationId),
  openMode: normalizeText(payload?.openMode || 'direct'),
  returnTo: payload?.returnTo || null,
  fallbackRoute:
    payload?.fallbackRoute || {
      name: 'Home',
      params: {initialTabOverride: DEFAULT_TAB_LEDGER},
    },
});

const isSameLedgerContactTarget = (route, contact, payload) => {
  if (normalizeText(route?.name) !== 'LedgerContactDetail') {
    return false;
  }
  const targetContactKey = getContactKey(contact);
  const routeContactKey = getRouteContactKey(route);
  const targetConversationId = normalizeText(payload?.conversationId);
  const routeConversationId = getRouteConversationId(route);

  if (targetConversationId && routeConversationId) {
    return targetConversationId === routeConversationId;
  }
  return Boolean(targetContactKey && targetContactKey === routeContactKey);
};

const readNotificationDefaultTab = async () => {
  const preferred = await readDefaultTabPreference();
  if (preferred === DEFAULT_TAB_LEDGER) {
    return DEFAULT_TAB_LEDGER;
  }
  if (preferred === DEFAULT_TAB_ACCOUNTS) {
    return DEFAULT_TAB_ACCOUNTS;
  }
  return DEFAULT_TAB_DASHBOARD;
};

const navigateToLedgerContact = async (navigationRef, contact, payload) => {
  const targetParams = buildLedgerContactRouteParams(contact, payload);

  const currentRoute = navigationRef.getCurrentRoute?.();
  const currentName = String(currentRoute?.name || '');
  logRouter('navigate-ledger-contact', {
    currentRoute: summarizeRoute(currentRoute),
    targetContactKey: getContactKey(contact),
    payload: summarizePayload(payload),
  });

  if (currentName === 'LedgerContactDetail') {
    navigationRef.dispatch(
      StackActions.replace('LedgerContactDetail', targetParams),
    );
    return;
  }

  navigationRef.navigate('LedgerContactDetail', targetParams);
};

const resetToHomeAndLedgerContact = async (
  navigationRef,
  contact,
  payload,
  {source = 'unknown'} = {},
) => {
  const targetParams = buildLedgerContactRouteParams(contact, payload);
  const defaultTab = await readNotificationDefaultTab();

  logRouter('reset-home-and-ledger-contact', {
    source,
    defaultTab,
    payload: summarizePayload(payload),
    targetKey: getContactKey(contact),
  });

  navigationRef.resetRoot({
    index: 1,
    routes: [
      {name: 'Home', params: {initialTabOverride: defaultTab}},
      {name: 'LedgerContactDetail', params: targetParams},
    ],
  });

  await wait(80);
};

const confirmTargetRoute = async (navigationRef, contact, attempts = 8) => {
  const targetKey = getContactKey(contact);
  for (let i = 0; i < attempts; i += 1) {
    const route = navigationRef.getCurrentRoute?.();
    const routeName = String(route?.name || '');
    const routeKey = getRouteContactKey(route);
    if (
      routeName === 'LedgerContactDetail' &&
      (!targetKey || targetKey === routeKey)
    ) {
      logRouter('confirm-target-route-success', {
        attempt: i + 1,
        targetKey,
        routeName,
        routeKey,
      });
      return true;
    }
    if (i === 0 || i === attempts - 1) {
      logRouter('confirm-target-route-wait', {
        attempt: i + 1,
        targetKey,
        routeName,
        routeKey,
      });
    }
    await wait(70);
  }
  logRouter('confirm-target-route-timeout', {
    targetKey,
    attempts,
    currentRoute: summarizeRoute(navigationRef.getCurrentRoute?.()),
  });
  return false;
};

export const tryOpenPendingChatNavigation = async (
  navigationRef,
  {source = 'unknown', authState = {authenticated: false}} = {},
) => {
  const attemptId = ++notificationOpenAttemptSeq;
  const navReady = Boolean(navigationRef?.isReady?.());
  const currentRouteSnapshot =
    navReady
      ? summarizeRoute(getSafeCurrentRoute(navigationRef))
      : {name: '', hasParams: false, contactRecordId: '', conversationId: ''};
  logRouter('open-attempt-start', {
    attemptId,
    source,
    navReady,
    rootTrail: navReady ? getRootRouteTrail(navigationRef) : [],
    currentRoute: currentRouteSnapshot,
  });
  if (notificationOpenInFlight) {
    logRouter('open-in-flight-skip', {attemptId, source});
    return false;
  }
  if (!navigationRef?.isReady?.() || !navigationRef?.getCurrentRoute) {
    logRouter('open-skip-nav-not-ready', {attemptId, source});
    return false;
  }
  if (!authState?.authenticated) {
    logRouter('open-skip-not-authenticated', {attemptId, source});
    return false;
  }

  notificationOpenInFlight = true;
  try {
    const route = getSafeCurrentRoute(navigationRef);
    const currentRouteName = String(route?.name || '');

    const pending = await readPendingChatNavigation();
    if (!pending) {
      logRouter('open-skip-no-pending', {attemptId, source});
      return false;
    }

    const alreadyHandled = await wasPendingChatNavigationHandledRecently(pending);
    if (alreadyHandled) {
      await clearPendingChatNavigation();
      logRouter('deduped-recently-handled', {
        attemptId,
        source,
        payload: summarizePayload(pending),
      });
      return false;
    }

    const contact = await resolveLedgerContactFromPendingChat(pending);
    if (!contact) {
      logRouter('contact-resolve-failed', {
        attemptId,
        source,
        payload: summarizePayload(pending),
      });
      return false;
    }

    const openIntent = resolveConversationOpenIntent({
      conversationId: pending?.conversationId,
      contactRecordId: pending?.contactRecordId,
      currentRoute: route,
      defaultFallbackRoute: {
        name: 'Home',
        params: {initialTabOverride: DEFAULT_TAB_LEDGER},
      },
    });
    if (!openIntent.shouldNavigate) {
      await markPendingChatNavigationHandled(pending);
      logRouter('navigate-skip-same-active-chat', {
        attemptId,
        source,
        payload: summarizePayload(pending),
      });
      return false;
    }

    const sameCurrentRoute = isSameLedgerContactTarget(route, contact, pending);
    const resolvedPending = {
      ...pending,
      openMode: openIntent.openMode,
      returnTo: openIntent.returnTo,
      fallbackRoute: openIntent.fallbackRoute,
    };
    const shouldResetStackForNotification =
      openIntent.openMode === 'direct' &&
      !sameCurrentRoute;

    logRouter('navigate-attempt', {
      attemptId,
      source,
      fromRoute: currentRouteName,
      targetKey: getContactKey(contact),
      resetStack: shouldResetStackForNotification,
      sameCurrentRoute,
      payload: summarizePayload(resolvedPending),
    });
    if (shouldResetStackForNotification) {
      await resetToHomeAndLedgerContact(navigationRef, contact, resolvedPending, {source});
    } else {
      await navigateToLedgerContact(navigationRef, contact, resolvedPending);
    }
    const confirmed = await confirmTargetRoute(navigationRef, contact);
    if (!confirmed) {
      logRouter('route-confirm-failed', {
        attemptId,
        source,
        targetKey: getContactKey(contact),
      });
      return false;
    }

    await markPendingChatNavigationHandled(resolvedPending);
      logRouter('route-confirmed', {
        attemptId,
        source,
        targetKey: getContactKey(contact),
        rootTrail: getRootRouteTrail(navigationRef),
        currentRoute: summarizeRoute(getSafeCurrentRoute(navigationRef)),
      });
      return true;
  } finally {
    notificationOpenInFlight = false;
    logRouter('open-attempt-end', {
      attemptId,
      source,
      rootTrail: getRootRouteTrail(navigationRef),
      currentRoute: summarizeRoute(getSafeCurrentRoute(navigationRef)),
    });
  }
};

export const consumePendingChatNavigation = async (
  navigationRef,
  {launchSource = 'unknown', authState = {authenticated: false}} = {},
) =>
  tryOpenPendingChatNavigation(navigationRef, {
    source: `chat-v3:${launchSource}`,
    authState,
  });
