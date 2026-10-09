import {DeviceEventEmitter} from 'react-native';
import {LEDGER_ACTION_TYPES} from './ledgerDomainContract.js';
import {dispatchLedgerDomainAction} from './ledgerDomainStore.js';

let bridgeUnsubscribers = [];
let bridgeStarted = false;

const normalizeContactEvent = payload => {
  const contact = payload && typeof payload === 'object' ? payload : {};
  return {
    type: LEDGER_ACTION_TYPES.UPSERT_CONTACT,
    payload: {
      contact,
      identity: {
        recordId: contact.recordID,
        userId: contact.userId || contact.firebaseUid,
        firebaseUid: contact.firebaseUid || contact.userId,
        appInstallState: contact.appInstallState,
        displayName: contact.displayName || contact.savedName,
      },
    },
  };
};

export const hydrateLedgerDomainContactsShadow = ({contacts = [], source = 'hydrate'} = {}) => {
  const list = Array.isArray(contacts) ? contacts : [];
  list.forEach(contact => {
    dispatchLedgerDomainAction({
      ...normalizeContactEvent(contact),
      payload: {
        ...normalizeContactEvent(contact).payload,
        source,
      },
    });
  });
  return {ok: true, count: list.length};
};

export const upsertLedgerDomainContactShadow = (contact, source = 'upsert') => {
  dispatchLedgerDomainAction({
    ...normalizeContactEvent(contact),
    payload: {
      ...normalizeContactEvent(contact).payload,
      source,
    },
  });
  return {ok: true};
};

export const recordLedgerDomainChatActivityShadow = payload => {
  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.RECORD_CHAT_ACTIVITY,
    payload: {
      contactRecordId: payload?.contactRecordId,
      recordID: payload?.contactRecordId,
      userId: payload?.userId,
      timestamp: payload?.timestamp,
    },
  });
  return {ok: true};
};

export const upsertLedgerDomainTimelineShadow = ({
  contactRecordId,
  conversationId = null,
  items = [],
  hasLoaded = true,
  source = 'timeline-upsert',
} = {}) => {
  dispatchLedgerDomainAction({
    type: LEDGER_ACTION_TYPES.UPSERT_TIMELINE,
    payload: {
      source,
      timeline: {
        recordId: contactRecordId,
        conversationId,
        hasLoaded,
        updatedAt: Date.now(),
        items: Array.isArray(items) ? items : [],
      },
    },
  });
  return {ok: true};
};

export const startLedgerDomainShadowEventBridge = () => {
  if (bridgeStarted) {
    return () => {};
  }

  const addContactSub = DeviceEventEmitter.addListener('ledger:addContact', payload => {
    upsertLedgerDomainContactShadow(payload, 'event:ledger:addContact');
  });

  const chatActivitySub = DeviceEventEmitter.addListener('ledger:chatActivity', payload => {
    recordLedgerDomainChatActivityShadow(payload || {});
  });

  bridgeUnsubscribers = [
    () => addContactSub.remove(),
    () => chatActivitySub.remove(),
  ];
  bridgeStarted = true;

  return () => {
    bridgeUnsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch {
        // no-op
      }
    });
    bridgeUnsubscribers = [];
    bridgeStarted = false;
  };
};

export default {
  hydrateLedgerDomainContactsShadow,
  recordLedgerDomainChatActivityShadow,
  startLedgerDomainShadowEventBridge,
  upsertLedgerDomainContactShadow,
  upsertLedgerDomainTimelineShadow,
};
