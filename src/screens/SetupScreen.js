import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import { checkUsername, completeSetup } from '../services/api';
import { saveUserData } from '../services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {isAutoBackupEnabled, setAutoBackupEnabled} from '../utils/backupQueue';
import {useAppAlert} from '../context/AppAlertContext';
import {useTheme} from '../context/ThemeContext';
import {writeCachedSessionUser} from '../services/sessionService';

const SetupScreen = ({ route, navigation }) => {
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
  const { firebaseUid, email, displayName, photoURL } = route.params;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [backupAccountEmail, setBackupAccountEmail] = useState(email || '');
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(true);
  const [selectingAccount, setSelectingAccount] = useState(false);

  // Validate username format
  const validateUsernameFormat = (text) => {
    const regex = /^[a-zA-Z0-9._-]+$/;
    return regex.test(text);
  };

  // Check username availability (debounced)
  useEffect(() => {
    if (username.length < 3) {
      setUsernameAvailable(null);
      setSuggestions([]);
      return;
    }

    if (!validateUsernameFormat(username)) {
      setUsernameAvailable(false);
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const response = await checkUsername(username);
        setUsernameAvailable(response.available);
        setSuggestions(response.suggestions || []);
      } catch (error) {
        console.error('Username check error:', error);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [username]);

  useEffect(() => {
    const loadBackupSettings = async () => {
      const enabled = await isAutoBackupEnabled();
      setAutoBackupEnabledState(enabled);
      const storedEmail = await AsyncStorage.getItem('backup.accountEmail');
      if (storedEmail) {
        setBackupAccountEmail(storedEmail);
      } else if (email) {
        setBackupAccountEmail(email);
      }
    };
    loadBackupSettings();
  }, [email]);

  // Handle setup completion
  const handleCompleteSetup = async () => {
    // Validations
    if (!username.trim()) {
      themedAlert('Error', 'Please enter a username');
      return;
    }

    if (!validateUsernameFormat(username)) {
      themedAlert(
        'Invalid Username',
        'Username can only contain letters, numbers, dots, hyphens, and underscores',
      );
      return;
    }

    if (usernameAvailable === false) {
      themedAlert('Error', 'Username is already taken. Please choose another.');
      return;
    }

    if (!password.trim()) {
      themedAlert('Error', 'Please enter a password');
      return;
    }

    if (password.length < 6) {
      themedAlert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      themedAlert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await completeSetup(firebaseUid, username, password);

      if (response.success) {
        const normalizedUser = {
          ...response.user,
          currencySymbol:
            response.user?.currencySymbol ||
            response.user?.currency ||
            response.user?.currency_symbol ||
            '?',
        };
        // Save user data locally
        saveUserData(normalizedUser);
        await writeCachedSessionUser(normalizedUser);
        if (backupAccountEmail) {
          await AsyncStorage.setItem('backup.accountEmail', backupAccountEmail);
        }
        await setAutoBackupEnabled(autoBackupEnabled);

        themedAlert('Success', 'Account setup completed!', [
          {
            text: 'OK',
            onPress: () =>
              navigation.replace('Home', {
                user: normalizedUser,
                showTutorial: true,
              }),
          },
        ]);
      }
    } catch (error) {
      console.error('Setup error:', error);
      themedAlert('Error', error.message || 'Failed to complete setup');

      // If username taken, show suggestions
      if (error.suggestions) {
        setSuggestions(error.suggestions);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBackupAccount = async () => {
    try {
      setSelectingAccount(true);
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut();
      const userInfo = await GoogleSignin.signIn();
      const selectedEmail = userInfo?.data?.user?.email || userInfo?.user?.email;
      if (selectedEmail) {
        setBackupAccountEmail(selectedEmail);
        await AsyncStorage.setItem('backup.accountEmail', selectedEmail);
      }
    } catch (error) {
      console.error('Failed to select backup account:', error);
      themedAlert('Error', 'Unable to select Google account');
    } finally {
      setSelectingAccount(false);
    }
  };

  const handleAutoBackupToggle = async value => {
    setAutoBackupEnabledState(value);
    await setAutoBackupEnabled(value);
  };

  // Handle suggestion press
  const handleSuggestionPress = (suggested) => {
    setUsername(suggested);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled">
        <View style={styles.innerContainer}>
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>Welcome, {displayName}!</Text>

          <View style={styles.formContainer}>
            {/* Username Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Choose Username</Text>
              <TextInput
                style={styles.input}
                placeholder="username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                editable={!loading}
              />

              {checkingUsername && (
                <Text style={styles.checkingText}>Checking...</Text>
              )}

              {!checkingUsername && usernameAvailable === true && (
                <Text style={styles.availableText}>✓ Available</Text>
              )}

              {!checkingUsername &&
                usernameAvailable === false &&
                username.length >= 3 && (
                  <Text style={styles.takenText}>✗ Already taken</Text>
                )}

              {!validateUsernameFormat(username) && username.length > 0 && (
                <Text style={styles.errorText}>
                  Only letters, numbers, dots, hyphens, and underscores allowed
                </Text>
              )}
            </View>

            {/* Username Suggestions */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsTitle}>Suggestions:</Text>
                {suggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionButton}
                    onPress={() => handleSuggestionPress(suggestion)}>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                    <Text style={styles.useText}>Use</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Create Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Password (min 6 characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />
            </View>

            {/* Confirm Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!loading}
              />
            </View>
            {/* Google Account Info */}
            <View style={styles.googleInfo}>
              <Text style={styles.googleInfoTitle}>Backup Account</Text>
              <View style={styles.googleRow}>
                <Text style={styles.googleInfoText}>
                  {backupAccountEmail || 'Not selected'}
                </Text>
                <TouchableOpacity
                  style={styles.googleChangeButton}
                  onPress={handleSelectBackupAccount}
                  disabled={selectingAccount || loading}>
                  {selectingAccount ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text style={styles.googleChangeText}>Change</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.googleRow}>
                <Text style={styles.googleInfoSubtext}>Auto backup</Text>
                <ToggleSwitch
                  value={autoBackupEnabled}
                  onValueChange={handleAutoBackupToggle}
                />
              </View>
            </View>

            {/* Complete Setup Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleCompleteSetup}
              disabled={loading || checkingUsername || usernameAvailable === false}>
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Complete Setup</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = colors =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 30,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
  },
  checkingText: {
    marginTop: 5,
    color: colors.text.secondary,
    fontSize: 12,
  },
  availableText: {
    marginTop: 5,
    color: '#28a745',
    fontSize: 12,
    fontWeight: '600',
  },
  takenText: {
    marginTop: 5,
    color: '#dc3545',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 5,
    color: '#dc3545',
    fontSize: 12,
  },
  suggestionsContainer: {
    marginBottom: 20,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 10,
  },
  suggestionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  useText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  googleInfo: {
    backgroundColor: colors.surfaceMuted,
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  googleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  googleInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 5,
  },
  googleInfoText: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '600',
    marginBottom: 5,
    flex: 1,
  },
  googleChangeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  googleChangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  googleInfoSubtext: {
    fontSize: 12,
    color: colors.text.secondary,
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
});

export default SetupScreen;


