import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {updateProfile} from '../services/api';
import {readCachedSessionUser, writeCachedSessionUser} from '../services/sessionService';
import CurrencyPickerModal, {CURRENCIES} from '../components/CurrencyPickerModal';
import {useAppAlert} from '../context/AppAlertContext';
import {useTheme} from '../context/ThemeContext';
import {getCurrencyByCountry} from '../utils/countries';

const CURRENCY_LOCK_MESSAGE =
  'Currency is derived from country and cannot be changed after setup.';

const getCurrencyLabel = symbol => {
  const match = CURRENCIES.find(item => item.symbol === symbol);
  return match ? match.label : symbol;
};

const CurrencySetupScreen = ({navigation, route}) => {
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
  const routeUser = route.params?.user || null;
  const fromSettings = route.params?.fromSettings || false;
  const [selectedSymbol, setSelectedSymbol] = React.useState('');
  const [currentUser, setCurrentUser] = React.useState(routeUser);
  const [isLoading, setIsLoading] = React.useState(false);
  const isPostSetupCurrencyLocked =
    fromSettings || currentUser?.setupComplete === true;
  const [currencyModalVisible, setCurrencyModalVisible] = React.useState(
    !fromSettings
  );

  React.useEffect(() => {
    const loadUser = async () => {
      let user = routeUser;
      if (!user) {
        try {
          const storedUser = await readCachedSessionUser();
          if (Object.keys(storedUser || {}).length > 0) {
            user = storedUser;
          }
        } catch (error) {
          console.error('Failed to load user for currency setup:', error);
        }
      }
      if (user) {
        setCurrentUser(user);
        const derivedSymbol = getCurrencyByCountry(user?.country || 'IN');
        // Pre-select current currency if coming from settings
        if (isPostSetupCurrencyLocked) {
          setSelectedSymbol(derivedSymbol || user.currencySymbol || '₹');
        } else if (fromSettings && user.currencySymbol) {
          setSelectedSymbol(user.currencySymbol);
        }
      }
    };
    loadUser();
  }, [routeUser, fromSettings, isPostSetupCurrencyLocked]);

  React.useEffect(() => {
    if (!fromSettings && !selectedSymbol) {
      setCurrencyModalVisible(true);
    }
  }, [fromSettings, selectedSymbol]);

  const handleCurrencySelect = async currency => {
    if (isPostSetupCurrencyLocked) {
      themedAlert('Currency Locked', CURRENCY_LOCK_MESSAGE);
      setCurrencyModalVisible(false);
      return;
    }
    if (!currency) {
      return;
    }
    const symbol = currency.symbol;
    setSelectedSymbol(symbol);
    setCurrencyModalVisible(false);
    setIsLoading(true);
    try {
      const storedUser = currentUser
        ? currentUser
        : await readCachedSessionUser();

      const firebaseUid =
        storedUser?.firebaseUid || (await AsyncStorage.getItem('firebaseUid'));

      if (!firebaseUid) {
        themedAlert('Error', 'User authentication error. Please login again.');
        setIsLoading(false);
        return;
      }

      // Save currency to backend
      const response = await updateProfile(firebaseUid, {
        displayName: storedUser.displayName || storedUser.name || storedUser.email?.split('@')[0] || 'User',
        currencySymbol: symbol,
      });

      if (!response?.success) {
        themedAlert('Error', response?.message || 'Failed to save currency');
        setIsLoading(false);
        return;
      }

      const updatedUser = {
        ...storedUser,
        ...response.user,
        currencySymbol: symbol,
      };
      await writeCachedSessionUser(updatedUser);

      if (fromSettings) {
        // Go back to More screen
        navigation.goBack();
      } else {
        // Initial setup - go to ProfileSetup
        navigation.replace('ProfileSetup', {user: updatedUser});
      }
    } catch (error) {
      console.error('Failed to save currency selection:', error);
      themedAlert('Error', 'Failed to save currency. Please try again.');
      if (!fromSettings) {
        setCurrencyModalVisible(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {fromSettings && (
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerBarTitle}>Currency Sign</Text>
          <View style={styles.backButton} />
        </View>
      )}
      <View style={styles.header}>
        {!fromSettings && <Text style={styles.title}>Select Currency</Text>}
        <Text style={styles.subtitle}>
          {fromSettings
            ? 'Currency follows your selected country.'
            : 'Choose the currency you want to use in the app.'}
        </Text>
      </View>

      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={styles.selectorRow}
          onPress={() => {
            if (isPostSetupCurrencyLocked) {
              themedAlert('Currency Locked', CURRENCY_LOCK_MESSAGE);
              return;
            }
            setCurrencyModalVisible(true);
          }}
          disabled={isLoading || isPostSetupCurrencyLocked}>
          <View style={styles.selectorLeft}>
            <View style={styles.selectorSymbol}>
              <Text style={styles.selectorSymbolText}>
                {selectedSymbol || '₹'}
              </Text>
            </View>
            <Text style={styles.selectorLabel}>
              {selectedSymbol
                ? `${selectedSymbol} ${getCurrencyLabel(selectedSymbol)}`
                : 'Select a currency'}
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.text.light} />
        </TouchableOpacity>
      </View>

      <CurrencyPickerModal
        visible={currencyModalVisible}
        onClose={() => setCurrencyModalVisible(false)}
        onSelect={handleCurrencySelect}
        currentSymbol={selectedSymbol}
        isSaving={isLoading}
      />
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingBottom: spacing.lg,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBarTitle: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xlarge,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.medium,
    color: colors.text.secondary,
  },
  selectorContainer: {
    paddingHorizontal: spacing.md,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectorSymbol: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorSymbolText: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
  },
  selectorLabel: {
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
});

export default CurrencySetupScreen;

