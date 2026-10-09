import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {fontWeight, spacing} from '../utils/theme';

const FILTERS = [
  {id: 'all', label: 'All'},
  {id: 'added', label: 'Added'},
  {id: 'withdraw', label: 'Withdraw'},
];

const TransactionTypeFilterBar = ({
  value = 'all',
  onChange,
  themeColor = '#2563EB',
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {FILTERS.map(filter => {
        const isActive = value === filter.id;
        return (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterButton,
              isActive && {
                borderColor: themeColor,
                backgroundColor: `${themeColor}20`,
              },
            ]}
            activeOpacity={0.8}
            onPress={() => onChange?.(filter.id)}>
            <Text
              style={[
                styles.filterLabel,
                isActive && {color: themeColor},
              ]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const createStyles = colors =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    filterButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: spacing.sm,
    },
    filterLabel: {
      fontSize: 13,
      fontWeight: fontWeight.semibold,
      color: colors.text.secondary,
    },
  });

export default React.memo(TransactionTypeFilterBar);
