import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchUsersByPhone } from './userProfileService';

const CONTACT_MATCHES_PREFIX = 'contact_matches_';
const CONTACT_MATCHES_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const isUserInstalled = user =>
  String(user?.appInstallState || 'installed').trim().toLowerCase() !== 'uninstalled';

/**
 * Check if a cached contact match is still valid (not expired)
 */
const isCacheValid = (cachedData) => {
  if (!cachedData || !cachedData.timestamp) {
    return false;
  }
  const now = Date.now();
  return now - cachedData.timestamp < CONTACT_MATCHES_EXPIRY;
};

/**
 * Extract clean phone number (remove formatting, spaces, etc.)
 */
const getCleanPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/\D/g, '').slice(-10); // Get last 10 digits
};

/**
 * Search for a single user by phone number
 * Returns user data if found, null otherwise
 */
const searchUserByPhone = async (phoneNumber) => {
  try {
    const cleanPhone = getCleanPhoneNumber(phoneNumber);
    if (!cleanPhone || cleanPhone.length < 10) {
      return null;
    }

    const results = await searchUsersByPhone(cleanPhone);
    return results && results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Error searching user by phone:', error);
    return null;
  }
};

/**
 * Match a single contact with app user data
 * Returns enriched contact object
 */
const matchSingleContact = async (contact) => {
  try {
    // Check cache first
    const cacheKey = `${CONTACT_MATCHES_PREFIX}${contact.recordID}`;
    const cached = await AsyncStorage.getItem(cacheKey);

    if (cached) {
      const cachedData = JSON.parse(cached);
      if (isCacheValid(cachedData)) {
        return {
          ...contact,
          ...cachedData.userData,
        };
      }
    }

    // Get phone number(s)
    const phoneNumbers = contact.phoneNumbers || [];
    if (phoneNumbers.length === 0) {
      // No phone number, can't match
      return {
        ...contact,
        isAppUser: false,
      };
    }

    // Try to find user by phone
    const phoneNumber = phoneNumbers[0].number;
    const foundUser = await searchUserByPhone(phoneNumber);

    if (foundUser) {
      if (!isUserInstalled(foundUser)) {
        const userData = {
          isAppUser: false,
          appInstallState: 'uninstalled',
        };
        const contactCacheKey = `${CONTACT_MATCHES_PREFIX}${contact.recordID}`;
        await AsyncStorage.setItem(
          contactCacheKey,
          JSON.stringify({
            userData,
            timestamp: Date.now(),
          })
        );
        return {
          ...contact,
          ...userData,
        };
      }
      const userData = {
        isAppUser: true,
        username: foundUser.username || '',
        userId: foundUser._id || foundUser.userId || '',
        photoURL: foundUser.photoURL || foundUser.photo_url || '',
        displayName: foundUser.displayName || foundUser.username || '',
        appInstallState: String(foundUser.appInstallState || 'installed').trim().toLowerCase(),
      };

      // Cache the result
      const contactCacheKey = `${CONTACT_MATCHES_PREFIX}${contact.recordID}`;
      await AsyncStorage.setItem(
        contactCacheKey,
        JSON.stringify({
          userData,
          timestamp: Date.now(),
        })
      );

      return {
        ...contact,
        ...userData,
      };
    } else {
      // Not an app user
      const enrichedContact = {
        ...contact,
        isAppUser: false,
      };

      // Cache negative result too (for 24 hours)
      const contactCacheKey = `${CONTACT_MATCHES_PREFIX}${contact.recordID}`;
      await AsyncStorage.setItem(
        contactCacheKey,
        JSON.stringify({
          userData: { isAppUser: false },
          timestamp: Date.now(),
        })
      );

      return enrichedContact;
    }
  } catch (error) {
    console.error('Error matching single contact:', error);
    return {
      ...contact,
      isAppUser: false,
    };
  }
};

/**
 * Match multiple contacts with app users
 * Returns enriched contact list
 */
export const matchContactsWithAppUsers = async (contacts, forceRefresh = false) => {
  try {
    if (!contacts || contacts.length === 0) {
      return [];
    }

    // If force refresh, clear old cache for these contacts
    if (forceRefresh) {
      for (const contact of contacts) {
        const cacheKey = `${CONTACT_MATCHES_PREFIX}${contact.recordID}`;
        await AsyncStorage.removeItem(cacheKey);
      }
    }

    // Match each contact
    const enrichedContacts = await Promise.all(
      contacts.map(contact => matchSingleContact(contact))
    );

    return enrichedContacts;
  } catch (error) {
    console.error('Error matching contacts with app users:', error);
    // Return contacts without enrichment on error
    return contacts.map(contact => ({
      ...contact,
      isAppUser: false,
    }));
  }
};

/**
 * Clear cache for a specific contact
 */
export const clearContactCache = async (contactRecordId) => {
  try {
    const cacheKey = `${CONTACT_MATCHES_PREFIX}${contactRecordId}`;
    await AsyncStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Error clearing contact cache:', error);
  }
};

/**
 * Clear all contact match cache
 */
export const clearAllContactCache = async () => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const contactCacheKeys = allKeys.filter(key => key.startsWith(CONTACT_MATCHES_PREFIX));
    if (contactCacheKeys.length > 0) {
      await AsyncStorage.multiRemove(contactCacheKeys);
    }
  } catch (error) {
    console.error('Error clearing all contact cache:', error);
  }
};

/**
 * Enrich a single contact (used when contact data changes)
 */
export const enrichContact = async (contact) => {
  return matchSingleContact(contact);
};

export default {
  matchContactsWithAppUsers,
  clearContactCache,
  clearAllContactCache,
  enrichContact,
};
