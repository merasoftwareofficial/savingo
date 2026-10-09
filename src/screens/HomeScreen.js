import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useCurrencySymbol} from '../hooks/useCurrencySymbol';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth } from '../config/firebase';
import { clearLocalData } from '../services/database';
import { useFocusEffect } from '@react-navigation/native';
import {createPerfTimer, perfLog, perfNow} from '../utils/perfLogger';
import {useTheme} from '../context/ThemeContext';
import {requiresProfileSetup} from '../utils/profileReadiness';
import {readCachedSessionUser} from '../services/sessionService';
import {clearStartupStateForLogout} from '../services/startupCoordinator';
import {logout as logoutFromApi} from '../services/api';
import {
  resumeBackupQueue,
  suspendBackupQueue,
  waitForBackupQueueIdle,
} from '../utils/backupQueue';

const HomeScreen = ({ route, navigation }) => {
  const {colors} = useTheme();
  const screenMountedAtRef = useRef(perfNow());
  const [user, setUser] = useState(null);
  const [showSetupPopup, setShowSetupPopup] = useState(false);
  const [popupDismissedThisSession, setPopupDismissedThisSession] = useState(false);
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);
  const [logoutProcessing, setLogoutProcessing] = useState(false);
  const currencySymbol = useCurrencySymbol();

  useEffect(() => {
    const perf = createPerfTimer('home-screen', 'load-user');
    // Get user from params or AsyncStorage
    const loadUser = async () => {
      if (route.params?.user) {
        setUser(route.params.user);
        perf.end({source: 'route-params'});
      } else {
        const storedUser = await readCachedSessionUser();
        if (Object.keys(storedUser || {}).length > 0) {
          setUser(storedUser);
          perf.end({source: 'storage'});
        } else {
          navigation.replace('Login');
          perf.end({source: 'redirect-login'});
        }
      }
    };

    loadUser().catch(error => {
      perf.fail(error);
    });
  }, [navigation, route.params?.user]);

  useEffect(() => {
    perfLog('home-screen', 'screen-mounted');
    return () => {
      perfLog('home-screen', 'screen-unmounted', {
        aliveMs: Math.max(0, perfNow() - screenMountedAtRef.current),
      });
    };
  }, []);

  // Check setup completion status on screen focus
  useFocusEffect(
    React.useCallback(() => {
      const perf = createPerfTimer('home-screen', 'focus-setup-check');
      const checkSetupStatus = async () => {
        try {
          const userData = await readCachedSessionUser();
          if (Object.keys(userData || {}).length > 0) {
            if (requiresProfileSetup(userData) && !popupDismissedThisSession) {
              setShowSetupPopup(true);
            }
          }
          perf.end();
        } catch (error) {
          console.error('Error checking setup status:', error);
          perf.fail(error);
        }
      };

      checkSetupStatus();
    }, [popupDismissedThisSession])
  );

  const handleLogout = async () => {
    setShowLogoutPopup(true);
  };

  const confirmLogout = async () => {
    if (logoutProcessing) {
      return;
    }
    setLogoutProcessing(true);
    suspendBackupQueue({cancelQueued: true});
    const backupIdle = await waitForBackupQueueIdle();
    if (!backupIdle) {
      console.warn('Logout continuing while backup queue is still busy.');
    }
    let hadLogoutWarnings = false;
    try {
      try {
        const idToken = await auth().currentUser?.getIdToken?.();
        if (idToken) {
          await logoutFromApi(idToken);
        }
      } catch (logoutApiError) {
        hadLogoutWarnings = true;
        console.warn('Backend logout warning:', logoutApiError);
      }

      try {
        const isSignedIn = await GoogleSignin.isSignedIn();
        if (isSignedIn) {
          await GoogleSignin.signOut();
        }
      } catch (googleError) {
        hadLogoutWarnings = true;
        console.warn('Google sign-out warning:', googleError);
      }

      try {
        await auth().signOut();
      } catch (firebaseError) {
        hadLogoutWarnings = true;
        console.warn('Firebase sign-out warning:', firebaseError);
      }

      const cleanupResults = await Promise.allSettled([
        Promise.resolve(clearLocalData()),
        AsyncStorage.removeItem('user'),
      ]);
      const cleanupFailed = cleanupResults.some(
        result => result.status === 'rejected'
      );
      if (cleanupFailed) {
        hadLogoutWarnings = true;
        cleanupResults.forEach(result => {
          if (result.status === 'rejected') {
            console.warn('Home logout cleanup warning:', result.reason);
          }
        });
      }

      setShowLogoutPopup(false);
      await clearStartupStateForLogout({
        firebaseUid: user?.firebaseUid || auth().currentUser?.uid || '',
      });
      navigation.replace('Login');
      if (hadLogoutWarnings) {
        console.warn('Logged out with minor cleanup warnings.');
      }
    } catch (error) {
      console.error('Logout error:', error);
      setShowLogoutPopup(false);
      navigation.replace('Login');
    } finally {
      resumeBackupQueue();
      setLogoutProcessing(false);
    }
  };

  const handleGoToProfile = () => {
    setShowSetupPopup(false);
    navigation.navigate('MoreNative');
  };

  const handleRemindLater = () => {
    setShowSetupPopup(false);
    setPopupDismissedThisSession(true);
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.profileSection}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user.displayName?.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{user.displayName}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceAmount}>
          {currencySymbol} {user.balance || 0}
        </Text>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Add Money</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Transfer</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No transactions yet</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backup Status</Text>
        <View style={styles.backupCard}>
          <Text style={styles.backupText}>Google Drive: Connected ?</Text>
          <Text style={styles.backupSubtext}>
            Last backup: {new Date().toLocaleDateString()}
          </Text>
        </View>
      </View>

      <Modal
        visible={showLogoutPopup}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!logoutProcessing) {
            setShowLogoutPopup(false);
          }
        }}>
        <View style={[styles.modalOverlay, {backgroundColor: colors.overlay}]}>
          <TouchableOpacity
            style={styles.modalBackdropFill}
            activeOpacity={1}
            onPress={() => {
              if (!logoutProcessing) {
                setShowLogoutPopup(false);
              }
            }}
          />
          <View style={[styles.modalContainer, {backgroundColor: colors.modal}]}>
            <Text style={[styles.modalTitle, {color: colors.text.primary}]}>Logout</Text>
            <Text style={[styles.modalDescription, {color: colors.text.secondary}]}>
              Are you sure you want to logout?
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, {backgroundColor: colors.error}]}
              disabled={logoutProcessing}
              onPress={confirmLogout}>
              {logoutProcessing ? (
                <Text style={[styles.primaryButtonText, {color: colors.white}]}>Please wait...</Text>
              ) : (
                <Text style={[styles.primaryButtonText, {color: colors.white}]}>Logout</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, {backgroundColor: colors.surfaceMuted}]}
              disabled={logoutProcessing}
              onPress={() => setShowLogoutPopup(false)}>
              <Text style={[styles.secondaryButtonText, {color: colors.text.primary}]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Setup Completion Popup */}
      <Modal
        visible={showSetupPopup}
        transparent={true}
        animationType="fade"
        onRequestClose={handleRemindLater}>
        <View style={[styles.modalOverlay, {backgroundColor: colors.overlay}]}>
          <View style={[styles.modalContainer, {backgroundColor: colors.modal}]}>
            <Text style={[styles.modalTitle, {color: colors.text.primary}]}>Complete Your Profile Setup</Text>
            <Text style={[styles.modalDescription, {color: colors.text.secondary}]}>
              Please complete your profile to unlock all features and ensure data backup.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, {backgroundColor: colors.primary}]}
              onPress={handleGoToProfile}>
              <Text style={[styles.primaryButtonText, {color: colors.white}]}>Go to Profile Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, {backgroundColor: colors.surfaceMuted}]}
              onPress={handleRemindLater}>
              <Text style={[styles.secondaryButtonText, {color: colors.text.primary}]}>Remind Me Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 50,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
  },
  avatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  userInfo: {
    marginLeft: 15,
    flex: 1,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  email: {
    fontSize: 12,
    color: '#e0e0e0',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  balanceCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 25,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  emptyState: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  backupCard: {
    backgroundColor: '#e8f5e9',
    padding: 15,
    borderRadius: 8,
  },
  backupText: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '600',
    marginBottom: 5,
  },
  backupSubtext: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default HomeScreen;

