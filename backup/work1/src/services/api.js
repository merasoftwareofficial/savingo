import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshToken, getFirebaseToken } from '../utils/tokenManager';
import {perfLog, perfNow} from '../utils/perfLogger';

// Backend API base URL
// const API_BASE_URL = 'http://10.0.2.2:5000/api'; // Android emulator ke liye
const API_BASE_URL = 'https://account-android-app-backend.vercel.app/api'; // Physical device ke liye

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add token to all requests
api.interceptors.request.use(
  async config => {
    const startedAt = perfNow();
    config.metadata = {
      ...(config.metadata || {}),
      perfStartedAt: startedAt,
    };
    // Get token from AsyncStorage
    const token = await getFirebaseToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    perfLog('api', 'request', {
      method: String(config.method || 'GET').toUpperCase(),
      path: String(config.url || ''),
    });
    return config;
  },
  error => {
    return Promise.reject(error);
  },
);

// Response interceptor - Handle token expiry
api.interceptors.response.use(
  response => {
    const startedAt = Number(response?.config?.metadata?.perfStartedAt) || 0;
    perfLog('api', 'response', {
      method: String(response?.config?.method || 'GET').toUpperCase(),
      path: String(response?.config?.url || ''),
      status: Number(response?.status || 0),
      durationMs: startedAt > 0 ? Math.max(0, perfNow() - startedAt) : null,
    });
    return response;
  },
  async error => {
    const originalRequest = error.config;
    const startedAt = Number(originalRequest?.metadata?.perfStartedAt) || 0;
    perfLog('api', 'response-error', {
      method: String(originalRequest?.method || 'GET').toUpperCase(),
      path: String(originalRequest?.url || ''),
      status: Number(error?.response?.status || 0),
      durationMs: startedAt > 0 ? Math.max(0, perfNow() - startedAt) : null,
      message: String(error?.message || 'unknown'),
    });

    // If token expired (401) and haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const newToken = await refreshToken();

        if (newToken) {
          // Update request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          // Retry request
          return api(originalRequest);
        } else {
          // Token refresh failed, clear data and logout
          await AsyncStorage.clear();
          // Navigate to login (will be handled by auth state listener)
          return Promise.reject(error);
        }
      } catch (refreshError) {
        // Token refresh failed
        await AsyncStorage.clear();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// API Functions

// 1. Google Sign-In
export const googleSignIn = async (idToken) => {
  try {
    const response = await api.post('/auth/google-signin', { idToken });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// 2. Check Username Availability
export const checkUsername = async (username) => {
  try {
    const response = await api.post('/auth/check-username', { username });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// 3. Complete Setup (Set Username & Password)
export const completeSetup = async (firebaseUid, username, password) => {
  try {
    const response = await api.post('/auth/complete-setup', {
      firebaseUid,
      username,
      password,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// 4. Username/Password Login
export const login = async (username, password) => {
  try {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// 5. Get User Details
export const getUserDetails = async (token) => {
  try {
    const response = await api.get('/auth/user', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// 6. Logout
export const logout = async (token) => {
  try {
    const response = await api.post(
      '/auth/logout',
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// 7. Update Profile
export const updateProfile = async (firebaseUid, profileData) => {
  try {
    const response = await api.put('/auth/update-profile', {
      firebaseUid,
      ...profileData,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getBootstrapUser = async () => {
  try {
    const response = await api.get('/users/bootstrap');
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const checkPhoneNumber = async (mobile) => {
  try {
    const response = await api.post('/auth/check-phone', { mobile });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const requestPhoneClaim = async (phone) => {
  try {
    const response = await api.post('/auth/phone-claims/request', { phone });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getPhoneClaimsInbox = async () => {
  try {
    const response = await api.get('/auth/phone-claims/inbox');
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const respondToPhoneClaim = async (claimId, action, extra = {}) => {
  try {
    const response = await api.post('/auth/phone-claims/respond', {
      claimId,
      action,
      ...extra,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};


// 8. Fetch Users By Phones
export const fetchUsersByPhones = async (phones) => {
  try {
    const response = await api.post('/auth/users-by-phones', { phones });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
export default api;

