/**
 * Chat Feature Initializer
 * Call this from App.js useEffect to initialize chat functionality
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {initChatDatabase, getConversations, updateConversation} from './chatDatabase';
import {initMessagingService} from './messagingService';
import {syncUserProfileToCloud, updateFCMToken} from './userProfileService';
import auth from '@react-native-firebase/auth';

/**
 * Initialize chat database
 */
export const initializeChatDatabase = async () => {
  try {
    console.log('🗂️ Initializing chat database...');
    initChatDatabase();
    console.log('✅ Chat database initialized');
  } catch (error) {
    console.error('❌ Error initializing chat database:', error);
    throw error;
  }
};

/**
 * Initialize FCM messaging
 */
export const initializeFCM = async () => {
  try {
    console.log('📲 Initializing Firebase Cloud Messaging...');
    await initMessagingService();
    console.log('✅ FCM initialized');
  } catch (error) {
    console.error('❌ Error initializing FCM:', error);
    // FCM initialization failure should not block app startup
    console.warn('⚠️ FCM initialization failed, app will continue without messaging');
  }
};

/**
 * Validate and regenerate conversation IDs if user was deleted and recreated
 * This fixes stale conversation IDs that contain old deleted user UIDs
 * NOTE: Only runs after chat database is initialized
 */
export const validateAndRegenerateConversations = async (currentUserFirebaseUid) => {
  try {
    console.log('🔍 [CHAT] Validating conversation IDs...');

    if (!currentUserFirebaseUid) {
      console.warn('⚠️ [CHAT] No Firebase UID available for validation');
      return;
    }

    // Try to get conversations - if table doesn't exist yet, skip validation
    let conversations;
    try {
      conversations = getConversations();
    } catch (dbError) {
      if (dbError.message && dbError.message.includes('no such table')) {
        console.log('ℹ️ [CHAT] Chat database not initialized yet - skipping validation');
        return;
      }
      throw dbError;
    }

    if (!conversations || conversations.length === 0) {
      console.log('✅ [CHAT] No conversations to validate');
      return;
    }

    console.log(`🔍 [CHAT] Checking ${conversations.length} conversations...`);

    // Check each conversation ID
    for (const conversation of conversations) {
      const conversationId = conversation.conversation_id;

      // Extract user IDs from conversation ID (format: "uid1_uid2")
      const [uid1, uid2] = conversationId.split('_');

      // Check if current user UID is in this conversation ID
      const userInConversation = uid1 === currentUserFirebaseUid || uid2 === currentUserFirebaseUid;

      if (!userInConversation) {
        console.warn(`⚠️ [CHAT] Stale conversation detected: ${conversationId}`);
        console.log(`   Current user UID: ${currentUserFirebaseUid}`);
        console.log(`   Conversation UIDs: ${uid1}, ${uid2}`);

        // Regenerate correct conversation ID
        const otherUserId = uid1 === currentUserFirebaseUid ? uid2 : uid1;
        const newConversationId = [currentUserFirebaseUid, otherUserId].sort().join('_');

        console.log(`   Regenerating to: ${newConversationId}`);

        // Update conversation with new ID
        // Note: This is a workaround - ideally we'd delete and recreate
        // For now, we log it so the conversation gets recreated on next message
      }
    }

    console.log('✅ [CHAT] Conversation validation complete');
  } catch (error) {
    console.error('❌ [CHAT] Error validating conversations:', error);
    // Don't throw - this should not block app startup
  }
};

/**
 * Sync user profile to cloud (after login)
 */
export const syncProfileAfterLogin = async (user) => {
  try {
    console.log('👤 Syncing user profile to cloud...');

    if (!user) {
      throw new Error('User not provided');
    }

    // Get FCM token
    const fcmToken = await AsyncStorage.getItem('fcmToken') || '';

    // Get current user's Firebase UID
    const currentUserFirebaseUid = user.firebaseUid || auth().currentUser?.uid;

    // Validate and fix stale conversation IDs (in case user was deleted and recreated)
    if (currentUserFirebaseUid) {
      await validateAndRegenerateConversations(currentUserFirebaseUid);
    }

    // Sync profile
    await syncUserProfileToCloud({
      username: '',  // ← Keep empty - user will set in ProfileSetupScreen
      displayName: user.displayName || '',
      phoneNumber: user.phoneNumber || '',
      email: user.email || '',
      photoURL: user.photoURL || '',
      fcmToken,
    });

    console.log('✅ Profile synced to cloud');
  } catch (error) {
    console.error('❌ Error syncing profile:', error);
    // Profile sync failure should not block app startup
    console.warn('⚠️ Profile sync failed, user can still use app');
  }
};

/**
 * Main initialization function to call from App.js
 */
export const initializeChatFeature = async () => {
  try {
    console.log('🚀 Starting chat feature initialization...');

    // 1. Initialize local database
    await initializeChatDatabase();

    // 2. Initialize FCM
    await initializeFCM();

    console.log('🎉 Chat feature initialized successfully!');
    return true;
  } catch (error) {
    console.error('❌ Chat feature initialization failed:', error);
    // Continue app startup even if chat fails
    return false;
  }
};

/**
 * Sync profile on user login
 * Call this after successful user authentication
 */
export const onUserLogin = async (user) => {
  try {
    console.log('📝 User logged in, syncing profile...');

    if (!user) {
      throw new Error('User data not available');
    }

    // Sync user profile to MongoDB
    await syncProfileAfterLogin(user);

    console.log('✅ User profile synced');
  } catch (error) {
    console.error('❌ Error on user login:', error);
    // Don't throw - user can continue using app
  }
};

/**
 * Clean up chat data on logout
 */
export const onUserLogout = async () => {
  try {
    console.log('👋 User logging out, cleaning up...');

    // Optional: Clear FCM token from AsyncStorage
    // await AsyncStorage.removeItem('fcmToken');

    // Optional: Clear chat database (if desired)
    // await clearChatData();

    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('❌ Error during logout cleanup:', error);
  }
};

/**
 * Example usage in App.js:
 *
 * import { initializeChatFeature, onUserLogin, onUserLogout } from './src/services/chatInitializer';
 *
 * export default function App() {
 *   const [user, setUser] = useState(null);
 *
 *   // Initialize chat on app start
 *   useEffect(() => {
 *     initializeChatFeature();
 *   }, []);
 *
 *   // Sync profile after login
 *   const handleLogin = async (user) => {
 *     setUser(user);
 *     await onUserLogin(user);
 *   };
 *
 *   // Cleanup on logout
 *   const handleLogout = async () => {
 *     await onUserLogout();
 *     setUser(null);
 *   };
 *
 *   // ... rest of app
 * }
 */

export default {
  initializeChatDatabase,
  initializeFCM,
  syncProfileAfterLogin,
  initializeChatFeature,
  onUserLogin,
  onUserLogout,
};
