import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../context/ThemeContext';

const LedgerSelectionToolbar = ({
  styles,
  selectedCount,
  onClearSelection,
  onCopySelected,
  onDeleteSelected,
}) => {
  const {colors} = useTheme();
  return (
    <>
    <TouchableOpacity
      style={styles.backButton}
      onPress={onClearSelection}
      accessibilityRole="button"
      accessibilityLabel="Cancel selection">
      <Icon name="close" size={24} color={colors.headerIcon} />
    </TouchableOpacity>
    <Text style={styles.selectionHeaderTitle} numberOfLines={1}>
      {`${selectedCount} selected`}
    </Text>
    <View style={styles.selectionHeaderActions}>
      <TouchableOpacity
        style={styles.selectionHeaderActionButton}
        onPress={onCopySelected}
        disabled={selectedCount === 0}
        activeOpacity={0.8}>
        <Icon
          name="copy-outline"
          size={22}
          color={selectedCount > 0 ? colors.headerIcon : colors.text.light}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.selectionHeaderActionButton}
        onPress={onDeleteSelected}
        disabled={selectedCount === 0}
        activeOpacity={0.8}>
        <Icon
          name="trash-outline"
          size={22}
          color={selectedCount > 0 ? colors.error : colors.text.light}
        />
      </TouchableOpacity>
    </View>
    </>
  );
};

export default LedgerSelectionToolbar;
