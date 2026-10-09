import AsyncStorage from '@react-native-async-storage/async-storage';
import {fetchUsersByPhones} from './api';
import {remapLedgerContactRecordIds} from './ledgerDatabase';

const LEDGER_CONTACTS_KEY = 'ledgerContacts';
const APP_USERS_CACHE_KEY = 'ledgerAppUsersCache';
const REPAIR_DONE_KEY = 'restore.repair.v1.doneAt';
const LEDGER_CANONICAL_MIGRATION_DONE_KEY = 'ledger.contactCanonicalMigration.v1.doneAt';
const PINNED_CONTACT_IDS_STORAGE_KEY = 'pinnedLedgerContactIds';
const LEDGER_SYNC_ALL_ENTRIES_PREFIX = 'ledgerSyncAllEntries:';
const LEDGER_SYNC_QUEUE_KEY = 'ledgerSyncQueue:v1';

const CHAT_CACHE_PREFIX = 'ledgerChatCache:';
const CONTACT_MATCH_PREFIX = 'contact_matches_';
const PENDING_CHAT_NAV_KEY = 'pendingChatNavigation';

const getCanonicalUserId = contact => {
  const explicit = String(contact?.userId || contact?.firebaseUid || '').trim();
  if (explicit) {
    return explicit;
  }
  const recordId = String(contact?.recordID || '').trim();
  if (recordId.startsWith('app_')) {
    return recordId.slice(4).trim();
  }
  return '';
};

const normalizeContactForCanonicalId = contact => {
  const userId = getCanonicalUserId(contact);
  const currentRecordId = String(contact?.recordID || '').trim();
  const canonicalRecordId = userId ? `app_${userId}` : currentRecordId;
  return {
    ...contact,
    recordID: canonicalRecordId,
    userId: userId || String(contact?.userId || '').trim(),
    isAppUser:
      userId ||
      contact?.isAppUser === true ||
      Number(contact?.isAppUser) === 1 ||
      canonicalRecordId.startsWith('app_')
        ? 1
        : 0,
  };
};

const mergePhoneNumbers = (left = [], right = []) => {
  const output = [];
  const seen = new Set();
  [...left, ...right].forEach(item => {
    const raw = String(item?.number || '').trim();
    if (!raw) {
      return;
    }
    const normalized = normalizePhoneForLookup(raw) || raw;
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    output.push({number: raw});
  });
  return output;
};

const choosePreferredValue = (first, second) => {
  const firstText = String(first || '').trim();
  if (firstText) {
    return first;
  }
  const secondText = String(second || '').trim();
  return secondText ? second : first;
};

const dedupeContactsToCanonicalIds = contacts => {
  const remap = new Map();
  const canonicalByRecordId = new Map();
  let updated = 0;
  let deduped = 0;

  (Array.isArray(contacts) ? contacts : []).forEach(item => {
    const originalRecordId = String(item?.recordID || '').trim();
    const normalized = normalizeContactForCanonicalId(item);
    const canonicalRecordId = String(normalized?.recordID || '').trim();
    if (!canonicalRecordId) {
      return;
    }

    if (originalRecordId && originalRecordId !== canonicalRecordId) {
      remap.set(originalRecordId, canonicalRecordId);
      updated += 1;
    }

    if (!canonicalByRecordId.has(canonicalRecordId)) {
      canonicalByRecordId.set(canonicalRecordId, normalized);
      return;
    }

    const existing = canonicalByRecordId.get(canonicalRecordId);
    const merged = {
      ...existing,
      ...normalized,
      recordID: canonicalRecordId,
      displayName: choosePreferredValue(existing?.displayName, normalized?.displayName),
      givenName: choosePreferredValue(existing?.givenName, normalized?.givenName),
      familyName: choosePreferredValue(existing?.familyName, normalized?.familyName),
      username: choosePreferredValue(existing?.username, normalized?.username),
      userId: choosePreferredValue(existing?.userId, normalized?.userId),
      isAppUser:
        existing?.isAppUser === true ||
        Number(existing?.isAppUser) === 1 ||
        normalized?.isAppUser === true ||
        Number(normalized?.isAppUser) === 1
          ? 1
          : 0,
      phoneNumbers: mergePhoneNumbers(existing?.phoneNumbers, normalized?.phoneNumbers),
      addedAt: Math.max(0, Number(existing?.addedAt) || 0, Number(normalized?.addedAt) || 0),
      lastChatActivityAt: Math.max(
        0,
        Number(existing?.lastChatActivityAt) || 0,
        Number(normalized?.lastChatActivityAt) || 0,
      ),
    };
    canonicalByRecordId.set(canonicalRecordId, merged);
    deduped += 1;
  });

  return {
    contacts: Array.from(canonicalByRecordId.values()),
    remapPairs: Array.from(remap.entries()),
    updated,
    deduped,
  };
};

const remapPinnedContactIds = async remapMap => {
  const raw = await AsyncStorage.getItem(PINNED_CONTACT_IDS_STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) {
    return 0;
  }

  const seen = new Set();
  const next = [];
  parsed.forEach(item => {
    const current = String(item || '').trim();
    if (!current) {
      return;
    }
    const mapped = remapMap.get(current) || current;
    if (!mapped || seen.has(mapped)) {
      return;
    }
    seen.add(mapped);
    next.push(mapped);
  });

  if (JSON.stringify(next) !== JSON.stringify(parsed)) {
    await AsyncStorage.setItem(PINNED_CONTACT_IDS_STORAGE_KEY, JSON.stringify(next));
    return 1;
  }
  return 0;
};

const remapPrefixedKeys = async (prefix, remapMap) => {
  const updates = [];
  const keysToRemove = [];
  const allKeys = await AsyncStorage.getAllKeys();
  const prefixedKeys = allKeys.filter(key => String(key).startsWith(prefix));
  if (!prefixedKeys.length) {
    return 0;
  }

  const pairs = await AsyncStorage.multiGet(prefixedKeys);
  const valueByKey = new Map(pairs);

  remapMap.forEach((toId, fromId) => {
    if (!fromId || !toId || fromId === toId) {
      return;
    }
    const fromKey = `${prefix}${fromId}`;
    const toKey = `${prefix}${toId}`;
    const fromValue = valueByKey.get(fromKey);
    if (typeof fromValue === 'undefined' || fromValue === null) {
      return;
    }
    const toValue = valueByKey.get(toKey);
    if (typeof toValue === 'undefined' || toValue === null) {
      updates.push([toKey, fromValue]);
    }
    keysToRemove.push(fromKey);
  });

  if (updates.length) {
    await AsyncStorage.multiSet(updates);
  }
  if (keysToRemove.length) {
    await AsyncStorage.multiRemove(Array.from(new Set(keysToRemove)));
  }
  return updates.length + keysToRemove.length;
};

const remapLedgerSyncQueue = async remapMap => {
  const raw = await AsyncStorage.getItem(LEDGER_SYNC_QUEUE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed) || !parsed.length) {
    return 0;
  }

  let changed = false;
  const next = parsed.map(item => {
    const current = String(item?.contactRecordId || '').trim();
    if (!current) {
      return item;
    }
    const mapped = remapMap.get(current);
    if (!mapped || mapped === current) {
      return item;
    }
    changed = true;
    return {
      ...item,
      contactRecordId: mapped,
    };
  });

  if (changed) {
    await AsyncStorage.setItem(LEDGER_SYNC_QUEUE_KEY, JSON.stringify(next));
    return 1;
  }
  return 0;
};

const normalizePhoneForLookup = value => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 10) return digits.slice(-10);
  if (digits.length < 8) return '';
  return digits;
};

const extractContactPhones = contact => {
  const numbers = Array.isArray(contact?.phoneNumbers) ? contact.phoneNumbers : [];
  const out = new Set();
  numbers.forEach(item => {
    const raw = String(item?.number || '').trim();
    if (!raw) return;
    const normalized = normalizePhoneForLookup(raw);
    if (normalized) out.add(normalized);
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+') && digits) {
      out.add(`+${digits}`);
    } else if (digits.length > 10) {
      out.add(`+${digits}`);
    }
  });
  return Array.from(out);
};

const buildUsersByPhoneMap = users => {
  const map = new Map();
  (Array.isArray(users) ? users : []).forEach(user => {
    const rawMobile = String(user?.mobile || '').trim();
    const normalizedMobile = String(user?.normalizedMobile || '').trim();
    if (normalizedMobile) {
      map.set(normalizedMobile, user);
    }
    if (rawMobile) {
      const normalized = normalizePhoneForLookup(rawMobile);
      if (normalized) {
        map.set(normalized, user);
      }
      const digits = rawMobile.replace(/\D/g, '');
      if (digits && rawMobile.startsWith('+')) {
        map.set(`+${digits}`, user);
      } else if (digits.length > 10) {
        map.set(`+${digits}`, user);
      }
    }
  });
  return map;
};

const clearDerivedCaches = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter(
    key =>
      key === APP_USERS_CACHE_KEY ||
      key === PENDING_CHAT_NAV_KEY ||
      String(key).startsWith(CHAT_CACHE_PREFIX) ||
      String(key).startsWith(CONTACT_MATCH_PREFIX),
  );
  if (toRemove.length) {
    await AsyncStorage.multiRemove(toRemove);
  }
  return toRemove.length;
};

const repairLedgerContacts = async () => {
  const raw = await AsyncStorage.getItem(LEDGER_CONTACTS_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  const contacts = Array.isArray(parsed) ? parsed : [];
  if (!contacts.length) {
    return {updated: 0, deduped: 0};
  }

  const allPhones = Array.from(
    new Set(contacts.flatMap(contact => extractContactPhones(contact)).filter(Boolean)),
  );
  const response = allPhones.length ? await fetchUsersByPhones(allPhones) : {users: []};
  const usersByPhone = buildUsersByPhoneMap(response?.users || []);

  const next = [];
  const seenRecordIds = new Set();
  const seenUserIds = new Set();
  let updated = 0;
  let deduped = 0;

  contacts.forEach(contact => {
    const phones = extractContactPhones(contact);
    const matchedPhone = phones.find(phone => usersByPhone.has(phone));
    const matchedUser = matchedPhone ? usersByPhone.get(matchedPhone) : null;
    const matchedUserId = String(matchedUser?.firebaseUid || matchedUser?.userId || '').trim();

    const normalized = {
      ...contact,
    };

    if (matchedUserId) {
      normalized.recordID = `app_${matchedUserId}`;
      normalized.isAppUser = 1;
      normalized.userId = matchedUserId;
      normalized.username = String(matchedUser?.username || normalized.username || '').trim();
      normalized.numberChanged = matchedUser?.status === 'number_changed';
      normalized.currentPhone = String(matchedUser?.currentPhone || matchedUser?.mobile || '');
      normalized.oldPhone = String(matchedUser?.oldPhone || '');
      updated += 1;
    }

    const dedupeKey = matchedUserId
      ? `uid:${matchedUserId}`
      : `rid:${String(normalized.recordID || '')}`;

    if (matchedUserId && seenUserIds.has(matchedUserId)) {
      deduped += 1;
      return;
    }
    if (!matchedUserId && seenRecordIds.has(String(normalized.recordID || ''))) {
      deduped += 1;
      return;
    }

    if (matchedUserId) {
      seenUserIds.add(matchedUserId);
    } else {
      seenRecordIds.add(String(normalized.recordID || ''));
    }

    if (dedupeKey) {
      next.push(normalized);
    }
  });

  await AsyncStorage.setItem(LEDGER_CONTACTS_KEY, JSON.stringify(next));
  return {updated, deduped};
};

export const runPostRestoreRepair = async () => {
  try {
    const removedCacheKeys = await clearDerivedCaches();
    const repairedContacts = await repairLedgerContacts();
    await AsyncStorage.setItem(REPAIR_DONE_KEY, String(Date.now()));
    return {
      success: true,
      removedCacheKeys,
      repairedContacts,
    };
  } catch (error) {
    console.error('[RESTORE_REPAIR] Failed:', error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
};

export const runLedgerContactCanonicalMigration = async () => {
  try {
    const doneAt = await AsyncStorage.getItem(LEDGER_CANONICAL_MIGRATION_DONE_KEY);
    if (doneAt) {
      return {
        success: true,
        skipped: true,
      };
    }

    const raw = await AsyncStorage.getItem(LEDGER_CONTACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const contacts = Array.isArray(parsed) ? parsed : [];
    if (!contacts.length) {
      await AsyncStorage.setItem(LEDGER_CANONICAL_MIGRATION_DONE_KEY, String(Date.now()));
      return {
        success: true,
        skipped: false,
        contactsUpdated: 0,
        deduped: 0,
        remappedKeys: 0,
      };
    }

    const result = dedupeContactsToCanonicalIds(contacts);
    const nextContacts = result.contacts;
    const remapPairs = result.remapPairs;
    const remapMap = new Map(remapPairs);

    if (result.updated > 0 || result.deduped > 0) {
      await AsyncStorage.setItem(LEDGER_CONTACTS_KEY, JSON.stringify(nextContacts));
    }

    let dbStats = {
      success: true,
      updatedTransactions: 0,
      updatedContactNames: 0,
      mergedContactNames: 0,
    };
    let remappedKeys = 0;
    if (remapPairs.length) {
      dbStats = remapLedgerContactRecordIds(remapPairs);
      remappedKeys += await remapPinnedContactIds(remapMap);
      remappedKeys += await remapPrefixedKeys(CHAT_CACHE_PREFIX, remapMap);
      remappedKeys += await remapPrefixedKeys(LEDGER_SYNC_ALL_ENTRIES_PREFIX, remapMap);
      remappedKeys += await remapLedgerSyncQueue(remapMap);
    }

    await AsyncStorage.setItem(LEDGER_CANONICAL_MIGRATION_DONE_KEY, String(Date.now()));
    return {
      success: true,
      skipped: false,
      contactsUpdated: result.updated,
      deduped: result.deduped,
      remapPairs: remapPairs.length,
      remappedKeys,
      db: dbStats,
    };
  } catch (error) {
    console.error('[LEDGER_CONTACT_MIGRATION] Failed:', error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
};

export default {
  runPostRestoreRepair,
  runLedgerContactCanonicalMigration,
};
