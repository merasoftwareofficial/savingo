import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export const deletedUiStyles = StyleSheet.create({
  bubble: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  amount: {
    color: '#6B7280',
    textDecorationLine: 'line-through',
  },
  remark: {
    color: '#6B7280',
  },
  iconContainer: {
    backgroundColor: '#E5E7EB',
  },
  mutedBadge: {
    backgroundColor: '#E5E7EB',
  },
  mutedText: {
    color: '#4B5563',
  },
  mutedMetaText: {
    color: '#6B7280',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4B5563',
    textTransform: 'lowercase',
  },
  note: {
    fontSize: 14,
    color: '#6B7280',
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

export const getDeletedIconColor = (isDeleted, activeColor) => {
  return isDeleted ? '#6B7280' : activeColor;
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

export const renderDeletedBadge = (
  isDeleted,
  badgeContainerStyle = deletedUiStyles.badge,
  badgeTextStyle = deletedUiStyles.badgeText,
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

export const renderDeletedNote = (
  isDeleted,
  noteStyle = deletedUiStyles.note,
  text = 'Entry deleted',
) => {
  if (!isDeleted) {
    return null;
  }
  return <Text style={noteStyle}>{text}</Text>;
};
