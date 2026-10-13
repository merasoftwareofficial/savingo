import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../../context/ThemeContext';

const createDeletedUiStyles = colors =>
  StyleSheet.create({
    bubble: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    },
    amount: {
      color: colors.text.light,
      textDecorationLine: 'line-through',
    },
    remark: {
      color: colors.text.light,
    },
    iconContainer: {
      backgroundColor: colors.border,
    },
    mutedBadge: {
      backgroundColor: colors.border,
    },
    mutedText: {
      color: colors.text.secondary,
    },
    mutedMetaText: {
      color: colors.text.light,
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.surfaceMuted,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'lowercase',
    },
    note: {
      fontSize: 14,
      color: colors.text.light,
      fontStyle: 'italic',
    },
  });

export const getDeletedTapEffectProps = (isDeleted, onLongPress) => {
  if (isDeleted) {
    return {
      disabled: true,
      activeOpacity: 1,
      onLongPress: undefined,
    };
  }

  return {
    disabled: false,
    activeOpacity: undefined,
    onLongPress,
  };
};

export const withDeletedStyle = (isDeleted, baseStyles, deletedStyle) => {
  const stylesList = Array.isArray(baseStyles) ? [...baseStyles] : [baseStyles];
  if (isDeleted && deletedStyle) {
    stylesList.push(deletedStyle);
  }
  return stylesList;
};

export const renderDeletedWatermark = (
  isDeleted,
  watermarkStyle,
  label = 'DELETED',
) => {
  if (!isDeleted) {
    return null;
  }
  return <Text style={watermarkStyle}>{label}</Text>;
};

const renderDeletedBadge = (
  styles,
  isDeleted,
  badgeContainerStyle = styles.badge,
  badgeTextStyle = styles.badgeText,
  label = 'deleted',
) => {
  if (!isDeleted) {
    return null;
  }
  return (
    <View style={badgeContainerStyle}>
      <Text style={badgeTextStyle}>{label}</Text>
    </View>
  );
};

const renderDeletedNote = (styles, isDeleted, noteStyle = styles.note, text = 'Entry deleted') => {
  if (!isDeleted) {
    return null;
  }
  return <Text style={noteStyle}>{text}</Text>;
};

// Theme-bound deleted-entry styles and helpers (same call signatures as before).
export const useDeletedUi = () => {
  const {colors} = useTheme();
  return React.useMemo(() => {
    const deletedUiStyles = createDeletedUiStyles(colors);
    return {
      deletedUiStyles,
      getDeletedIconColor: (isDeleted, activeColor) =>
        isDeleted ? colors.text.light : activeColor,
      renderDeletedBadge: (...args) => renderDeletedBadge(deletedUiStyles, ...args),
      renderDeletedNote: (...args) => renderDeletedNote(deletedUiStyles, ...args),
    };
  }, [colors]);
};
