import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import PageHeader from '../components/ui/PageHeader';
import {
  ensureDriveScopes,
} from '../services/driveService';
import {
  BACKUP_VERSION_OPTIONS,
  DEFAULT_BACKUP_VERSION_COUNT,
  getRecentBackupsForCurrentUser,
  getBackupVersionCount,
  restoreBackupByIdFlow,
  runManualBackupNow,
  setBackupVersionCount,
} from '../services/backupService';
import RNRestart from 'react-native-restart';
import {
  isAutoBackupEnabled,
  setAutoBackupEnabled,
} from '../utils/backupQueue';
import {listAppDataFiles} from '../services/driveService';
import {useToast} from '../hooks/useToast';
import {getBackupProfileGateState} from '../utils/profileSetupGate';
import BackupProgressModal from '../components/BackupProgressModal';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import BackupRestoreSelect from '../ui/BackupRestoreSelect';

const BackupScreen = ({navigation}) => {
  const {showToast} = useToast();
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const themedAlert = React.useCallback(
    (title, message, actions) => {
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
    },
    [showAlert],
  );
  const [accountEmail, setAccountEmail] = useState('');
  const [backupEnabled, setBackupEnabled] = useState(true);
  const [lastBackupAt, setLastBackupAt] = useState('');
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressTitle, setProgressTitle] = useState('Backup in progress');
  const [progressSubtitle, setProgressSubtitle] = useState('Please wait...');
  const [progressPercent, setProgressPercent] = useState(0);
  const [backupLocked, setBackupLocked] = useState(false);
  const [backupVersionCount, setBackupVersionCountState] = useState(
    DEFAULT_BACKUP_VERSION_COUNT,
  );
  const [backupVersionSaved, setBackupVersionSaved] = useState(false);
  const [recentBackups, setRecentBackups] = useState([]);
  const [backupLockMessage, setBackupLockMessage] = useState(
    'Complete profile setup to use backup and restore'
  );
  const progressStartRef = useRef(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressTimerRef = useRef(null);
  const recentBackupsLoadRef = useRef(null);
  const backupToggleTrackColor = React.useMemo(
    () => ({false: '#D1D5DB', true: '#86EFAC'}),
    [],
  );
  const backupToggleThumbColor = React.useCallback(
    enabled => (enabled ? '#16A34A' : '#F9FAFB'),
    [],
  );

  const loadSettings = async () => {
    const storedEmail = await AsyncStorage.getItem('backup.accountEmail');
    const enabled = await isAutoBackupEnabled();
    const last = await AsyncStorage.getItem('backup.lastSuccessAt');
    const include = await AsyncStorage.getItem('backup.includeReceipts');
    const versionCount = await getBackupVersionCount();
    const gate = await getBackupProfileGateState();
    setAccountEmail(storedEmail || '');
    setBackupEnabled(enabled);
    setIncludeReceipts(include !== 'false');
    setBackupVersionCountState(versionCount);
    setBackupLocked(!gate.ready);
    setBackupLockMessage(gate.message || 'Complete profile setup to use backup and restore');
    if (last) {
      const date = new Date(Number(last));
      setLastBackupAt(date.toLocaleString());
    } else {
      setLastBackupAt('');
    }
  };

  const loadRecentBackups = async () => {
    if (recentBackupsLoadRef.current) {
      return recentBackupsLoadRef.current;
    }
    const loadPromise = (async () => {
      try {
        const gate = await getBackupProfileGateState();
        if (!gate.ready) {
          setRecentBackups([]);
          return;
        }
        const {backups, versionCount} = await getRecentBackupsForCurrentUser();
        setBackupVersionCountState(versionCount);
        setRecentBackups(backups || []);
      } catch (error) {
        console.warn('Failed to load recent backups:', error);
      } finally {
        recentBackupsLoadRef.current = null;
      }
    })();
    recentBackupsLoadRef.current = loadPromise;
    return loadPromise;
  };

  useEffect(() => {
    loadSettings();
    loadRecentBackups();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadSettings();
      loadRecentBackups();
    });
    return unsubscribe;
  }, [navigation]);

  const handleChangeAccount = async () => {
    if (backupLocked) {
      return;
    }
    try {
      setBusy(true);
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut();
      const userInfo = await GoogleSignin.signIn();
      const nextEmail = userInfo?.data?.user?.email || userInfo?.user?.email;
      if (nextEmail) {
        setAccountEmail(nextEmail);
        await AsyncStorage.setItem('backup.accountEmail', nextEmail);
      }
    } catch (error) {
      console.error('Failed to change backup account:', error);
      themedAlert('Error', 'Failed to change backup account');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBackup = async value => {
    if (backupLocked) {
      return;
    }
    const previous = backupEnabled;
    setBackupEnabled(value);
    try {
      await setAutoBackupEnabled(value);
      const saved = await isAutoBackupEnabled();
      if (saved !== value) {
        throw new Error('auto_backup_setting_mismatch');
      }
      showToast(value ? 'Auto backup enabled' : 'Auto backup disabled', 'success');
    } catch (error) {
      console.error('Failed to update auto backup setting:', error);
      setBackupEnabled(previous);
      showToast('Unable to save auto backup setting', 'error');
    }
  };

  const handleToggleReceipts = async value => {
    if (backupLocked) {
      return;
    }
    const previous = includeReceipts;
    setIncludeReceipts(value);
    try {
      await AsyncStorage.setItem('backup.includeReceipts', value ? 'true' : 'false');
      const saved = await AsyncStorage.getItem('backup.includeReceipts');
      if ((saved !== 'false') !== value) {
        throw new Error('receipt_photos_setting_mismatch');
      }
      showToast(value ? 'Receipt photos enabled' : 'Receipt photos disabled', 'success');
    } catch (error) {
      console.error('Failed to update receipt photos setting:', error);
      setIncludeReceipts(previous);
      showToast('Unable to save receipt photos setting', 'error');
    }
  };

  const handleBackupVersionChange = async value => {
    if (backupLocked || busy || value === backupVersionCount) {
      return;
    }
    const previous = backupVersionCount;
    setBackupVersionCountState(value);
    setBackupVersionSaved(false);
    try {
      const saved = await setBackupVersionCount(value);
      setBackupVersionCountState(saved);
      const {backups} = await getRecentBackupsForCurrentUser();
      setRecentBackups(backups || []);
      setBackupVersionSaved(true);
      showToast('Backup version setting updated', 'success');
      setTimeout(() => setBackupVersionSaved(false), 1200);
    } catch (error) {
      console.error('Failed to update backup version count:', error);
      setBackupVersionCountState(previous);
      showToast('Unable to update backup version setting', 'error');
    }
  };

  const openProgressModal = () => {
    setProgressVisible(true);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeProgressModal = () => {
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setProgressVisible(false);
    });
  };

  const waitMinVisible = async (minMs = 1200) => {
    const elapsed = Date.now() - progressStartRef.current;
    const remaining = Math.max(0, minMs - elapsed);
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  };

  const clearProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startFakeProgress = () => {
    clearProgressTimer();
    setProgressPercent(0);
    let current = 0;
    progressTimerRef.current = setInterval(() => {
      if (current < 90) {
        current += 2;
      } else if (current < 98) {
        current += 0.4;
      } else {
        current += 0.1;
      }
      if (current > 99.2) {
        current = 99.2;
      }
      setProgressPercent(current);
    }, 80);
  };

  const finishFakeProgress = () => {
    clearProgressTimer();
    setProgressPercent(100);
  };

  const handleBackupNow = async () => {
    if (backupLocked) {
      return;
    }
    try {
      setBusy(true);
      progressStartRef.current = Date.now();
      setProgressTitle('Backup in progress');
      setProgressSubtitle('Please wait...');
      openProgressModal();
      startFakeProgress();
      DeviceEventEmitter.emit('backup:manualStatus', true);
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 100));
      await runManualBackupNow({
        accountEmail,
        includeReceipts,
      });
      await loadSettings();
      await loadRecentBackups();
      setProgressTitle('Backup finished');
      setProgressSubtitle('Backup completed.');
      finishFakeProgress();
      await waitMinVisible();
      closeProgressModal();
      showToast('Backup completed to Google Drive', 'success');
    } catch (error) {
      console.error('Manual backup failed:', error);
      setProgressTitle('Backup failed');
      setProgressSubtitle('Unable to backup right now.');
      finishFakeProgress();
      await waitMinVisible();
      closeProgressModal();
      themedAlert('Backup Failed', 'Unable to backup right now.');
    } finally {
      clearProgressTimer();
      DeviceEventEmitter.emit('backup:manualStatus', false);
      setBusy(false);
    }
  };

  const handleDebugInfo = async () => {
    if (backupLocked) {
      return;
    }
    try {
      setBusy(true);
      console.log('🐛 [DEBUG] ===== Debug Info =====');

      await ensureDriveScopes();

      const firebaseUid = await AsyncStorage.getItem('firebaseUid');
      const backupFileId = await AsyncStorage.getItem('backup.fileId');
      const backupEmail = await AsyncStorage.getItem('backup.accountEmail');
      const lastBackup = await AsyncStorage.getItem('backup.lastSuccessAt');

      console.log('🐛 [DEBUG] FirebaseUid:', firebaseUid);
      console.log('🐛 [DEBUG] Backup FileId:', backupFileId);
      console.log('🐛 [DEBUG] Backup Email:', backupEmail);
      console.log('🐛 [DEBUG] Last Backup:', lastBackup);

      const files = await listAppDataFiles();

      console.log('🐛 [DEBUG] ===== End Debug Info =====');

      const fileNames = files.map(f => `${f.name} (${f.size} bytes)`).join('\n');
      themedAlert(
        'Debug Info',
        `FirebaseUid: ${firebaseUid}\n\nBackup FileId: ${backupFileId}\n\nFiles in Drive (${files.length}):\n${fileNames || 'None'}`,
        [{text: 'OK'}]
      );
    } catch (error) {
      console.error('🐛 [DEBUG] Error:', error);
      themedAlert('Debug Error', error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreBackup = async backup => {
    if (backupLocked || !backup?.id) {
      return;
    }
    themedAlert(
      'Restore Backup',
      'This will replace your current local data.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              await restoreBackupByIdFlow({fileId: backup.id});
              themedAlert('Restore Complete', 'Backup restored successfully.', [
                {
                  text: 'OK',
                  onPress: () => RNRestart.Restart(),
                },
              ]);
            } catch (restoreError) {
              console.error('Restore failed:', restoreError);
              themedAlert('Restore Failed', 'Unable to restore backup.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const formatBackupLabel = (backup, index) => {
    return index === 0 ? 'Latest Backup' : index === 1 ? '2nd Latest Backup' : '3rd Latest Backup';
  };

  const formatBackupMeta = backup => {
    const when = backup?.modifiedTime
      ? new Date(backup.modifiedTime).toLocaleString()
      : 'Unknown time';
    const size = Number(backup?.size || 0);
    const sizeLabel = size > 0
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : 'Unknown size';
    return `${when} • ${sizeLabel}`;
  };

  const backupCountOptions = BACKUP_VERSION_OPTIONS.map(option => ({
    id: String(option),
    title: `${option} ${option === 1 ? 'backup' : 'backups'}`,
    value: option,
  }));

  const backupRestoreOptions = recentBackups.map((backup, index) => ({
    id: backup.id || backup.name || String(index),
    title: formatBackupLabel(backup, index),
    subtitle: formatBackupMeta(backup),
    backup,
  }));

  return (
    <View style={styles.container}>
      <PageHeader title="Backup & Restore" onBackPress={() => navigation.goBack()} />

      <ScrollView
        style={styles.contentWrapper}
        contentContainerStyle={styles.contentContainer}
        pointerEvents={backupLocked ? 'none' : 'auto'}>
        <View style={[styles.section, backupLocked && styles.sectionInactive]}>
          <Text style={styles.sectionTitle}>Backup Account</Text>
          <View style={styles.emailDisplay}>
            <Text style={styles.emailText}>{accountEmail || 'Not selected'}</Text>
          </View>
          <Text style={styles.subText}>
            Using your sign-in email for backup
          </Text>
        </View>

        <View style={[styles.section, backupLocked && styles.sectionInactive]}>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>Auto Backup</Text>
            <ToggleSwitch
              value={backupEnabled}
              onValueChange={handleToggleBackup}
              trackColor={backupToggleTrackColor}
              thumbColor={backupToggleThumbColor(backupEnabled)}
              disabled={backupLocked}
            />
          </View>
          <Text style={styles.subText}>Backups happen automatically on data changes.</Text>
          <View style={styles.settingDivider} />
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>Receipt Photos</Text>
            <ToggleSwitch
              value={includeReceipts}
              onValueChange={handleToggleReceipts}
              trackColor={backupToggleTrackColor}
              thumbColor={backupToggleThumbColor(includeReceipts)}
              disabled={backupLocked}
            />
          </View>
          <Text style={styles.subText}>Include receipt photos in backup.</Text>
        </View>

        <View style={[styles.section, backupLocked && styles.sectionInactive]}>
          <View style={styles.row}>
            <View style={styles.selectWrap}>
              <BackupRestoreSelect
                label="Number of Backups"
                selectedId={String(backupVersionCount)}
                valueLabel={`${backupVersionCount} ${
                  backupVersionCount === 1 ? 'backup' : 'backups'
                }`}
                helperText="More backups give you more restore points but may use more Google Drive storage."
                options={backupCountOptions}
                disabled={busy || backupLocked}
                onSelect={option => handleBackupVersionChange(option.value)}
              />
            </View>
            {backupVersionSaved ? (
              <Text style={styles.savedText}>Saved</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.section, backupLocked && styles.sectionInactive]}>
          <BackupRestoreSelect
            label="Restore Backup"
            placeholder="Choose backup to restore"
            helperText="Choose a backup version to restore your app data."
            options={backupRestoreOptions}
            disabled={busy || backupLocked}
            onSelect={option => handleRestoreBackup(option.backup)}
          />
          {recentBackups.length === 0 ? (
            <Text style={styles.subText}>No backups found.</Text>
          ) : null}
          {/* <TouchableOpacity style={styles.debugButton} onPress={handleDebugInfo} disabled={busy}>
            <Text style={styles.debugText}>Show Debug Info</Text>
          </TouchableOpacity> */}
        </View>

        <View style={[styles.section, backupLocked && styles.sectionInactive]}>
          <Text style={styles.sectionTitle}>Last Backup</Text>
          <Text style={styles.subText}>{lastBackupAt || 'No backups yet'}</Text>
        </View>

        <View style={[styles.section, styles.actions, backupLocked && styles.sectionInactive]}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleBackupNow}
            disabled={busy || backupLocked}>
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryText}>Back up now</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      {backupLocked ? (
        <View style={styles.lockMessageWrap}>
          <Text style={styles.lockMessageText}>{backupLockMessage || 'Complete profile setup to use backup and restore'}</Text>
        </View>
      ) : null}

      <BackupProgressModal
        visible={progressVisible}
        progressAnim={progressAnim}
        progressPercent={progressPercent}
        title={progressTitle}
        subtitle={progressSubtitle}
      />
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: headerTexture.border,
  },
  backButton: {
    padding: 6,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
  },
  headerSpacer: {
    width: 34,
  },
  contentWrapper: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  sectionInactive: {
    opacity: 0.45,
  },
  section: {
    backgroundColor: colors.card,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  emailDisplay: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
  storageText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  rowText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  selectWrap: {
    flex: 1,
  },
  linkButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  linkText: {
    fontSize: fontSize.small,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  subText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
  settingDivider: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    height: 1,
    backgroundColor: colors.border,
  },
  actions: {
    marginBottom: spacing.sm,
  },
  lockMessageWrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  lockMessageText: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    textAlign: 'center',
    fontWeight: fontWeight.medium,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  primaryText: {
    color: colors.white,
    fontWeight: fontWeight.semibold,
  },
  secondaryButton: {
    marginTop: spacing.sm,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.text.primary,
    fontWeight: fontWeight.semibold,
  },
  savedText: {
    color: '#16A34A',
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  debugButton: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  debugText: {
    color: '#666',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.small,
  },
});

export default BackupScreen;

