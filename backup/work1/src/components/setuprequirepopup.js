import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import BottomSheet from './BottomSheet';
import {spacing} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const SetupRequirePopup = ({
  visible,
  title,
  description,
  primaryText = 'Update Profile Setup',
  secondaryText = 'Remind me later',
  showNeverShowCheckbox = false,
  neverShowChecked = false,
  neverShowLabel = 'Never show this msg again',
  onNeverShowToggle,
  onPrimaryPress,
  onSecondaryPress,
  onClose,
  navigation,
  user,
  targetScreen = 'ProfileSetup',
}) => {
  const {colors} = useTheme();
  const [primaryLocked, setPrimaryLocked] = React.useState(false);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  React.useEffect(() => {
    if (!visible) {
      setPrimaryLocked(false);
    }
  }, [visible]);

  const handlePrimaryPress = () => {
    if (primaryLocked) {
      return;
    }
    setPrimaryLocked(true);

    if (typeof onPrimaryPress === 'function') {
      onPrimaryPress();
      return;
    }

    if (navigation?.navigate) {
      navigation.navigate(targetScreen, {user});
      return;
    }

    if (typeof onSecondaryPress === 'function') {
      onSecondaryPress();
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose || onSecondaryPress}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handlePrimaryPress}
          disabled={primaryLocked}>
          <Text style={styles.primaryButtonText}>{primaryText}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSecondaryPress}>
          <Text style={styles.secondaryButtonText}>{secondaryText}</Text>
        </TouchableOpacity>

        {showNeverShowCheckbox ? (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={onNeverShowToggle}
            activeOpacity={0.8}>
            <View
              style={[
                styles.checkboxBox,
                neverShowChecked && styles.checkboxBoxChecked,
              ]}>
              {neverShowChecked ? (
                <Text style={styles.checkboxTick}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>{neverShowLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </BottomSheet>
  );
};

const createStyles = colors => StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: colors.surface,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxTick: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
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
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default SetupRequirePopup;
