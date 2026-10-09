import React, {useRef, useEffect} from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {spacing} from '../utils/theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';

const BottomSheet = ({visible, onClose, children}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(300)).current;

  const styles = React.useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    overlayTouchable: {
      flex: 1,
    },
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
      elevation: 10,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: -4},
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 4,
    },
    scrollContent: {
      paddingBottom: spacing.xs,
    },
  }), [colors]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(contentTranslateY, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, contentTranslateY]);

  if (!visible && contentTranslateY._value >= 300) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, {opacity: overlayOpacity}]}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.container,
            {paddingBottom: spacing.lg + Math.max(insets.bottom, spacing.xs)},
            {transform: [{translateY: contentTranslateY}]},
          ]}>
          <View style={styles.handle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

export default BottomSheet;
