import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {radius, spacing, typography} from '../../utils/theme';
import {useTheme} from '../../context/ThemeContext';
import {withAlpha} from '../../utils/color';

// Row of small stat tiles. tiles: [{key, label, icon, tone, value, valueColor?}]
const StatTiles = ({tiles = [], style}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, style]}>
      {tiles.map(tile => (
        <View key={tile.key} style={styles.tile}>
          <View style={styles.labelRow}>
            {tile.icon ? (
              <View style={[styles.iconBadge, {backgroundColor: withAlpha(tile.tone, 0.14)}]}>
                <Icon name={tile.icon} size={11} color={tile.tone} />
              </View>
            ) : null}
            <Text style={styles.label} numberOfLines={1}>
              {tile.label}
            </Text>
          </View>
          <Text
            style={[styles.value, tile.valueColor && {color: tile.valueColor}]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {tile.value}
          </Text>
        </View>
      ))}
    </View>
  );
};

const createStyles = colors => StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  iconBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.caption,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  value: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.text.primary,
    marginTop: 6,
  },
});

export default React.memo(StatTiles);
