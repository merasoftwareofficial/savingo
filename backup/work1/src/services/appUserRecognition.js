const INSTALLED_STATE = 'installed';
const UNINSTALLED_STATE = 'uninstalled';

export const normalizeInstallState = value => {
  const state = String(value || INSTALLED_STATE).trim().toLowerCase();
  return state === UNINSTALLED_STATE ? UNINSTALLED_STATE : INSTALLED_STATE;
};

export const isInstalledAppUser = user =>
  normalizeInstallState(user?.appInstallState) !== UNINSTALLED_STATE;

export const normalizePhoneForLookup = value => {
  if (!value) {
    return '';
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  if (digits.length < 8) {
    return '';
  }
  return digits;
};

export const buildUsersByPhoneMap = users => {
  const byPhone = new Map();
  (Array.isArray(users) ? users : []).forEach(user => {
    const rawMobile = String(user?.mobile || '').trim();
    const normalizedMobile = String(user?.normalizedMobile || '').trim();
    if (!rawMobile) {
      if (normalizedMobile) {
        byPhone.set(normalizedMobile, user);
      }
      return;
    }

    const normalized = normalizePhoneForLookup(rawMobile);
    if (normalized) {
      byPhone.set(normalized, user);
    }

    const digits = rawMobile.replace(/\D/g, '');
    if (digits && rawMobile.startsWith('+')) {
      byPhone.set(`+${digits}`, user);
    } else if (digits.length > 10) {
      byPhone.set(`+${digits}`, user);
    }

    if (normalizedMobile) {
      byPhone.set(normalizedMobile, user);
    }
  });
  return byPhone;
};

export const pickMatchedUserForPhones = (usersByPhone, lookupPhones) => {
  const map =
    usersByPhone instanceof Map
      ? usersByPhone
      : buildUsersByPhoneMap(Object.values(usersByPhone || {}));
  const phones = Array.isArray(lookupPhones) ? lookupPhones : [];
  const matchedPhone = phones.find(value => map.has(value));
  if (!matchedPhone) {
    return null;
  }
  return {
    matchedPhone,
    user: map.get(matchedPhone) || null,
  };
};

