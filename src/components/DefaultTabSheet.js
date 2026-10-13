import React from 'react';
import {View, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import {spacing, radius} from '../utils/theme';
import ListRow from './ui/ListRow';
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
    <BottomSheet visible={visible} onClose={onClose} title="Open app on">
      <View style={styles.list}>
        {DEFAULT_TAB_OPTIONS.map((option, index) => {
          const isActive = option.value === activeValue;
          return (
            <ListRow
              key={option.value}
              icon={option.icon}
              iconColor={isActive ? colors.onPrimary : colors.text.secondary}
              iconBackground={isActive ? colors.primary : colors.card}
              title={option.label}
              subtitle={option.hint}
              divider={index < DEFAULT_TAB_OPTIONS.length - 1}
              onPress={() => handleSelect(option.value)}
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
  );
};

const createStyles = colors => StyleSheet.create({
  list: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
});

export default DefaultTabSheet;
