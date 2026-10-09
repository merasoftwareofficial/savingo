import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {fontSize, fontWeight, spacing} from '../utils/theme';

const BackupRestoreSelect = ({
  label,
  helperText,
  selectedId,
  valueLabel,
  placeholder = 'Select',
  options = [],
  disabled = false,
  onSelect,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = React.useState(false);

  const close = () => setOpen(false);

  const handlePress = () => {
    if (!disabled) {
      setOpen(true);
    }
  };

  const handleSelect = option => {
    close();
    onSelect?.(option);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={handlePress}
        disabled={disabled}>
        <Text style={[styles.fieldText, !valueLabel && styles.placeholderText]}>
          {valueLabel || placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </TouchableOpacity>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}>
        <View style={styles.modalRoot}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.backdrop}
            onPress={close}
          />
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{label}</Text>
            {options.length === 0 ? (
              <Text style={styles.emptyText}>No options available.</Text>
            ) : (
              options.map(option => {
                const isSelected =
                  selectedId != null && String(option.id) === String(selectedId);
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                    onPress={() => handleSelect(option)}>
                    <View style={styles.optionContent}>
                      <View style={styles.optionTextBlock}>
                        <Text style={styles.optionTitle}>{option.title}</Text>
                        {option.subtitle ? (
                          <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <Text style={styles.selectedText}>Selected</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    root: {
      width: '100%',
    },
    label: {
      fontSize: fontSize.small,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
    },
    field: {
      marginTop: spacing.sm,
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.input,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
    },
    fieldDisabled: {
      opacity: 0.6,
    },
    fieldText: {
      flex: 1,
      color: colors.text.primary,
      fontSize: fontSize.regular,
      fontWeight: fontWeight.medium,
    },
    placeholderText: {
      color: colors.text.secondary,
    },
    chevron: {
      marginLeft: spacing.sm,
      color: colors.text.secondary,
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
    },
    helperText: {
      marginTop: spacing.xs,
      color: colors.text.secondary,
      fontSize: fontSize.small,
      lineHeight: 17,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    menu: {
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: {width: 0, height: 8},
    },
    menuTitle: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      color: colors.text.secondary,
      fontSize: fontSize.small,
      fontWeight: fontWeight.semibold,
    },
    optionRow: {
      minHeight: 52,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    optionRowSelected: {
      backgroundColor: colors.input,
    },
    optionContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    optionTextBlock: {
      flex: 1,
      paddingRight: spacing.sm,
    },
    optionTitle: {
      color: colors.text.primary,
      fontSize: fontSize.regular,
      fontWeight: fontWeight.medium,
    },
    optionSubtitle: {
      marginTop: 4,
      color: colors.text.secondary,
      fontSize: fontSize.small,
    },
    selectedText: {
      color: colors.primary,
      fontSize: fontSize.small,
      fontWeight: fontWeight.semibold,
    },
    emptyText: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      color: colors.text.secondary,
      fontSize: fontSize.small,
    },
  });

export default BackupRestoreSelect;
