import {selectLedgerListState} from './ledgerDomainStore.js';

const normalizeId = value => String(value || '').trim();

const sortIds = list =>
  (Array.isArray(list) ? list : [])
    .map(normalizeId)
    .filter(Boolean)
    .sort();

const sameIdSet = (left, right) => {
  const a = sortIds(left);
  const b = sortIds(right);
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

export const logLedgerListParity = ({
  source = 'unknown',
  contacts = [],
  expectedCount = null,
} = {}) => {
  if (!__DEV__) {
    return {ok: true, skipped: true};
  }

  const domain = selectLedgerListState();
  const oldIds = (Array.isArray(contacts) ? contacts : []).map(item => item?.recordID);
  const domainIds = (domain.contacts || []).map(item => item?.recordId);
  const oldCount = Number.isFinite(expectedCount)
    ? Number(expectedCount)
    : (Array.isArray(contacts) ? contacts.length : 0);
  const domainCount = Number(domain.total || 0);

  const idsMatch = sameIdSet(oldIds, domainIds);
  const countMatch = oldCount === domainCount;
  const ok = idsMatch && countMatch;

  if (!ok) {
    console.warn('[LEDGER_DOMAIN][PARITY] list mismatch', {
      source,
      oldCount,
      domainCount,
      oldIds: sortIds(oldIds),
      domainIds: sortIds(domainIds),
    });
  }

  return {
    ok,
    source,
    oldCount,
    domainCount,
    idsMatch,
    countMatch,
  };
};

export const logLedgerTimelineParity = ({
  source = 'unknown',
  recordId = '',
  timeline = [],
} = {}) => {
  if (!__DEV__) {
    return {ok: true, skipped: true};
  }

  const domain = selectLedgerListState();
  const existsInDomain = (domain.contacts || []).some(item => item.recordId === String(recordId || '').trim());
  if (!existsInDomain) {
    console.warn('[LEDGER_DOMAIN][PARITY] timeline missing contact in domain', {
      source,
      recordId,
      timelineCount: Array.isArray(timeline) ? timeline.length : 0,
    });
    return {ok: false, source};
  }

  return {
    ok: true,
    source,
    timelineCount: Array.isArray(timeline) ? timeline.length : 0,
  };
};

export default {
  logLedgerListParity,
  logLedgerTimelineParity,
};
