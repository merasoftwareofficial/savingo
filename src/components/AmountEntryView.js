import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';

const AmountEntryView = ({
  visible,
  children,
  keyboardBehavior = Platform.OS === 'ios' ? 'padding' : 'padding',
}) => {
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacityAnim.setValue(0);
      return;
    }
    opacityAnim.setValue(0);
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, opacityAnim]);

  if (!visible) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={keyboardBehavior}
      enabled>
      <Animated.View style={[styles.content, {opacity: opacityAnim}]}>
        {children}
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  content: {
    flex: 1,
  },
});

export default AmountEntryView;

