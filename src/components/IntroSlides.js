import React, {useEffect, useRef, useState} from 'react';
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

// First-start intro: three short slides, big icon + one line each.
const SLIDES = [
  {
    icon: 'chatbox-ellipses-outline',
    title: 'Ledger Talk',
    text: 'Keep track of money with people and chat about it.',
  },
  {
    icon: 'wallet-outline',
    title: 'Accounts',
    text: 'Your income and expenses, all in one place.',
  },
  {
    icon: 'help-buoy-outline',
    title: 'Need help?',
    text: 'Talk to us on WhatsApp: More › Help & Support.',
  },
];

const IntroSlides = ({visible, onDone}) => {
  const {colors} = useTheme();
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

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
    skipBtn: {
      position: 'absolute',
      top: spacing.sm + 2,
      right: spacing.sm + 2,
      padding: spacing.xs,
    },
    skipText: {
      fontSize: fontSize.small,
      color: colors.text.secondary,
      fontWeight: fontWeight.medium,
    },
    iconWrap: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.large,
      fontWeight: fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: spacing.xs,
    },
    text: {
      fontSize: fontSize.medium,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
      minHeight: 44,
      marginBottom: spacing.md,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.md,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      width: 18,
      backgroundColor: colors.primary,
    },
    nextBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      minWidth: 160,
      paddingVertical: 11,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextText: {
      fontSize: fontSize.medium,
      color: '#FFFFFF',
      fontWeight: fontWeight.semibold,
    },
  }), [colors]);

  useEffect(() => {
    if (visible) {
      setIndex(0);
      Animated.parallel([
        Animated.timing(fadeAnim, {toValue: 1, duration: 280, useNativeDriver: true}),
        Animated.spring(slideAnim, {toValue: 0, tension: 60, friction: 10, useNativeDriver: true}),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(40);
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!visible) {
    return null;
  }

  const handleNext = () => {
    if (isLast) {
      onDone();
      return;
    }
    setIndex(prev => prev + 1);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDone}
      statusBarTranslucent>
      <Animated.View style={[styles.overlay, {opacity: fadeAnim}]}>
        <Animated.View style={[styles.card, {transform: [{translateY: slideAnim}]}]}>
          {!isLast ? (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={onDone}
              hitSlop={{top: 10, right: 10, bottom: 10, left: 10}}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.iconWrap}>
            <Icon name={slide.icon} size={42} color={colors.primary} />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.text}>{slide.text}</Text>

          <View style={styles.dots}>
            {SLIDES.map((item, dotIndex) => (
              <View
                key={item.title}
                style={[styles.dot, dotIndex === index && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.8}>
            <Text style={styles.nextText}>{isLast ? 'Start' : 'Next'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

export default IntroSlides;
