export const LEDGER_DOMAIN_VERSION = 'phase1.v1';

export const LEDGER_ENTITY_KINDS = Object.freeze({
  CONTACT: 'contact',
  LEDGER_ENTRY: 'ledger_entry',
  MESSAGE: 'message',
});

export const LEDGER_ACTION_TYPES = Object.freeze({
  HYDRATE_SNAPSHOT: 'HYDRATE_SNAPSHOT',
  UPSERT_CONTACT: 'UPSERT_CONTACT',
  REMOVE_CONTACT: 'REMOVE_CONTACT',
  RECORD_CHAT_ACTIVITY: 'RECORD_CHAT_ACTIVITY',
  UPSERT_TIMELINE: 'UPSERT_TIMELINE',
  HYDRATE_CONTACT_BASE: 'HYDRATE_CONTACT_BASE',
  LEDGER_ENTRY_CREATED: 'LEDGER_ENTRY_CREATED',
  SET_SYNC_PREFERENCE: 'SET_SYNC_PREFERENCE',
  MARK_QUEUE_EVENT: 'MARK_QUEUE_EVENT',
  CLEAR_QUEUE_EVENTS_FOR_CONTACT: 'CLEAR_QUEUE_EVENTS_FOR_CONTACT',
});

export const LEDGER_STATE_SHAPE = Object.freeze({
  version: 'number',
  contactsByRecordId: 'Record<string, LedgerContact>',
  orderedContactRecordIds: 'string[]',
  identityByRecordId: 'Record<string, LedgerIdentity>',
  timelineByRecordId: 'Record<string, LedgerTimelineState>',
  baseByRecordId: 'Record<string, LedgerContactBaseState>',
  syncByRecordId: 'Record<string, LedgerSyncPreference>',
  queueMeta: 'LedgerQueueMeta',
  meta: 'LedgerDomainMeta',
});

export const LEDGER_SELECTOR_OUTPUTS = Object.freeze({
  ledgerListItem: [
    'recordId',
    'displayName',
    'photoUrl',
    'unreadCount',
    'lastActivity',
    'balance',
    'isPinned',
    'isAppUser',
    'appInstallState',
  ],
  contactTimeline: [
    'recordId',
    'conversationId',
    'items',
    'hasLoaded',
    'updatedAt',
  ],
});

export const LEDGER_REQUIRED_CONTACT_FIELDS = Object.freeze([
  'recordID',
  'displayName',
  'isAppUser',
  'appInstallState',
  'userId',
]);

export const LEDGER_REQUIRED_IDENTITY_FIELDS = Object.freeze([
  'recordId',
  'userId',
  'firebaseUid',
  'appInstallState',
]);

export const LEDGER_CACHE_POLICY = Object.freeze({
  timelineTtlMs: 20000,
  timelineMaxItems: 80,
  timelineMaxEntries: 8,
  identityMaxEntries: 15,
  baseMaxEntries: 15,
});

export const createEmptyLedgerDomainState = () => ({
  version: 0,
  contactsByRecordId: {},
  orderedContactRecordIds: [],
  identityByRecordId: {},
  timelineByRecordId: {},
  baseByRecordId: {},
  syncByRecordId: {},
  queueMeta: {
    pendingCount: 0,
    lastDrainAt: 0,
    lastError: '',
  },
  meta: {
    domainVersion: LEDGER_DOMAIN_VERSION,
    hydratedAt: 0,
    updatedAt: 0,
    source: 'phase1-contract',
  },
});

export default {
  LEDGER_ACTION_TYPES,
  LEDGER_CACHE_POLICY,
  LEDGER_DOMAIN_VERSION,
  LEDGER_ENTITY_KINDS,
  LEDGER_REQUIRED_CONTACT_FIELDS,
  LEDGER_REQUIRED_IDENTITY_FIELDS,
  LEDGER_SELECTOR_OUTPUTS,
  LEDGER_STATE_SHAPE,
  createEmptyLedgerDomainState,
};
