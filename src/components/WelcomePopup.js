import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const WelcomePopup = ({visible, onDismiss}) => {
  const {colors} = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  const styles = React.useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    card: {
      width: '100%',
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      alignItems: 'center',
      elevation: 8,
      shadowColor: colors.shadow,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.18,
      shadowRadius: 10,
    },
    closeBtn: {
      position: 'absolute',
      top: spacing.sm + 2,
      right: spacing.sm + 2,
      padding: spacing.xs,
    },
    heading: {
      fontSize: fontSize.regular,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    message: {
      fontSize: fontSize.medium,
      color: colors.text.primary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    supportRow: {
      width: '100%',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    supportTopRow: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    supportText: {
      fontSize: fontSize.small,
      color: colors.text.light,
      lineHeight: 18,
      textAlign: 'center',
    },
    supportSubText: {
      marginTop: 2,
      fontSize: fontSize.small,
      color: colors.text.light,
      lineHeight: 18,
      textAlign: 'center',
    },
    supportSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    supportPath: {
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
    dismissBtn: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      minWidth: 140,
      paddingVertical: 10,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissBtnText: {
      fontSize: fontSize.medium,
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
  }), [colors]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 60,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(40);
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent>
      <Animated.View style={[styles.overlay, {opacity: fadeAnim}]}>
        <Animated.View
          style={[styles.card, {transform: [{translateY: slideAnim}]}]}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onDismiss}
            hitSlop={{top: 10, right: 10, bottom: 10, left: 10}}>
            <Icon name="close" size={18} color={colors.text.secondary} />
          </TouchableOpacity>

          {/* Heading */}
          <Text style={styles.heading}>A note from the developer</Text>

          {/* Message */}
          <Text style={styles.message}>
            Hi! I personally read every query, complaint, and feedback shared.
            Review us on Play Store. Happy to help! 😊
          </Text>

          {/* Support direction */}
          <View style={styles.supportRow}>
            <View style={styles.supportTopRow}>
              <Text style={styles.supportText}>Need more help?</Text>
            </View>
            <View style={styles.supportSubRow}>
              <Icon name="headset-outline" size={13} color={colors.text.light} />
              <Text style={styles.supportSubText}>
                Talk to us:{' '}
                <Text style={styles.supportPath}>More {'>'} Support {'>'} Whatsapp</Text>
              </Text>
            </View>
          </View>

          {/* Dismiss */}
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onDismiss}
            activeOpacity={0.7}>
            <Text style={styles.dismissBtnText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

export default WelcomePopup;
