import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {spacing, fontSize, fontWeight, radius, typography} from '../utils/theme';
import {
  getLatestBackupForCurrentUser,
  restoreBackupByIdFlow,
} from '../services/backupService';
import TexturedSurface from './TexturedSurface';
import ToggleSwitch from './ui/ToggleSwitch';
import DropdownPopup from './ui/popups/DropdownPopup';
import DestructiveCaptchaModal from './DestructiveCaptchaModal';
import RNRestart from 'react-native-restart';
import SetupRequirePopup from './setuprequirepopup';
import ManualBackupButton from './ManualBackupButton';
import UploadAccountSheetWizard from './UploadAccountSheetWizard';
import {
  STRICT_ECO_CHANGED_EVENT,
  getStrictEcoSnapshot,
} from '../services/strictEcoService';
import {runStrictEcoToggleFlow} from '../services/strictEcoCoordinator';
import {getBackupProfileGateState} from '../utils/profileSetupGate';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
};

const Header = ({user}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
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
  const headerIconColor = colors.headerIcon;
  const headerTextColor = colors.headerText;
  const [strictEcoEnabled, setStrictEcoEnabled] = useState(false);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [strictEcoCaptchaVisible, setStrictEcoCaptchaVisible] = useState(false);
  const [strictEcoCaptchaConfig, setStrictEcoCaptchaConfig] = useState({
    title: 'Final Security Check',
    message: '',
    helperText: '',
    confirmLabel: 'Confirm',
    loadingLabel: 'Processing...',
  });
  const [menuVisible, setMenuVisible] = useState(false);
  const [showBackupGatePopup, setShowBackupGatePopup] = useState(false);
  const [uploadWizardVisible, setUploadWizardVisible] = useState(false);
  const [backupGateMessage, setBackupGateMessage] = useState('');
  const [backupGateUser, setBackupGateUser] = useState({});
  const [menuAnchor, setMenuAnchor] = useState({x: 0, y: 0, width: 36, height: 36});
  const menuAnim = useRef(new Animated.Value(0)).current;
  const menuButtonRef = useRef(null);
  const strictEcoCaptchaResolverRef = useRef(null);
  const {width: screenWidth} = Dimensions.get('window');
  const menuWidth = 280;
  const menuLeft = Math.min(
    Math.max(spacing.md, menuAnchor.x + menuAnchor.width - menuWidth),
    Math.max(spacing.md, screenWidth - menuWidth - spacing.md)
  );
  const menuTop = Math.max(spacing.md, menuAnchor.y + menuAnchor.height + spacing.xs);

  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.headerBg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.headerBorder,
      overflow: 'hidden',
    },
    headerMainRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 56,
    },
    leftSection: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      borderRadius: radius.pill,
      paddingVertical: 4,
      paddingLeft: 2,
      paddingRight: spacing.sm,
    },
    leftSectionPressed: {
      backgroundColor: colors.headerChip,
    },
    userInfo: {
      flex: 1,
      marginLeft: spacing.sm + 4,
      justifyContent: 'center',
    },
    userImage: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    userIconContainer: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.headerChip,
      justifyContent: 'center',
      alignItems: 'center',
    },
    greeting: {
      ...typography.caption,
      color: colors.headerSubtext,
    },
    userName: {
      ...typography.heading,
      color: headerTextColor,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: spacing.sm,
      gap: 4,
    },
    actionButtonShell: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      position: 'relative',
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    backupIconWrapper: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backupSpinner: {
      position: 'absolute',
      width: 30,
      height: 30,
    },
    menuButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuCard: {
      position: 'absolute',
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 16},
      shadowOpacity: 0.14,
      shadowRadius: 24,
      elevation: 10,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      borderRadius: 14,
    },
    menuItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: spacing.sm,
    },
    menuRowLabel: {
      fontSize: 15,
      color: colors.text.primary,
      fontWeight: fontWeight.medium,
      marginRight: spacing.sm,
      marginLeft: 12,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 10,
    },
    menuHintText: {
      fontSize: 11,
      color: colors.text.secondary,
      lineHeight: 16,
    },
    menuBusyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    menuBusyText: {
      marginLeft: 8,
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    menuStateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    menuStateLabel: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
    },
    menuStateValue: {
      fontSize: fontSize.small,
      color: colors.text.primary,
      fontWeight: fontWeight.semibold,
    },
  }), [colors, headerTextColor]);

  useEffect(() => {
    let mounted = true;
    const loadStrictEco = async () => {
      try {
        const snapshot = await getStrictEcoSnapshot();
        if (!mounted) {
          return;
        }
        setStrictEcoEnabled(Boolean(snapshot.enabled));
      } catch (error) {
        console.error('Failed to load strict eco state:', error);
      }
    };
    loadStrictEco();

    const sub = DeviceEventEmitter.addListener(
      STRICT_ECO_CHANGED_EVENT,
      payload => {
        setStrictEcoEnabled(Boolean(payload?.enabled));
      }
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const openProfile = () => {
    navigation.navigate('ProfileSettings', {
      user: user || {},
    });
  };

  const closeHeaderMenu = () => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMenuVisible(false);
    });
  };

  const showHeaderMenu = () => {
    setMenuVisible(true);
    requestAnimationFrame(() => {
      menuAnim.setValue(0);
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const openHeaderMenu = () => {
    if (menuButtonRef.current?.measureInWindow) {
      menuButtonRef.current.measureInWindow((x, y, width, height) => {
        setMenuAnchor({x, y, width, height});
        showHeaderMenu();
      });
      return;
    }
    showHeaderMenu();
  };

  const executeRestoreLatestBackup = async () => {
    try {
      const gate = await getBackupProfileGateState(user);
      if (!gate.ready) {
        setBackupGateMessage(gate.message || 'Complete profile setup to use backup and restore');
        setBackupGateUser(gate.user || {});
        setShowBackupGatePopup(true);
        return;
      }
      setRestoreRunning(true);
      const {latest} = await getLatestBackupForCurrentUser();
      if (!latest) {
        themedAlert('No Backup Found', 'No backup available in Drive.');
        return;
      }
      await restoreBackupByIdFlow({fileId: latest.id});
      themedAlert('Restore Complete', 'Backup restored successfully.', [
        {
          text: 'OK',
          onPress: () => RNRestart.Restart(),
        },
      ]);
    } catch (error) {
      console.error('Restore flow failed:', error);
      themedAlert('Restore Failed', 'Unable to restore backup.');
    } finally {
      setRestoreRunning(false);
    }
  };

  const handleRestoreLatestPress = () => {
    if (restoreRunning) {
      return;
    }
    closeHeaderMenu();
    themedAlert(
      'Restore Backup',
      'This will replace your current local data.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Restore',
          style: 'destructive',
          onPress: executeRestoreLatestBackup,
        },
      ]
    );
  };

  const handleOpenUploadAccountSheet = () => {
    closeHeaderMenu();
    setUploadWizardVisible(true);
  };

  const handleStrictEcoToggle = nextValue => {
    runStrictEcoToggleFlow({
      nextValue,
      themedAlert,
      requestDestructiveCaptcha: options =>
        new Promise(resolve => {
          strictEcoCaptchaResolverRef.current = resolve;
          setStrictEcoCaptchaConfig({
            title: options?.title || 'Final Security Check',
            message: options?.message || '',
            helperText: options?.helperText || '',
            confirmLabel: options?.confirmLabel || 'Confirm',
            loadingLabel: options?.loadingLabel || 'Processing...',
          });
          setStrictEcoCaptchaVisible(true);
        }),
      onStateChange: nextState => {
        setStrictEcoEnabled(Boolean(nextState?.enabled));
      },
    });
  };

  const closeStrictEcoCaptchaModal = React.useCallback(() => {
    if (strictEcoCaptchaResolverRef.current) {
      strictEcoCaptchaResolverRef.current(false);
      strictEcoCaptchaResolverRef.current = null;
    }
    setStrictEcoCaptchaVisible(false);
  }, []);

  const handleStrictEcoCaptchaConfirm = React.useCallback(async () => {
    if (strictEcoCaptchaResolverRef.current) {
      strictEcoCaptchaResolverRef.current(true);
      strictEcoCaptchaResolverRef.current = null;
    }
    setStrictEcoCaptchaVisible(false);
  }, []);

  const handleOpenProfileSetupFromBackupGate = () => {
    setShowBackupGatePopup(false);
    navigation.navigate('ProfileSetup', {user: backupGateUser || {}});
  };

  return (
    <TexturedSurface
      style={[
        styles.container,
        {
          marginTop: -insets.top,
          paddingTop: 42 + insets.top,
        },
      ]}>
      <View style={styles.headerMainRow}>
        <Pressable
          onPress={openProfile}
          android_ripple={{color: colors.headerChip}}
          style={({pressed}) => [styles.leftSection, pressed && styles.leftSectionPressed]}>
          {user?.photoURL ? (
            <Image source={{uri: user.photoURL}} style={styles.userImage} />
          ) : (
            <View style={styles.userIconContainer}>
              <Icon name="person" size={22} color={headerIconColor} />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.greeting} numberOfLines={1}>
              {getGreeting()}
            </Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.displayName || 'User'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.actionsRow}>
          <ManualBackupButton
            user={user}
            style={[styles.actionButtonShell, styles.backupButton]}
            iconWrapperStyle={styles.backupIconWrapper}
            spinnerStyle={styles.backupSpinner}
            iconColor={headerIconColor}
          />

          <View ref={menuButtonRef} collapsable={false}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={openHeaderMenu}
              activeOpacity={0.8}>
              <Icon name="ellipsis-vertical" size={22} color={headerIconColor} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <DropdownPopup
        visible={menuVisible}
        onClose={closeHeaderMenu}
        cardStyle={[
          styles.menuCard,
          {
            width: menuWidth,
            top: menuTop,
            left: menuLeft,
            opacity: menuAnim,
            transform: [
              {
                translateY: menuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-14, 0],
                }),
              },
            ],
          },
        ]}>
            <View style={styles.menuRow}>
              <View style={styles.menuItemLeft}>
                <Icon name="leaf-outline" size={22} color={colors.text.primary} />
                <Text style={styles.menuRowLabel}>Strict Eco system</Text>
              </View>
              <ToggleSwitch
                value={strictEcoEnabled}
                onValueChange={handleStrictEcoToggle}
              />
            </View>
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.8}
              disabled={restoreRunning}
              onPress={handleRestoreLatestPress}>
              <View style={styles.menuItemLeft}>
                <Icon
                  name="cloud-download-outline"
                  size={22}
                  color={colors.text.primary}
                />
                <Text style={styles.menuRowLabel}>Restore Last Backup</Text>
              </View>
              {restoreRunning ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Icon name="chevron-forward" size={20} color={colors.text.light} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              activeOpacity={0.8}
              disabled={restoreRunning}
              onPress={handleOpenUploadAccountSheet}>
              <View style={styles.menuItemLeft}>
                <Icon
                  name="cloud-upload-outline"
                  size={22}
                  color={colors.text.primary}
                />
                <Text style={styles.menuRowLabel}>Upload Account Sheet</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.text.light} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <Text style={styles.menuHintText}>
              Restore will replace current local data.
            </Text>
            {restoreRunning ? (
              <View style={styles.menuBusyRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.menuBusyText}>Preparing restore...</Text>
              </View>
            ) : null}
            <View style={styles.menuDivider} />
            <View style={styles.menuStateRow}>
              <Text style={styles.menuStateLabel}>Strict Eco</Text>
              <Text style={styles.menuStateValue}>
                {strictEcoEnabled ? 'ON' : 'OFF'}
              </Text>
            </View>
      </DropdownPopup>

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
      <DestructiveCaptchaModal
        visible={strictEcoCaptchaVisible}
        onClose={closeStrictEcoCaptchaModal}
        onConfirm={handleStrictEcoCaptchaConfirm}
        title={strictEcoCaptchaConfig.title}
        message={strictEcoCaptchaConfig.message}
        helperText={strictEcoCaptchaConfig.helperText}
        confirmLabel={strictEcoCaptchaConfig.confirmLabel}
        loadingLabel={strictEcoCaptchaConfig.loadingLabel}
      />
      <UploadAccountSheetWizard
        visible={uploadWizardVisible}
        onClose={() => setUploadWizardVisible(false)}
      />
    </TexturedSurface>
  );
};

export default Header;

