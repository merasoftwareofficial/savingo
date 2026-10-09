import React from 'react';
import {Animated, Modal, StyleSheet, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../../../context/ThemeContext';

const DropdownPopup = ({
  visible,
  onClose,
  cardStyle,
  children,
  statusBarTranslucent = true,
  animationType = 'none',
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.backdrop}
          onPress={onClose}
        />
        <Animated.View style={cardStyle}>{children}</Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = colors => StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
});

export default DropdownPopup;
