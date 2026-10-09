import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ensureDriveScopes} from '../services/driveService';
import {findLatestBackupFile, restoreFromBackup} from '../services/backupService';
import {
  readCachedSessionUser,
  refreshCanonicalSessionUser,
  writeCachedSessionUser,
} from '../services/sessionService';
import {
  writeStartupSessionFlags,
} from '../services/startupCoordinator';
import {isProfileReadyForBackup} from '../utils/profileSetupGate';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';

const PreparingAppScreen = ({navigation, route}) => {
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const themedAlert = useCallback((title, message, actions) => {
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
  const currentUser = useMemo(() => route?.params?.user || {}, [route?.params?.user]);
  const [status, setStatus] = useState('loading');
  const [latestBackup, setLatestBackup] = useState(null);
  const [busy, setBusy] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const firebaseUid = useMemo(
    () => String(currentUser?.firebaseUid || '').trim(),
    [currentUser?.firebaseUid],
  );

  const resolveCurrentUserSnapshot = useCallback(async () => {
    const storedUser = await readCachedSessionUser();
    return Object.keys(storedUser).length > 0 ? storedUser : currentUser;
  }, [currentUser]);

  const finalizeFreshOpen = useCallback(async nextUser => {
    const resolvedUser = nextUser || currentUser || {};
    await writeStartupSessionFlags({
      userPayload: resolvedUser,
      restoreDecisionPending: false,
    });
    navigation.reset({
      index: 0,
      routes: [{name: 'Boot'}],
    });
  }, [currentUser, navigation]);

  useEffect(() => {
    let mounted = true;

    const runPreparation = async () => {
      setBusy(true);
      setErrorMessage('');
      try {
        const baseUser = await resolveCurrentUserSnapshot();
        const effectiveUser = await refreshCanonicalSessionUser(baseUser);

        if (!isProfileReadyForBackup(effectiveUser)) {
          if (mounted) {
            setStatus('no_backup');
          }
          await finalizeFreshOpen(effectiveUser);
          return;
        }

        await ensureDriveScopes();
        const resolvedUid =
          String(effectiveUser?.firebaseUid || '').trim() ||
          firebaseUid ||
          String((await AsyncStorage.getItem('firebaseUid')) || '').trim();
        const latest = await findLatestBackupFile(resolvedUid);

        if (!mounted) {
          return;
        }

        if (!latest) {
          setStatus('no_backup');
          await finalizeFreshOpen(effectiveUser);
          return;
        }

        setLatestBackup(latest);
        setStatus('ready');
      } catch (error) {
        console.error('[PREPARING_APP] setup failed:', error);
        if (!mounted) {
          return;
        }
        setLatestBackup(null);
        setStatus('error');
        setErrorMessage(String(error?.message || 'Unable to prepare the app right now.'));
      } finally {
        if (mounted) {
          setBusy(false);
        }
      }
    };

    runPreparation();

    return () => {
      mounted = false;
    };
  }, [currentUser, firebaseUid, finalizeFreshOpen, resolveCurrentUserSnapshot]);

  const handleSkip = async () => {
    setBusy(true);
    try {
      const effectiveUser = await resolveCurrentUserSnapshot();
      await finalizeFreshOpen(effectiveUser);
    } catch (error) {
      console.error('[PREPARING_APP] skip failed:', error);
      themedAlert('Unable to continue', 'Please try again.');
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!latestBackup?.id) {
      return;
    }
    setBusy(true);
    try {
      const effectiveUser = await resolveCurrentUserSnapshot();
      const existingFirebaseToken = await AsyncStorage.getItem('firebaseToken');
      await restoreFromBackup({fileId: latestBackup.id});
      const reconciledUser = await refreshCanonicalSessionUser(effectiveUser);
      await writeCachedSessionUser(reconciledUser);
      const resolvedUid =
        String(reconciledUser?.firebaseUid || '').trim() || firebaseUid;
      if (resolvedUid) {
        await AsyncStorage.setItem('firebaseUid', resolvedUid);
      }
      if (existingFirebaseToken) {
        await AsyncStorage.setItem('firebaseToken', existingFirebaseToken);
      }
      await finalizeFreshOpen(reconciledUser);
    } catch (error) {
      console.error('[PREPARING_APP] restore failed:', error);
      themedAlert(
        'Restore Failed',
        `Unable to restore backup.\n\nError: ${String(error?.message || 'Unknown error')}`,
      );
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setStatus('loading');
    setLatestBackup(null);
    setBusy(true);
    setErrorMessage('');
    try {
      const baseUser = await resolveCurrentUserSnapshot();
      const effectiveUser = await refreshCanonicalSessionUser(baseUser);
      if (!isProfileReadyForBackup(effectiveUser)) {
        setStatus('no_backup');
        await finalizeFreshOpen(effectiveUser);
        return;
      }
      await ensureDriveScopes();
      const resolvedUid =
        String(effectiveUser?.firebaseUid || '').trim() ||
        firebaseUid ||
        String((await AsyncStorage.getItem('firebaseUid')) || '').trim();
      const latest = await findLatestBackupFile(resolvedUid);
      if (!latest) {
        setStatus('no_backup');
        await finalizeFreshOpen(effectiveUser);
        return;
      }
      setLatestBackup(latest);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMessage(String(error?.message || 'Unable to prepare the app right now.'));
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background ?? '#F3F4F6',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: colors.card ?? '#242A33',
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 24,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: {width: 0, height: 8},
      elevation: 3,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text?.primary ?? '#111827',
    },
    message: {
      marginTop: 10,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text?.secondary ?? '#4B5563',
    },
    loadingWrap: {
      marginTop: 24,
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 14,
      fontSize: 14,
      color: colors.text?.light ?? '#6B7280',
      textAlign: 'center',
    },
    actions: {
      marginTop: 24,
      gap: 12,
    },
    button: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      backgroundColor: colors.card ?? '#242A33',
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryButtonText: {
      color: colors.white ?? '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryButtonText: {
      color: colors.text?.primary ?? '#111827',
      fontSize: 15,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    errorText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.error ?? '#FF453A',
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Please wait</Text>
        <Text style={styles.message}>
          {status === 'ready'
            ? 'We found a backup for this account. Choose how you want to continue.'
            : 'We are preparing your app.'}
        </Text>

        {status === 'loading' ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Checking your account and backup...</Text>
          </View>
        ) : null}

        {status === 'ready' ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={handleRestore}
              disabled={busy}>
              <Text style={styles.primaryButtonText}>
                {busy ? 'Please wait...' : 'Restore backup'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, busy && styles.buttonDisabled]}
              onPress={handleSkip}
              disabled={busy}>
              <Text style={styles.secondaryButtonText}>Skip and continue</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {status === 'error' ? (
          <View style={styles.actions}>
            <Text style={styles.errorText}>{errorMessage || 'Unable to prepare the app.'}</Text>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={handleRetry}
              disabled={busy}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, busy && styles.buttonDisabled]}
              onPress={handleSkip}
              disabled={busy}>
              <Text style={styles.secondaryButtonText}>Continue without restore</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
};


export default PreparingAppScreen;


