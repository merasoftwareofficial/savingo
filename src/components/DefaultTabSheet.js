import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';
import {useAppAlert} from '../context/AppAlertContext';
import {queueBackupFromStorage} from '../utils/backupQueue';
import {
  DEFAULT_TAB_OPTIONS,
  normalizeDefaultTab,
  writeDefaultTabPreference,
} from '../utils/defaultTabPreference';

// Shared "which tab opens on start" picker, used by Settings and by the
// long-press shortcut on the tab bar. Saves the choice itself.
const DefaultTabSheet = ({visible, value, onClose, onChanged}) => {
  const {colors} = useTheme();
  const {showAlert} = useAppAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const activeValue = normalizeDefaultTab(value);

  const handleSelect = async selected => {
    const previous = activeValue;
    const normalized = normalizeDefaultTab(selected);
    onChanged?.(normalized);
    onClose?.();
    try {
      await writeDefaultTabPreference(normalized);
      queueBackupFromStorage();
    } catch (error) {
      console.error('Failed to save default tab:', error);
      onChanged?.(previous);
      showAlert({title: 'Error', message: 'Failed to update default tab.', actions: [{text: 'OK'}]});
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>Open app on</Text>
      </View>
      <View style={styles.list}>
        {DEFAULT_TAB_OPTIONS.map(option => {
          const isActive = option.value === activeValue;
          return (
            <TouchableOpacity
              key={option.value}
              style={styles.option}
              onPress={() => handleSelect(option.value)}>
              <View style={styles.optionLeft}>
                <Icon
                  name={option.icon}
                  size={20}
                  color={isActive ? colors.primary : colors.text.secondary}
                />
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                    {option.label}
                  </Text>
                  {option.hint ? <Text style={styles.optionHint}>{option.hint}</Text> : null}
                </View>
              </View>
              <Icon
                name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={isActive ? colors.primary : colors.text.light}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </BottomSheet>
  );
};

const createStyles = colors => StyleSheet.create({
  header: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionTextWrap: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  optionText: {
    fontSize: fontSize.regular,
    color: colors.text.primary,
  },
  optionTextActive: {
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  optionHint: {
    marginTop: 2,
    fontSize: fontSize.small,
    color: colors.text.secondary,
  },
});

export default DefaultTabSheet;
