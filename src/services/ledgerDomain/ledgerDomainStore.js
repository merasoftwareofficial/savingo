import {
  createEmptyLedgerDomainState,
  LEDGER_ACTION_TYPES,
} from './ledgerDomainContract';
import {
  normalizeLedgerContact,
  normalizeLedgerBaseState,
  normalizeLedgerIdentity,
  normalizeRecordId,
  normalizeTimelineState,
} from './ledgerDomainNormalizer';

let state = createEmptyLedgerDomainState();
const listeners = new Set();

const emit = () => {
  listeners.forEach(listener => {
    try {
      listener(state);
    } catch (error) {
      console.error('[LEDGER_DOMAIN] listener failed:', error);
    }
  });
};

const bumpMeta = source => {
  state = {
    ...state,
    version: Number(state.version || 0) + 1,
    meta: {
      ...state.meta,
      source: String(source || 'ledger-domain-store'),
      updatedAt: Date.now(),
    },
  };
};

export const getLedgerDomainState = () => state;

export const subscribeLedgerDomainState = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const hydrateLedgerDomainSnapshot = snapshot => {
  const next = snapshot && typeof snapshot === 'object' ? snapshot : {};
  state = {
    ...createEmptyLedgerDomainState(),
    ...next,
    meta: {
      ...createEmptyLedgerDomainState().meta,
      ...(next.meta || {}),
      hydratedAt: Date.now(),
      updatedAt: Date.now(),
      source: 'hydrate-snapshot',
    },
  };
  emit();
  return state;
};

export const dispatchLedgerDomainAction = action => {
  const type = String(action?.type || '').trim();
  const payload = action?.payload || {};

  if (!type) {
    return state;
  }

  switch (type) {
    case LEDGER_ACTION_TYPES.HYDRATE_SNAPSHOT: {
      return hydrateLedgerDomainSnapshot(payload.snapshot || {});
    }

    case LEDGER_ACTION_TYPES.UPSERT_CONTACT: {
      const normalizedContact = normalizeLedgerContact(payload.contact || {});
      const recordId = normalizeRecordId(normalizedContact);
      if (!recordId) {
        return state;
      }
      const normalizedIdentity = normalizeLedgerIdentity({
        ...(state.identityByRecordId[recordId] || {}),
        ...(payload.identity || {}),
        ...normalizedContact,
      });

      const nextOrdered = state.orderedContactRecordIds.includes(recordId)
        ? state.orderedContactRecordIds
        : [...state.orderedContactRecordIds, recordId];

      state = {
        ...state,
        contactsByRecordId: {
          ...state.contactsByRecordId,
          [recordId]: normalizedContact,
        },
        identityByRecordId: {
          ...state.identityByRecordId,
          [recordId]: normalizedIdentity,
        },
        orderedContactRecordIds: nextOrdered,
      };
      bumpMeta('upsert-contact');
      emit();
      return state;
    }

    case LEDGER_ACTION_TYPES.UPSERT_TIMELINE: {
      const normalized = normalizeTimelineState(payload.timeline || {});
      if (!normalized.recordId) {
        return state;
      }
      state = {
        ...state,
        timelineByRecordId: {
          ...state.timelineByRecordId,
          [normalized.recordId]: normalized,
        },
      };
      bumpMeta('upsert-timeline');
      emit();
      return state;
    }

    case LEDGER_ACTION_TYPES.HYDRATE_CONTACT_BASE: {
      const normalized = normalizeLedgerBaseState(payload.base || {});
      if (!normalized.recordId) {
        return state;
      }
      state = {
        ...state,
        baseByRecordId: {
          ...state.baseByRecordId,
          [normalized.recordId]: normalized,
        },
      };
      bumpMeta('hydrate-contact-base');
      emit();
      return state;
    }

    case LEDGER_ACTION_TYPES.LEDGER_ENTRY_CREATED: {
      const recordId = normalizeRecordId(payload);
      if (!recordId) {
        return state;
      }
      const transaction =
        payload.transaction && typeof payload.transaction === 'object'
          ? payload.transaction
          : null;
      const timeline = state.timelineByRecordId[recordId] || {
        recordId,
        conversationId: null,
        hasLoaded: false,
        updatedAt: 0,
        items: [],
      };
      const nextItems = Array.isArray(timeline.items) ? [...timeline.items] : [];
      if (transaction) {
        const transactionItem = normalizeTimelineState({
          recordId,
          items: [
            {
              id: `txn-${transaction.id}`,
              type: 'transaction',
              timestamp: Number(transaction.transaction_date) || Date.now(),
              data: transaction,
            },
          ],
        }).items[0];
        const deduped = nextItems.filter(item => String(item?.id || '') !== transactionItem.id);
        deduped.unshift(transactionItem);
        deduped.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));
        timeline.items = deduped;
      }
      const existingBase = state.baseByRecordId[recordId] || {
        recordId,
        updatedAt: 0,
        transactions: [],
        balance: {
          netBalance: 0,
          totalPaid: 0,
          totalGet: 0,
          transactionCount: 0,
        },
      };
      const nextTransactions = transaction
        ? [transaction, ...(Array.isArray(existingBase.transactions) ? existingBase.transactions : [])]
            .filter(item => item && typeof item === 'object')
        : existingBase.transactions;
      state = {
        ...state,
        timelineByRecordId: {
          ...state.timelineByRecordId,
          [recordId]: {
            ...timeline,
            recordId,
            updatedAt: Date.now(),
          },
        },
        baseByRecordId: {
          ...state.baseByRecordId,
          [recordId]: {
            ...existingBase,
            recordId,
            updatedAt: Date.now(),
            transactions: nextTransactions,
            balance:
              payload.balance && typeof payload.balance === 'object'
                ? {
                    netBalance: Number(payload.balance.netBalance) || 0,
                    totalPaid: Number(payload.balance.totalPaid) || 0,
                    totalGet: Number(payload.balance.totalGet) || 0,
                    transactionCount: Number(payload.balance.transactionCount) || 0,
                  }
                : existingBase.balance,
          },
        },
      };
      bumpMeta('ledger-entry-created');
      emit();
      return state;
    }

    case LEDGER_ACTION_TYPES.RECORD_CHAT_ACTIVITY: {
      const recordId = normalizeRecordId(payload);
      if (!recordId) {
        return state;
      }
      const existingContact = state.contactsByRecordId[recordId] || null;
      const timestamp = Math.max(0, Number(payload.timestamp) || Date.now());
      if (!existingContact) {
        return state;
      }
      state = {
        ...state,
        contactsByRecordId: {
          ...state.contactsByRecordId,
          [recordId]: {
            ...existingContact,
            lastChatActivityAt: timestamp,
          },
        },
      };
      bumpMeta('record-chat-activity');
      emit();
      return state;
    }

    case LEDGER_ACTION_TYPES.SET_SYNC_PREFERENCE: {
      const recordId = normalizeRecordId(payload);
      if (!recordId) {
        return state;
      }
      state = {
        ...state,
        syncByRecordId: {
          ...state.syncByRecordId,
          [recordId]: {
            recordId,
            enabled: payload.enabled !== false,
            updatedAt: Date.now(),
          },
        },
      };
      bumpMeta('set-sync-preference');
      emit();
      return state;
    }

    default:
      return state;
  }
};

export const selectLedgerListState = () => {
  const list = state.orderedContactRecordIds
    .map(recordId => {
      const contact = state.contactsByRecordId[recordId] || null;
      const identity = state.identityByRecordId[recordId] || null;
      const timeline = state.timelineByRecordId[recordId] || null;
      if (!contact) {
        return null;
      }
      return {
        recordId,
        contact,
        identity,
        lastActivityAt: Number(contact.lastChatActivityAt || timeline?.updatedAt || 0),
      };
    })
    .filter(Boolean);

  return {
    version: state.version,
    contacts: list,
    total: list.length,
    updatedAt: Number(state.meta?.updatedAt || 0),
  };
};

export const selectLedgerContactTimeline = recordId => {
  const id = normalizeRecordId({recordId});
  const timeline = state.timelineByRecordId[id] || null;
  return timeline || {
    recordId: id,
    conversationId: null,
    items: [],
    hasLoaded: false,
    updatedAt: 0,
  };
};

export const selectLedgerContactBase = recordId => {
  const id = normalizeRecordId({recordId});
  const base = state.baseByRecordId[id] || null;
  return (
    base || {
      recordId: id,
      updatedAt: 0,
      transactions: [],
      balance: {
        netBalance: 0,
        totalPaid: 0,
        totalGet: 0,
        transactionCount: 0,
      },
    }
  );
};

export const resetLedgerDomainStore = () => {
  state = createEmptyLedgerDomainState();
  emit();
  return state;
};

export default {
  dispatchLedgerDomainAction,
  getLedgerDomainState,
  hydrateLedgerDomainSnapshot,
  resetLedgerDomainStore,
  selectLedgerContactBase,
  selectLedgerContactTimeline,
  selectLedgerListState,
  subscribeLedgerDomainState,
};
