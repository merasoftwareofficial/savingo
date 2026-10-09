// Phase-1 adapter contract only.
// These are intentionally thin stubs so runtime behavior stays unchanged.

export const ledgerDomainAdapters = Object.freeze({
  contacts: {
    readSnapshot: async () => ({contacts: []}),
    upsert: async () => ({ok: false, reason: 'not-wired-phase1'}),
  },
  timeline: {
    readByRecordId: async () => ({items: [], hasLoaded: false}),
    writeByRecordId: async () => ({ok: false, reason: 'not-wired-phase1'}),
  },
  sync: {
    readPreference: async () => ({enabled: true}),
    writePreference: async () => ({ok: false, reason: 'not-wired-phase1'}),
    markQueueEvent: async () => ({ok: false, reason: 'not-wired-phase1'}),
  },
  messaging: {
    emitChatActivity: async () => ({ok: false, reason: 'not-wired-phase1'}),
  },
});

export const getLedgerDomainAdapters = () => ledgerDomainAdapters;

export default {
  getLedgerDomainAdapters,
  ledgerDomainAdapters,
};
