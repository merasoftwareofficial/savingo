import React, {useRef, useEffect} from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  PanResponder,
} from 'react-native';
import {radius, spacing} from '../utils/theme';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';
import SheetHeader from './ui/SheetHeader';

const HIDDEN_OFFSET = 400;
const DRAG_CLOSE_DISTANCE = 90;

// Modal bottom sheet. Pass `title` (and optional `subtitle`) to get the standard header.
// Drag the handle area down to close.
const BottomSheet = ({visible, onClose, title, subtitle, children}) => {
  const insets = useSafeAreaInsets();
  const {colors} = useTheme();
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      backgroundColor: colors.modal,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: '80%',
      elevation: 12,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: -4},
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    handleArea: {
      paddingTop: 10,
      paddingBottom: spacing.sm,
      alignItems: 'center',
    },
    handle: {
      width: 40,
      height: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
    },
    scrollContent: {
      paddingBottom: spacing.xs,
    },
  }), [colors]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6,
      onPanResponderMove: (_, gesture) => {
        dragY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DRAG_CLOSE_DISTANCE || gesture.vy > 1.2) {
          onCloseRef.current?.();
          return;
        }
        Animated.spring(dragY, {toValue: 0, useNativeDriver: true, friction: 8}).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(contentTranslateY, {
          toValue: 0,
          tension: 70,
          friction: 12,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: HIDDEN_OFFSET,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, contentTranslateY, dragY]);

  if (!visible && contentTranslateY._value >= HIDDEN_OFFSET) {
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
            {transform: [{translateY: Animated.add(contentTranslateY, dragY)}]},
          ]}>
          <View {...panResponder.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            {title ? <SheetHeader title={title} subtitle={subtitle} onClose={onClose} /> : null}
          </View>
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
