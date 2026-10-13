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
import {spacing, radius, typography} from '../utils/theme';
import Card from '../components/ui/Card';
import ListRow from '../components/ui/ListRow';
import SectionHeader from '../components/ui/SectionHeader';
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
        <SectionHeader title="System" />
        <Card padded={false} style={styles.group}>
          <ListRow
            icon="albums-outline"
            title="Default tab"
            value={getDefaultTabLabel(defaultTab)}
            chevron
            divider
            onPress={() => setDefaultTabModalVisible(true)}
          />
          <ListRow
            icon="leaf-outline"
            title="Strict Eco system"
            subtitle="Save battery and data in the background"
            trailing={
              <ToggleSwitch value={strictEcoEnabled} onValueChange={handleStrictEcoToggle} />
            }
          />
        </Card>

        <SectionHeader title="Dashboard" />
        <Card padded={false} style={styles.group}>
          <ListRow
            icon="calendar-outline"
            title="Quick period reset day"
            value={`Day ${monthStartDay}`}
            chevron
            divider
            onPress={() => setMonthStartModalVisible(true)}
          />
          <ListRow
            icon="wallet-outline"
            title="Show savings balance"
            subtitle="Include savings in the dashboard net balance"
            divider
            trailing={
              <ToggleSwitch
                value={showSavingsBalanceInDashboard}
                onValueChange={handleToggleShowSavingsBalance}
              />
            }
          />
          <ListRow
            icon="eye-off-outline"
            title="Hide saving accounts"
            trailing={
              <ToggleSwitch
                value={hideSavingAccountOnDashboard}
                onValueChange={handleToggleHideSavingAccount}
              />
            }
          />
        </Card>

        <SectionHeader title="Appearance" />
        <Card padded={false} style={styles.group}>
          <ListRow
            icon="contrast-outline"
            title="Theme"
            value={
              COLOR_SCHEME_OPTIONS.find(o => o.value === themePreference)?.label ||
              'System (Auto)'
            }
            chevron
            onPress={() => setDarkModeModalVisible(true)}
          />
        </Card>

        <SectionHeader title="Danger zone" />
        <Card padded={false} style={styles.group}>
          <ListRow
            icon="warning-outline"
            title="Reset all accounts data"
            subtitle="Ledger and login data stay safe"
            danger
            chevron
            onPress={openResetDashboardFlow}
          />
        </Card>
      </ScrollView>

      <BottomSheet
        visible={darkModeModalVisible}
        onClose={() => setDarkModeModalVisible(false)}
        title="Theme">
        <View style={styles.sheetList}>
          {COLOR_SCHEME_OPTIONS.map((option, index) => {
            const isActive = themePreference === option.value;
            return (
              <ListRow
                key={option.value}
                icon={option.icon}
                iconColor={isActive ? colors.onPrimary : colors.text.secondary}
                iconBackground={isActive ? colors.primary : colors.card}
                title={option.label}
                divider={index < COLOR_SCHEME_OPTIONS.length - 1}
                onPress={() => {
                  setThemePreference(option.value);
                  setDarkModeModalVisible(false);
                }}
                trailing={
                  <Icon
                    name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isActive ? colors.primary : colors.text.light}
                  />
                }
              />
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={monthStartModalVisible}
        onClose={() => setMonthStartModalVisible(false)}
        title="Quick period reset day"
        subtitle="Monthly periods start on this day">
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  group: {
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  sheetList: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  dayGridContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  dayButtonActive: {
    backgroundColor: colors.primary,
  },
  dayText: {
    ...typography.label,
    color: colors.text.primary,
  },
  dayTextActive: {
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

export default SettingsScreen;
