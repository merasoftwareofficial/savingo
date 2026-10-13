import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {spacing, fontSize, fontWeight, headerTexture} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {queueBackupFromStorage} from '../utils/backupQueue';
import BottomSheet from '../components/BottomSheet';
import PageHeader from '../components/ui/PageHeader';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import DestructiveCaptchaModal from '../components/DestructiveCaptchaModal';
import {getStrictEcoSnapshot} from '../services/strictEcoService';
import {runStrictEcoToggleFlow} from '../services/strictEcoCoordinator';
import {resetDashboardData} from '../services/dashboardResetService';
import {publishAccountsChanged} from '../services/accountsChangeBus';
import {
  DEFAULT_TAB_FALLBACK,
  getDefaultTabLabel,
  readDefaultTabPreference,
} from '../utils/defaultTabPreference';
import DefaultTabSheet from '../components/DefaultTabSheet';

const MONTH_START_DAY_KEY = 'monthStartDay';
const DASHBOARD_SHOW_SAVINGS_BALANCE_KEY = 'dashboard_show_savings_balance_in_net';
const DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY = 'dashboard_hide_saving_accounts';
const MONTH_START_DAY_OPTIONS = Array.from({length: 28}, (_, index) => index + 1);

const COMMON_SETTINGS = [
  {id: 'language', title: 'Language', icon: 'globe-outline'},
  {id: 'notifications', title: 'Notifications', icon: 'notifications-outline'},
  {id: 'privacy', title: 'Privacy', icon: 'lock-closed-outline'},
];

const COLOR_SCHEME_OPTIONS = [
  {label: 'Light', value: 'light', icon: 'sunny-outline'},
  {label: 'Dark', value: 'dark', icon: 'moon-outline'},
  {label: 'System (Auto)', value: 'system', icon: 'phone-portrait-outline'},
];

const SettingsScreen = ({navigation}) => {
  const {colors, themePreference, setThemePreference} = useTheme();
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
  const [darkModeModalVisible, setDarkModeModalVisible] = React.useState(false);
  const [monthStartDay, setMonthStartDay] = React.useState(1);
  const [monthStartModalVisible, setMonthStartModalVisible] = React.useState(false);
  const [defaultTab, setDefaultTab] = React.useState(DEFAULT_TAB_FALLBACK);
  const [defaultTabModalVisible, setDefaultTabModalVisible] = React.useState(false);
  const [strictEcoEnabled, setStrictEcoEnabled] = React.useState(true);
  const [showSavingsBalanceInDashboard, setShowSavingsBalanceInDashboard] =
    React.useState(true);
  const [hideSavingAccountOnDashboard, setHideSavingAccountOnDashboard] =
    React.useState(false);
  const [resetModalVisible, setResetModalVisible] = React.useState(false);
  const [isResettingDashboard, setIsResettingDashboard] = React.useState(false);
  const [strictEcoCaptchaVisible, setStrictEcoCaptchaVisible] = React.useState(false);
  const [strictEcoCaptchaConfig, setStrictEcoCaptchaConfig] = React.useState({
    title: 'Final Security Check',
    message: '',
    helperText: '',
    confirmLabel: 'Confirm',
    loadingLabel: 'Processing...',
  });
  const strictEcoCaptchaResolverRef = React.useRef(null);
  const settingsToggleTrackColor = React.useMemo(
    () => ({false: '#D1D5DB', true: '#86EFAC'}),
    [],
  );
  const settingsToggleThumbColor = React.useCallback(
    enabled => (enabled ? '#16A34A' : '#F9FAFB'),
    [],
  );

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(MONTH_START_DAY_KEY);
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 28) {
          setMonthStartDay(parsed);
        } else {
          setMonthStartDay(1);
        }

        const strictSnapshot = await getStrictEcoSnapshot();
        setStrictEcoEnabled(Boolean(strictSnapshot.enabled));

        const showSavingsStored = await AsyncStorage.getItem(
          DASHBOARD_SHOW_SAVINGS_BALANCE_KEY,
        );
        setShowSavingsBalanceInDashboard(showSavingsStored !== '0');

        const hideSavingsStored = await AsyncStorage.getItem(
          DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY,
        );
        setHideSavingAccountOnDashboard(hideSavingsStored === '1');

        const storedDefaultTab = await readDefaultTabPreference();
        setDefaultTab(storedDefaultTab);
      } catch (error) {
        console.error('Failed to load settings:', error);
        setStrictEcoEnabled(true);
        setShowSavingsBalanceInDashboard(true);
        setHideSavingAccountOnDashboard(false);
        setDefaultTab(DEFAULT_TAB_FALLBACK);
      }
    };
    const handleFocus = () => {
      loadSettings();
    };
    const unsubscribe = navigation.addListener('focus', handleFocus);
    handleFocus();
    return unsubscribe;
  }, [navigation]);

  const handleMonthStartSelect = async day => {
    setMonthStartDay(day);
    setMonthStartModalVisible(false);
    try {
      await AsyncStorage.setItem(MONTH_START_DAY_KEY, String(day));
      queueBackupFromStorage();
    } catch (error) {
      console.error('Failed to save month start day:', error);
    }
  };

  const handleToggleHideSavingAccount = async nextValue => {
    const previousValue = hideSavingAccountOnDashboard;
    setHideSavingAccountOnDashboard(nextValue);
    try {
      await AsyncStorage.setItem(
        DASHBOARD_HIDE_SAVING_ACCOUNTS_KEY,
        nextValue ? '1' : '0',
      );
      queueBackupFromStorage();
      publishAccountsChanged({
        reason: 'dashboard-preferences-changed',
        changeTypes: ['preferences-changed'],
        source: 'settings-hide-saving-toggle',
      });
    } catch (error) {
      console.error('Failed to save hide saving account setting:', error);
      setHideSavingAccountOnDashboard(previousValue);
      themedAlert('Error', 'Failed to update setting.');
    }
  };

  const handleToggleShowSavingsBalance = async nextValue => {
    const previousValue = showSavingsBalanceInDashboard;
    setShowSavingsBalanceInDashboard(nextValue);
    try {
      await AsyncStorage.setItem(
        DASHBOARD_SHOW_SAVINGS_BALANCE_KEY,
        nextValue ? '1' : '0',
      );
      queueBackupFromStorage();
      publishAccountsChanged({
        reason: 'dashboard-preferences-changed',
        changeTypes: ['preferences-changed'],
        source: 'settings-show-balance-toggle',
      });
    } catch (error) {
      console.error('Failed to save dashboard savings visibility setting:', error);
      setShowSavingsBalanceInDashboard(previousValue);
      themedAlert('Error', 'Failed to update setting.');
    }
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
      onPersistSuccess: () => {
        queueBackupFromStorage();
      },
    });
  };

  const openResetDashboardFlow = () => {
    themedAlert(
      'Reset All Accounts Data?',
      'This action will permanently remove all accounts financial data. Ledger data will NOT be deleted.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            themedAlert(
              'Final Warning',
              'This will delete all Accounts, Transactions, Recurring schedules, and All Accounts preferences. Login and Ledger will remain safe.',
              [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Proceed',
                  style: 'destructive',
                  onPress: () => {
                    setResetModalVisible(true);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const closeResetModal = () => {
    if (isResettingDashboard) {
      return;
    }
    setResetModalVisible(false);
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

  const handleResetDashboardConfirm = async () => {
    setIsResettingDashboard(true);
    try {
      await resetDashboardData();
      publishAccountsChanged({
        reason: 'dashboard-reset',
        source: 'settings-dashboard-reset',
        changeTypes: [
          'accounts-reset',
          'transactions-reset',
          'recurring-reset',
          'preferences-reset',
        ],
      });
      setMonthStartDay(1);
      setShowSavingsBalanceInDashboard(true);
      setHideSavingAccountOnDashboard(false);
      setResetModalVisible(false);
      themedAlert(
        'Reset Complete',
        'All Accounts data has been reset successfully. Ledger data is unchanged.'
      );
    } catch (error) {
      themedAlert('Reset Failed', 'Unable to reset all accounts data right now.');
    } finally {
      setIsResettingDashboard(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Settings" onBackPress={() => navigation.goBack()} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {/* <View style={styles.section}>
          <Text style={styles.sectionTitle}>Common Settings</Text>
          {COMMON_SETTINGS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.settingRow}
              onPress={() => themedAlert('Coming Soon', `${item.title} setting`)}>
              <View style={styles.settingLeft}>
                <Icon name={item.icon} size={22} color={colors.text.primary} />
                <Text style={styles.settingText}>{item.title}</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.text.light} />
            </TouchableOpacity>
          ))}
        </View> */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System</Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setDefaultTabModalVisible(true)}>
            <View style={styles.settingLeft}>
              <Icon name="albums-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Default Tab</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>{getDefaultTabLabel(defaultTab)}</Text>
              <Icon name="chevron-forward" size={20} color={colors.text.light} />
            </View>
          </TouchableOpacity>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Icon name="leaf-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Strict Eco system</Text>
            </View>
            <ToggleSwitch
              value={strictEcoEnabled}
              onValueChange={handleStrictEcoToggle}
              trackColor={settingsToggleTrackColor}
              thumbColor={settingsToggleThumbColor(strictEcoEnabled)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setMonthStartModalVisible(true)}>
            <View style={styles.settingLeft}>
              <Icon name="calendar-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Quick Period</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>Day {monthStartDay}</Text>
              <Icon name="chevron-forward" size={20} color={colors.text.light} />
            </View>
          </TouchableOpacity>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Icon name="wallet-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Show savings balance in dashboard</Text>
            </View>
            <ToggleSwitch
              value={showSavingsBalanceInDashboard}
              onValueChange={handleToggleShowSavingsBalance}
              trackColor={settingsToggleTrackColor}
              thumbColor={settingsToggleThumbColor(showSavingsBalanceInDashboard)}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Icon name="eye-off-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Hide Saving Account</Text>
            </View>
            <ToggleSwitch
              value={hideSavingAccountOnDashboard}
              onValueChange={handleToggleHideSavingAccount}
              trackColor={settingsToggleTrackColor}
              thumbColor={settingsToggleThumbColor(hideSavingAccountOnDashboard)}
            />
          </View>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={openResetDashboardFlow}>
            <View style={styles.settingLeft}>
              <Icon name="warning-outline" size={22} color="#B91C1C" />
              <Text style={styles.settingTextDanger}>Reset All Accounts Data</Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#B91C1C" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => navigation.navigate('ThemeSettings')}>
            <View style={styles.settingLeft}>
              <Icon name="images-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Theme</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={colors.text.light} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setDarkModeModalVisible(true)}>
            <View style={styles.settingLeft}>
              <Icon name="moon-outline" size={22} color={colors.text.primary} />
              <Text style={styles.settingText}>Dark Mode</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>
                {COLOR_SCHEME_OPTIONS.find(o => o.value === themePreference)?.label || 'System (Auto)'}
              </Text>
              <Icon name="chevron-forward" size={20} color={colors.text.light} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomSheet
        visible={darkModeModalVisible}
        onClose={() => setDarkModeModalVisible(false)}>
        <View style={styles.sheetHeaderCentered}>
          <Text style={styles.sheetTitleCentered}>Dark Mode</Text>
        </View>
        {COLOR_SCHEME_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={styles.sheetOptionRow}
            onPress={() => {
              setThemePreference(option.value);
              setDarkModeModalVisible(false);
            }}>
            <View style={styles.settingLeft}>
              <Icon name={option.icon} size={20} color={colors.text.primary} />
              <Text style={styles.sheetOptionText}>{option.label}</Text>
            </View>
            {themePreference === option.value && (
              <Icon name="checkmark" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}
        <View style={styles.sheetBottomPad} />
      </BottomSheet>

      <BottomSheet
        visible={monthStartModalVisible}
        onClose={() => setMonthStartModalVisible(false)}>
        <View style={styles.sheetHeaderCentered}>
          <Text style={styles.sheetTitleCentered}>Quick Period Reset Day</Text>
        </View>
        <View style={styles.dayGridContainer}>
          <View style={styles.dayGrid}>
          {MONTH_START_DAY_OPTIONS.map(day => {
            const isActive = day === monthStartDay;
            return (
              <View key={day} style={styles.dayCell}>
                <TouchableOpacity
                  style={[
                    styles.dayButton,
                    isActive && styles.dayButtonActive,
                  ]}
                  onPress={() => handleMonthStartSelect(day)}>
                  <Text
                    style={[styles.dayText, isActive && styles.dayTextActive]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          </View>
        </View>
      </BottomSheet>

      <DefaultTabSheet
        visible={defaultTabModalVisible}
        value={defaultTab}
        onClose={() => setDefaultTabModalVisible(false)}
        onChanged={setDefaultTab}
      />

      <DestructiveCaptchaModal
        visible={resetModalVisible}
        onClose={closeResetModal}
        onConfirm={handleResetDashboardConfirm}
        loading={isResettingDashboard}
        title="Final Security Check"
        message="This will remove all accounts data only."
        helperText="Ledger and login data will remain safe."
        confirmLabel="Reset Now"
        loadingLabel="Resetting..."
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
    elevation: 2,
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: headerTexture.title,
  },
  headerSpacer: {
    width: 34,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  section: {
    backgroundColor: colors.card,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.card,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  settingText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
    flex: 1,
    flexWrap: 'wrap',
  },
  settingTextDanger: {
    fontSize: fontSize.regular,
    color: '#B91C1C',
    fontWeight: fontWeight.semibold,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  settingValue: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
  },
  sheetHeaderCentered: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  sheetTitleCentered: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetOptionText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
  },
  sheetBottomPad: {
    height: spacing.md,
  },
  dayGridContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    padding: 4,
  },
  dayButton: {
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  dayButtonActive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  dayText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  dayTextActive: {
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});

export default SettingsScreen;
