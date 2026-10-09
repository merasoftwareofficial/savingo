import React from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BsCashCoin from './icons/BsCashCoin';
import {
  createAccount,
  getEarningAccountsCount,
  isAccountNameExists,
  setPrimaryAccount,
} from '../services/accountsDatabase';
import {colors, spacing, fontSize, fontWeight} from '../utils/theme';

const ACCOUNT_ICONS = [
  {id: 'wallet', name: 'wallet-outline'},
  {id: 'cash', name: 'bs-cash-coin'},
  {id: 'home', name: 'home-outline'},
  {id: 'car', name: 'car-outline'},
  {id: 'restaurant', name: 'restaurant-outline'},
  {id: 'group', name: 'people-outline'},
];

const ACCOUNT_COLORS = [
  {id: 'blue', value: '#60A5FA'},
  {id: 'cyan', value: '#22D3EE'},
  {id: 'teal', value: '#2DD4BF'},
  {id: 'pink', value: '#F472B6'},
  {id: 'orange', value: '#FB923C'},
  {id: 'yellow', value: '#FACC15'},
];

const renderAccountIcon = (iconName, size, color) => {
  if (iconName === 'bs-cash-coin') {
    return <BsCashCoin size={size} color={color} />;
  }
  return <Icon name={iconName} size={size} color={color} />;
};

const {height} = Dimensions.get('window');

const AddAccountModal = ({visible, onClose, onSuccess}) => {
  const [accountName, setAccountName] = React.useState('');
  const [accountType, setAccountType] = React.useState('earning');
  const [loading, setLoading] = React.useState(false);
  const [earningCount, setEarningCount] = React.useState(0);
  const [isFirstTime, setIsFirstTime] = React.useState(true);
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [selectedIcon, setSelectedIcon] = React.useState(ACCOUNT_ICONS[0].name);
  const [selectedColor, setSelectedColor] = React.useState(
    ACCOUNT_COLORS[0].value,
  );
  const [keyboardPadding, setKeyboardPadding] = React.useState(0);
  const [iconPickerVisible, setIconPickerVisible] = React.useState(false);
  const [colorPickerVisible, setColorPickerVisible] = React.useState(false);
  const earningRemaining = Math.max(0, 2 - earningCount);
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const accountNameInputRef = React.useRef(null);
  const colorCycleIndexRef = React.useRef(-1);
  const lastRandomIconRef = React.useRef(null);

  const pickRandomIcon = () => {
    if (ACCOUNT_ICONS.length === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * ACCOUNT_ICONS.length);
    const icon = ACCOUNT_ICONS[index].name;
    if (ACCOUNT_ICONS.length > 1 && icon === lastRandomIconRef.current) {
      const nextIndex = (index + 1) % ACCOUNT_ICONS.length;
      return ACCOUNT_ICONS[nextIndex].name;
    }
    return icon;
  };

  React.useEffect(() => {
    if (visible) {
      setAccountName('');
      setLoading(false);
      const nextIcon = pickRandomIcon() || ACCOUNT_ICONS[0].name;
      setSelectedIcon(nextIcon);
      lastRandomIconRef.current = nextIcon;
      colorCycleIndexRef.current =
        (colorCycleIndexRef.current + 1) % ACCOUNT_COLORS.length;
      setSelectedColor(ACCOUNT_COLORS[colorCycleIndexRef.current].value);
      checkEarningAccounts();
      setIconPickerVisible(false);
      setColorPickerVisible(false);

      // Focus the input after the animation is complete
      setTimeout(() => {
        accountNameInputRef.current?.focus();
      }, 400);
    }
  }, [visible]);

  React.useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [slideAnim, visible]);

  React.useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const showListener = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardPadding(event.endCoordinates.height);
    });
    const hideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardPadding(0);
    });
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const checkEarningAccounts = () => {
    try {
      const count = getEarningAccountsCount();
      setEarningCount(count);
      if (count === 0) {
        setIsFirstTime(true);
        setAccountType('earning');
        setIsPrimary(true);
      } else {
        setIsFirstTime(false);
        setAccountType('expenses');
        setIsPrimary(false);
      }
    } catch (error) {
      console.error('Failed to check earning accounts:', error);
      setIsFirstTime(true);
      setAccountType('earning');
      setIsPrimary(true);
    }
  };

  const handleAccountTypeChange = newType => {
    if (isFirstTime && newType === 'expenses') {
      Alert.alert(
        'Not Available',
        'Your first account must be an Earning Account.',
      );
      return;
    }
    if (!isFirstTime && newType === 'earning' && earningCount >= 2) {
      Alert.alert(
        'Limit Reached',
        'You can only add up to 2 earning accounts.',
      );
      return;
    }
    setAccountType(newType);
    if (newType === 'expenses') {
      setIsPrimary(false);
    }
  };

  const handleSave = async () => {
    if (!accountName.trim()) {
      Alert.alert('Error', 'Account name is required.');
      return;
    }
    if (isAccountNameExists(accountName)) {
      Alert.alert('Error', 'An account with this name already exists.');
      return;
    }
    setLoading(true);
    try {
      const result = await createAccount(
        accountName,
        accountType,
        selectedIcon,
        selectedColor,
      );
      if (accountType === 'earning' && isPrimary && result.insertId) {
        await setPrimaryAccount(result.insertId);
      }
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const modalTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });

  // Dynamic modal container style based on keyboard visibility
  const modalContainerStyle = {
    ...styles.modalContainer,
    maxHeight: keyboardPadding > 0
      ? height - keyboardPadding - 50  // When keyboard is visible
      : height * 0.8,                  // Normal state (80% of screen)
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[modalContainerStyle, {transform: [{translateY: modalTranslateY}]}]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create New Account</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={28} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Quick selectors */}
          <View style={styles.quickSelectRow}>
            <TouchableOpacity
              style={[styles.quickSelectItem, styles.quickSelectItemLeft]}
              onPress={() => {
                setIconPickerVisible(prev => !prev);
                setColorPickerVisible(false);
              }}>
              <View
                style={[
                  styles.quickSelectIcon,
                  {backgroundColor: selectedColor},
                ]}>
                {renderAccountIcon(selectedIcon, 20, colors.white)}
              </View>
              <Text style={styles.quickSelectText}>Icon</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickSelectItem}
              onPress={() => {
                setColorPickerVisible(prev => !prev);
                setIconPickerVisible(false);
              }}>
              <View
                style={[
                  styles.quickSelectColor,
                  {backgroundColor: selectedColor},
                ]}
              />
              <Text style={styles.quickSelectText}>Color</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.scrollArea}>
            <View
              style={[
                styles.scrollContent,
                Platform.OS === 'android' && {
                  paddingBottom: keyboardPadding + spacing.lg,
                },
              ]}>
              {/* Form */}
              <View style={styles.form}>
                {iconPickerVisible && (
                  <View style={styles.inlinePicker}>
                    <Text style={styles.inlinePickerTitle}>Choose Icon</Text>
                    <View style={styles.selectionGrid}>
                      {ACCOUNT_ICONS.map(icon => (
                        <TouchableOpacity
                          key={icon.id}
                          style={[
                            styles.iconOption,
                            selectedIcon === icon.name &&
                              styles.iconOptionSelected,
                            selectedIcon === icon.name && {
                              backgroundColor: selectedColor,
                            },
                          ]}
                          onPress={() => {
                            setSelectedIcon(icon.name);
                            setIconPickerVisible(false);
                          }}>
                          {renderAccountIcon(
                            icon.name,
                            22,
                            selectedIcon === icon.name
                              ? colors.white
                              : colors.text.primary,
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {colorPickerVisible && (
                  <View style={styles.inlinePicker}>
                    <Text style={styles.inlinePickerTitle}>Choose Color</Text>
                    <View style={styles.selectionGrid}>
                      {ACCOUNT_COLORS.map(color => (
                        <TouchableOpacity
                          key={color.id}
                          style={[
                            styles.colorOption,
                            {backgroundColor: color.value},
                            selectedColor === color.value &&
                              styles.colorOptionSelected,
                          ]}
                          onPress={() => {
                            setSelectedColor(color.value);
                            setColorPickerVisible(false);
                          }}>
                          {selectedColor === color.value && (
                            <Icon
                              name="checkmark"
                              size={20}
                              color={colors.white}
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {/* Account Type */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Account Type</Text>
                  <View style={styles.segmentedControl}>
                    <TouchableOpacity
                      style={[
                        styles.segmentButton,
                        accountType === 'earning' && styles.segmentButtonActive,
                        accountType === 'earning' && {
                          backgroundColor: selectedColor,
                        },
                        (isFirstTime || earningCount >= 2) &&
                          accountType !== 'earning' &&
                          styles.segmentButtonDisabled,
                      ]}
                      onPress={() => handleAccountTypeChange('earning')}
                      disabled={loading}>
                      <Text
                        style={[
                          styles.segmentButtonText,
                          accountType === 'earning' &&
                            styles.segmentButtonTextActive,
                        ]}>
                        Earning
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.segmentButton,
                        accountType === 'expenses' && styles.segmentButtonActive,
                        accountType === 'expenses' && {
                          backgroundColor: selectedColor,
                        },
                        isFirstTime && styles.segmentButtonDisabled,
                      ]}
                      onPress={() => handleAccountTypeChange('expenses')}
                      disabled={loading || isFirstTime}>
                      <Text
                        style={[
                          styles.segmentButtonText,
                          accountType === 'expenses' &&
                            styles.segmentButtonTextActive,
                          isFirstTime && styles.segmentButtonTextDisabled,
                        ]}>
                        Expenses
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {accountType === 'earning' && (
                    <Text style={styles.earningLimitNote}>
                      {`${earningRemaining} of 2 earning accounts remaining`}
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.primaryRow,
                    accountType === 'expenses' && styles.primaryRowDisabled,
                  ]}>
                  <TouchableOpacity
                    style={[
                      styles.primaryToggle,
                      isPrimary
                        ? styles.primaryToggleActive
                        : styles.primaryToggleInactive,
                      accountType === 'expenses' && styles.primaryToggleDisabled,
                    ]}
                    onPress={() => setIsPrimary(prev => !prev)}
                    disabled={loading || accountType === 'expenses'}>
                    <View
                      style={[
                        styles.primaryKnob,
                        isPrimary && styles.primaryKnobActive,
                      ]}
                    />
                  </TouchableOpacity>
                  <Text
                    style={[
                      styles.primaryText,
                      accountType === 'expenses' && styles.primaryTextDisabled,
                    ]}>
                    Set as Primary Account
                  </Text>
                </View>
              </View>

              {/* Save Button */}
              <View style={styles.buttonContainer}>
                <View style={styles.inputWithButton}>
                  <TextInput
                    ref={accountNameInputRef}
                    style={styles.inputInline}
                    placeholder="Account Name (e.g., Salary, Savings)"
                    placeholderTextColor={colors.text.secondary}
                    value={accountName}
                    onChangeText={setAccountName}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                  <TouchableOpacity
                    style={[
                      styles.inlineCreateButton,
                      {backgroundColor: selectedColor},
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={handleSave}
                    disabled={loading}>
                    {loading ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.inlineCreateText}>Create</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: '#F7F7F7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.md,
    paddingBottom: spacing.sm,
    maxHeight: height * 0.8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.bold,
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  previewCardContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  previewCard: {
    width: '90%',
    borderRadius: 16,
    padding: spacing.md,
    flexDirection: 'column',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  previewCardIcon: {
    marginBottom: spacing.sm,
  },
  previewCardText: {
    fontSize: fontSize.regular,
    fontWeight: fontWeight.semibold,
    color: colors.white,
    textAlign: 'center',
  },
  quickSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  quickSelectItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickSelectItemLeft: {
    marginRight: spacing.md,
  },
  quickSelectIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSelectColor: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickSelectText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  inlinePicker: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  inlinePickerTitle: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  form: {
    marginBottom: spacing.md,
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
  accountNameInput: {
    marginBottom: spacing.sm,
  },
  inputWithButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  inputInline: {
    flex: 1,
    paddingVertical: 14,
    fontSize: fontSize.medium,
    color: colors.text.primary,
    fontWeight: fontWeight.medium,
  },
  inlineCreateButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCreateText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  earningLimitNote: {
    marginTop: spacing.sm,
    fontSize: fontSize.small,
    color: colors.text.secondary,
    fontWeight: fontWeight.medium,
  },
  inputGroupTight: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  segmentButtonText: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.secondary,
  },
  segmentButtonTextActive: {
    color: colors.white,
  },
  segmentButtonTextDisabled: {
    color: '#9CA3AF',
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    marginBottom: spacing.md,
  },
  primaryRowDisabled: {
    opacity: 0.7,
  },
  primaryToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryToggleActive: {
    backgroundColor: colors.primary,
  },
  primaryToggleInactive: {
    backgroundColor: '#E5E7EB',
  },
  primaryToggleDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    transform: [{translateX: -10}],
  },
  primaryKnobActive: {
    transform: [{translateX: 10}],
  },
  primaryText: {
    marginLeft: spacing.md,
    fontSize: fontSize.medium,
    fontWeight: fontWeight.medium,
    color: colors.text.primary,
  },
  primaryTextDisabled: {
    color: '#9CA3AF',
  },
  selectionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconOptionSelected: {
    borderWidth: 0,
    transform: [{scale: 1.1}],
    elevation: 4,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: colors.white,
    elevation: 4,
    transform: [{scale: 1.1}],
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  buttonContainer: {
    marginTop: 0,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  saveButtonText: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});

export default AddAccountModal;
