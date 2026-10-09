import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from '../config/firebase';
import { googleSignIn } from '../services/api';
import { saveUserData, initDatabase } from '../services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveFirebaseToken } from '../utils/tokenManager';
import {
  resolveCanonicalSessionUser,
  writeCachedSessionUser,
} from '../services/sessionService';
import { onUserLogin } from '../services/chatInitializer';
import {
  clearStartupSessionFlags,
  resolveStartupSessionFlagsForUser,
  writeStartupSessionFlags,
} from '../services/startupCoordinator';
import {useAppAlert} from '../context/AppAlertContext';
import {useTheme} from '../context/ThemeContext';

const LoginScreen = ({ navigation }) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const {showAlert} = useAppAlert();
  const themedAlert = React.useCallback((title, message, actions) => {
    const safeActions =
      Array.isArray(actions) && actions.length
        ? actions.map(action => ({
            text: String(action?.text || 'OK'),
            style: action?.style || 'default',
            onPress: action?.onPress,
          }))
        : [{text: 'OK'}];
    showAlert({
      title: String(title || ''),
      message: String(message || ''),
      actions: safeActions,
    });
  }, [showAlert]);
  const [loading, setLoading] = useState(false);

  // Initialize database on mount
  React.useEffect(() => {
    initDatabase();
  }, []);

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      console.log('=== STEP 1: Starting Google Sign-In ===');

      // Check if device supports Google Play
      try {
        await GoogleSignin.hasPlayServices();
        console.log('=== STEP 2: Play Services Available ===');
      } catch (playServicesError) {
        console.error('❌ STEP 2 FAILED: Google Play Services not available');
        console.error('Error:', playServicesError.message || JSON.stringify(playServicesError));
        throw playServicesError;
      }

      // Ensure chooser shows by clearing any cached Google session
      try {
        await GoogleSignin.signOut();
        console.log('Previous session cleared');
      } catch (signOutError) {
        console.log('⚠️ Sign-out warning (ignored):', signOutError.message);
        // Ignore sign-out errors and continue with sign-in
      }

      // Sign in with Google
      console.log('🔵 Attempting Google Sign-In...');
      let userInfo;
      try {
        userInfo = await GoogleSignin.signIn();
        console.log('=== STEP 3: Google Sign-In Response ===');
        console.log('Full userInfo object:', JSON.stringify(userInfo, null, 2));
      } catch (signInError) {
        console.error('❌ STEP 3 FAILED: Google Sign-In failed');
        console.error('Error message:', signInError.message);
        console.error('Error code:', signInError.code);
        console.error('Full error:', JSON.stringify(signInError));
        throw signInError;
      }

      // Extract data from new response structure
      const { idToken: googleIdToken } = userInfo.data || userInfo;
      const googleUser = userInfo.data?.user || userInfo.user;

      console.log('Extracted googleIdToken:', googleIdToken);
      console.log('Extracted user:', googleUser);

      // Check if idToken exists
      if (!googleIdToken) {
        console.error('ERROR: googleIdToken is missing from userInfo');
        console.log('userInfo structure:', userInfo);
        throw new Error('Failed to get idToken from Google Sign-In');
      }

      console.log('=== STEP 4: Creating Firebase Credential ===');
      // Sign in to Firebase
      try {
        const googleCredential = auth.GoogleAuthProvider.credential(
          googleIdToken,
        );
        console.log('✅ Firebase credential created');

        console.log('=== STEP 5: Signing in to Firebase ===');
        const firebaseAuthResult = await auth().signInWithCredential(googleCredential);
        console.log('✅ Firebase sign-in successful');

        // Get Firebase ID token
        console.log('=== STEP 6: Getting Firebase User ===');
        const firebaseUser = auth().currentUser;
        console.log('✅ Firebase user:', firebaseUser ? firebaseUser.uid : 'null');

        const firebaseIdToken = await firebaseUser.getIdToken();
        console.log('=== STEP 7: Got Firebase ID Token ===');

        // Save Firebase token
        await saveFirebaseToken(firebaseIdToken);
        await AsyncStorage.setItem('firebaseUid', firebaseUser.uid);
        console.log('=== STEP 8: Saved tokens locally ===');

        // Send to backend
        console.log('=== STEP 9: Sending to backend ===');
        const response = await googleSignIn(firebaseIdToken);
        console.log('✅ Backend response:', response);

        if (!response.success) {
          console.error('❌ Backend returned error:', response.message);
          throw new Error(response.message || 'Backend authentication failed');
        }

        let normalizedUser = await resolveCanonicalSessionUser(response.user);

        // Merge Firebase Auth photoURL if not already present (e.g. from Google profile)
        const firebasePhotoURL = auth().currentUser?.photoURL || '';
        if (!normalizedUser.photoURL && firebasePhotoURL) {
          normalizedUser = await writeCachedSessionUser({
            ...normalizedUser,
            photoURL: firebasePhotoURL,
          });
        }

        // Save user data locally
        saveUserData(normalizedUser);

        try {
          await onUserLogin(normalizedUser);
          console.log('User profile synced to backend');
        } catch (syncError) {
          console.warn('Profile sync skipped (non-blocking):', syncError);
        }

        // Auto-set backup email from Google Sign-In (cannot be changed)
        if (normalizedUser?.email) {
          await AsyncStorage.setItem('backup.accountEmail', normalizedUser.email);
          await AsyncStorage.setItem('backup.enabled', 'true');
        }

        const startupFlags = await resolveStartupSessionFlagsForUser({
          userPayload: normalizedUser,
        });
        await writeStartupSessionFlags({
          userPayload: normalizedUser,
          restoreDecisionPending: startupFlags.restoreDecisionPending,
          postLoginRequiredRoute: startupFlags.requiredRoute,
        });

        navigation.reset({
          index: 0,
          routes: [{name: 'Boot'}],
        });
      } catch (firebaseError) {
        console.error('❌ Firebase/Backend error:', firebaseError.message);
        throw firebaseError;
      }
    } catch (error) {
      try {
        await clearStartupSessionFlags({
          restoreDecisionPending: false,
        });
      } catch {}
      console.error('=== GOOGLE SIGN-IN ERROR ===');
      console.error('Error type:', typeof error);
      console.error('Error object:', error);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error stack:', error.stack);
      console.error('Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      themedAlert('Error', error.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={styles.title}>Savingo</Text>
        <Text style={styles.subtitle}>Welcome Back!</Text>
        <Text style={styles.description}>Sign in to continue</Text>

        <View style={styles.formContainer}>
          <TouchableOpacity
            style={[styles.googleButton, loading && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 15,
    color: colors.text.secondary,
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  googleButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default LoginScreen;





