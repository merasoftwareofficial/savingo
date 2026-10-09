import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {colors, spacing, fontSize, fontWeight} from '../utils/theme';
import {notificationSettingsService} from '../services/notificationSettings';
import NotificationToggle from '../components/NotificationToggle';
import TimePicker from '../components/TimePicker';
import {notificationService} from '../services/NotificationService';
import {useAppAlert} from '../context/AppAlertContext';

const NotificationSettingsScreen = ({navigation}) => {
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
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lowBalanceThresholdText, setLowBalanceThresholdText] = useState('1000');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const loaded = await notificationSettingsService.getSettings();
      setSettings(loaded);
      setLowBalanceThresholdText(
        loaded.categories.lowBalance.threshold.toString(),
      );
      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  };

  const updateSetting = async (path, value) => {
    const updated = JSON.parse(JSON.stringify(settings));
    const keys = path.split('.');
    let obj = updated;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;

    setSettings(updated);
    await notificationSettingsService.saveSettings(updated);
  };

  const handleTestNotification = async () => {
    await notificationService.requestPermissions();
    await notificationService.showLocalNotification(
      'Test Notification',
      'This is a test notification from Savingo!',
    );
  };

  const handleResetToDefaults = () => {
    themedAlert(
      'Reset to Defaults',
      'Are you sure you want to reset all notification settings to defaults?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          onPress: async () => {
            await notificationSettingsService.resetToDefaults();
            await loadSettings();
            themedAlert('Success', 'Settings reset to defaults');
          },
        },
      ],
    );
  };

  const handleSaveLowBalanceThreshold = async () => {
    const threshold = parseInt(lowBalanceThresholdText) || 1000;
    await updateSetting('categories.lowBalance.threshold', threshold);
  };

  if (loading || !settings) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back">
            <Icon name="chevron-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notification Settings</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back">
          <Icon name="chevron-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* GLOBAL SETTINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Global Settings</Text>
          <View style={styles.sectionContent}>
            <NotificationToggle
              label="Enable Notifications"
              icon="notifications-outline"
              enabled={settings.enableAll}
              onToggle={value => updateSetting('enableAll', value)}
            />
            <NotificationToggle
              label="Sound"
              icon="volume-high-outline"
              enabled={settings.sound}
              onToggle={value => updateSetting('sound', value)}
            />
            <NotificationToggle
              label="Vibration"
              icon="phone-portrait-outline"
              enabled={settings.vibration}
              onToggle={value => updateSetting('vibration', value)}
            />
            <NotificationToggle
              label="Show Preview"
              icon="eye-outline"
              enabled={settings.showPreview}
              onToggle={value => updateSetting('showPreview', value)}
            />
          </View>
        </View>

        {/* QUIET HOURS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quiet Hours</Text>
          <View style={styles.sectionContent}>
            <NotificationToggle
              label="Enable Quiet Hours"
              icon="moon-outline"
              enabled={settings.quietHoursEnabled}
              onToggle={value => updateSetting('quietHoursEnabled', value)}
            />
            {settings.quietHoursEnabled && (
              <>
                <TimePicker
                  value={settings.quietHoursStart}
                  onTimeChange={value =>
                    updateSetting('quietHoursStart', value)
                  }
                  label="From"
                />
                <TimePicker
                  value={settings.quietHoursEnd}
                  onTimeChange={value => updateSetting('quietHoursEnd', value)}
                  label="To"
                />
              </>
            )}
          </View>
        </View>

        {/* NOTIFICATION CATEGORIES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Categories</Text>
          <View style={styles.sectionContent}>
            {/* Transactions */}
            <NotificationToggle
              label="Transactions"
              icon="wallet-outline"
              enabled={settings.categories.transactions.enabled}
              onToggle={value =>
                updateSetting('categories.transactions.enabled', value)
              }
            />
            {settings.categories.transactions.enabled && (
              <View style={styles.subSettings}>
                <NotificationToggle
                  label="Sound"
                  icon="volume-high-outline"
                  enabled={settings.categories.transactions.sound}
                  onToggle={value =>
                    updateSetting('categories.transactions.sound', value)
                  }
                />
                <NotificationToggle
                  label="Vibration"
                  icon="phone-portrait-outline"
                  enabled={settings.categories.transactions.vibration}
                  onToggle={value =>
                    updateSetting('categories.transactions.vibration', value)
                  }
                />
              </View>
            )}

            {/* Bills & Reminders */}
            <NotificationToggle
              label="Bills & Reminders"
              icon="receipt-outline"
              enabled={settings.categories.billsReminders.enabled}
              onToggle={value =>
                updateSetting('categories.billsReminders.enabled', value)
              }
            />
            {settings.categories.billsReminders.enabled && (
              <View style={styles.subSettings}>
                <NotificationToggle
                  label="Sound"
                  icon="volume-high-outline"
                  enabled={settings.categories.billsReminders.sound}
                  onToggle={value =>
                    updateSetting('categories.billsReminders.sound', value)
                  }
                />
                <NotificationToggle
                  label="Vibration"
                  icon="phone-portrait-outline"
                  enabled={settings.categories.billsReminders.vibration}
                  onToggle={value =>
                    updateSetting('categories.billsReminders.vibration', value)
                  }
                />
              </View>
            )}

            {/* Budget Alerts */}
            <NotificationToggle
              label="Budget Alerts"
              icon="pie-chart-outline"
              enabled={settings.categories.budgetAlerts.enabled}
              onToggle={value =>
                updateSetting('categories.budgetAlerts.enabled', value)
              }
            />
            {settings.categories.budgetAlerts.enabled && (
              <View style={styles.subSettings}>
                <NotificationToggle
                  label="Sound"
                  icon="volume-high-outline"
                  enabled={settings.categories.budgetAlerts.sound}
                  onToggle={value =>
                    updateSetting('categories.budgetAlerts.sound', value)
                  }
                />
                <NotificationToggle
                  label="Vibration"
                  icon="phone-portrait-outline"
                  enabled={settings.categories.budgetAlerts.vibration}
                  onToggle={value =>
                    updateSetting('categories.budgetAlerts.vibration', value)
                  }
                />
              </View>
            )}

            {/* Low Balance Alerts */}
            <NotificationToggle
              label="Low Balance Alerts"
              icon="alert-circle-outline"
              enabled={settings.categories.lowBalance.enabled}
              onToggle={value =>
                updateSetting('categories.lowBalance.enabled', value)
              }
            />
            {settings.categories.lowBalance.enabled && (
              <View style={styles.subSettings}>
                <NotificationToggle
                  label="Sound"
                  icon="volume-high-outline"
                  enabled={settings.categories.lowBalance.sound}
                  onToggle={value =>
                    updateSetting('categories.lowBalance.sound', value)
                  }
                />
                <NotificationToggle
                  label="Vibration"
                  icon="phone-portrait-outline"
                  enabled={settings.categories.lowBalance.vibration}
                  onToggle={value =>
                    updateSetting('categories.lowBalance.vibration', value)
                  }
                />
                <View style={styles.thresholdContainer}>
                  <Text style={styles.thresholdLabel}>Alert Threshold (₹)</Text>
                  <View style={styles.thresholdInputContainer}>
                    <TextInput
                      style={styles.thresholdInput}
                      value={lowBalanceThresholdText}
                      onChangeText={setLowBalanceThresholdText}
                      keyboardType="number-pad"
                      placeholder="1000"
                    />
                    <TouchableOpacity
                      style={styles.thresholdButton}
                      onPress={handleSaveLowBalanceThreshold}>
                      <Text style={styles.thresholdButtonText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Backup Alerts */}
            <NotificationToggle
              label="Backup Alerts"
              icon="cloud-upload-outline"
              enabled={settings.categories.backupAlerts.enabled}
              onToggle={value =>
                updateSetting('categories.backupAlerts.enabled', value)
              }
            />
            {settings.categories.backupAlerts.enabled && (
              <View style={styles.subSettings}>
                <NotificationToggle
                  label="Sound"
                  icon="volume-high-outline"
                  enabled={settings.categories.backupAlerts.sound}
                  onToggle={value =>
                    updateSetting('categories.backupAlerts.sound', value)
                  }
                />
                <NotificationToggle
                  label="Vibration"
                  icon="phone-portrait-outline"
                  enabled={settings.categories.backupAlerts.vibration}
                  onToggle={value =>
                    updateSetting('categories.backupAlerts.vibration', value)
                  }
                />
              </View>
            )}
          </View>
        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleTestNotification}>
            <Icon name="send-outline" size={20} color={colors.white} />
            <Text style={styles.actionButtonText}>Send Test Notification</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.resetButton]}
            onPress={handleResetToDefaults}>
            <Icon name="refresh-outline" size={20} color={colors.error} />
            <Text style={[styles.actionButtonText, styles.resetButtonText]}>
              Reset to Defaults
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
    textTransform: 'uppercase',
  },
  sectionContent: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md,
    borderRadius: 8,
    overflow: 'hidden',
  },
  subSettings: {
    backgroundColor: '#F9F9F9',
    marginLeft: spacing.lg,
  },
  thresholdContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#F9F9F9',
  },
  thresholdLabel: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  thresholdInputContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thresholdInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.regular,
    color: colors.text.primary,
  },
  thresholdButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
    justifyContent: 'center',
  },
  thresholdButtonText: {
    color: colors.white,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  actionButtonText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  resetButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.error,
  },
  resetButtonText: {
    color: colors.error,
  },
  bottomPadding: {
    height: spacing.lg,
  },
});

export default NotificationSettingsScreen;

