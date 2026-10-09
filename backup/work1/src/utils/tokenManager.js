import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {writeCachedSessionUser} from '../services/sessionService';
import {clearStartupStateForLogout} from '../services/startupCoordinator';

const API_BASE_URL = 'https://account-android-app-backend.vercel.app/api';

// Get current Firebase token
export const getFirebaseToken = async () => {
  try {
    const token = await AsyncStorage.getItem('firebaseToken');
    return token;
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

// Save Firebase token
export const saveFirebaseToken = async (token) => {
  try {
    await AsyncStorage.setItem('firebaseToken', token);
    return true;
  } catch (error) {
    console.error('Error saving token:', error);
    return false;
  }
};

// Refresh Firebase token
export const refreshToken = async () => {
  try {
    const currentUser = auth().currentUser;

    if (currentUser) {
      // Force refresh token
      const newToken = await currentUser.getIdToken(true);
      await saveFirebaseToken(newToken);
      console.log('Token refreshed successfully');
      return newToken;
    }

    console.log('No current user, cannot refresh token');
    return null;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
};

// Check if user is authenticated
export const checkAuthStatus = async () => {
  try {
    const firebaseToken = await AsyncStorage.getItem('firebaseToken');
    const currentUser = auth().currentUser;

    if (firebaseToken && currentUser) {
      // Try to refresh token
      const newToken = await currentUser.getIdToken(true);
      await saveFirebaseToken(newToken);
      const response = await fetch(`${API_BASE_URL}/users/bootstrap`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Bootstrap request failed with status ${response.status}`);
      }
      const payload = await response.json();
      if (!payload?.success || !payload?.user) {
        throw new Error('Bootstrap payload missing canonical user');
      }
      const normalizedUser = await writeCachedSessionUser(payload.user);

      return {
        isAuthenticated: true,
        user: normalizedUser,
        token: newToken,
      };
    }

    return {
      isAuthenticated: false,
      user: null,
      token: null,
    };
  } catch (error) {
    console.error('Auth check error:', error);
    return {
      isAuthenticated: false,
      user: null,
      token: null,
    };
  }
};

// Clear all auth data (logout)
export const clearAuthData = async () => {
  try {
    const firebaseUid = await AsyncStorage.getItem('firebaseUid');
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('firebaseToken');
    await AsyncStorage.removeItem('firebaseUid');
    await clearStartupStateForLogout({firebaseUid});
    console.log('Auth data cleared');
    return true;
  } catch (error) {
    console.error('Error clearing auth data:', error);
    return false;
  }
};

// Auto-refresh token every 50 minutes (before 1 hour expiry)
let refreshInterval = null;

export const startTokenRefresh = () => {
  // Clear any existing interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Refresh every 50 minutes
  refreshInterval = setInterval(async () => {
    const currentUser = auth().currentUser;
    if (currentUser) {
      await refreshToken();
    }
  }, 50 * 60 * 1000); // 50 minutes

  console.log('Token auto-refresh started');
};

export const stopTokenRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('Token auto-refresh stopped');
  }
};
