import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  DeviceEventEmitter,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {useNavigation} from '@react-navigation/native';
import {runManualBackupNow} from '../services/backupService';
import {getBackupProfileGateState} from '../utils/profileSetupGate';
import {AUTO_BACKUP_STATUS_EVENT} from '../utils/backupQueue';
import {useToast} from '../hooks/useToast';
import SetupRequirePopup from './setuprequirepopup';
import BackupProgressModal from './BackupProgressModal';

const ManualBackupButton = ({
  user,
  iconColor = '#FFFFFF',
  iconSize = 24,
  style,
  iconWrapperStyle,
  spinnerStyle,
  activeOpacity = 0.85,
}) => {
  const navigation = useNavigation();
  const {showToast} = useToast();
  const [backupRunning, setBackupRunning] = useState(false);
  const [autoBackupRunning, setAutoBackupRunning] = useState(false);
  const [showBackupGatePopup, setShowBackupGatePopup] = useState(false);
  const [backupGateMessage, setBackupGateMessage] = useState('');
  const [backupGateUser, setBackupGateUser] = useState({});
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressTitle, setProgressTitle] = useState('Backup in progress');
  const [progressSubtitle, setProgressSubtitle] = useState('Please wait...');
  const [progressPercent, setProgressPercent] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressStartRef = useRef(0);
  const progressTimerRef = useRef(null);

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

  const waitMinVisible = async (minMs = 1200) => {
    const elapsed = Date.now() - progressStartRef.current;
    const remaining = Math.max(0, minMs - elapsed);
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  };

  const handleOpenProfileSetupFromBackupGate = () => {
    setShowBackupGatePopup(false);
    navigation.navigate('ProfileSetup', {user: backupGateUser || {}});
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      AUTO_BACKUP_STATUS_EVENT,
      active => setAutoBackupRunning(Boolean(active)),
    );
    return () => sub.remove();
  }, []);

  const handlePress = async () => {
    if (backupRunning || autoBackupRunning) {
      return;
    }
    const gate = await getBackupProfileGateState(user);
    if (!gate.ready) {
      setBackupGateMessage(gate.message || 'Complete profile setup to use backup and restore');
      setBackupGateUser(gate.user || {});
      setShowBackupGatePopup(true);
      return;
    }

    try {
      setBackupRunning(true);
      DeviceEventEmitter.emit('backup:manualStatus', true);
      progressStartRef.current = Date.now();
      setProgressTitle('Backup in progress');
      setProgressSubtitle('Please wait...');
      openProgressModal();
      startFakeProgress();
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 100));
      await runManualBackupNow();
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
    } finally {
      clearProgressTimer();
      DeviceEventEmitter.emit('backup:manualStatus', false);
      setBackupRunning(false);
    }
  };

  return (
    <>
      <TouchableOpacity style={style} onPress={handlePress} activeOpacity={activeOpacity}>
        <View style={iconWrapperStyle}>
          <Feather name="save" size={iconSize} color={iconColor} />
          {backupRunning || autoBackupRunning ? (
            <ActivityIndicator size="small" color={iconColor} style={spinnerStyle} />
          ) : null}
        </View>
      </TouchableOpacity>

      <BackupProgressModal
        visible={progressVisible}
        progressAnim={progressAnim}
        progressPercent={progressPercent}
        title={progressTitle}
        subtitle={progressSubtitle}
      />

      <SetupRequirePopup
        visible={showBackupGatePopup}
        title="Complete your basic details"
        description={backupGateMessage || 'Username is required'}
        primaryText="Update Profile Setup"
        secondaryText="Remind me later"
        onPrimaryPress={handleOpenProfileSetupFromBackupGate}
        onSecondaryPress={() => setShowBackupGatePopup(false)}
        onClose={() => setShowBackupGatePopup(false)}
      />
    </>
  );
};

export default ManualBackupButton;
