import React from 'react';
import {View, Text, Modal, Animated, StyleSheet} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {spacing, fontSize, fontWeight} from '../utils/theme';
import {useTheme} from '../context/ThemeContext';

const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const BackupProgressModal = ({
  visible,
  progressAnim,
  progressPercent,
  title,
  subtitle,
  overlayStyle,
  cardStyle,
  titleStyle,
  subtitleStyle,
}) => {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => {}}>
      <View style={[styles.overlay, overlayStyle]}>
        <Animated.View
          style={[
            styles.card,
            cardStyle,
            {
              opacity: progressAnim,
              transform: [
                {
                  translateY: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            },
          ]}>
          <View style={styles.progressRing}>
            <Svg width={72} height={72}>
              <Circle cx={36} cy={36} r={RING_RADIUS} stroke={colors.border} strokeWidth={6} fill="none" />
              <Circle
                cx={36}
                cy={36}
                r={RING_RADIUS}
                stroke={colors.primary}
                strokeWidth={6}
                fill="none"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={(RING_CIRCUMFERENCE * (100 - progressPercent)) / 100}
                strokeLinecap="round"
                rotation="-90"
                origin="36, 36"
              />
            </Svg>
            <Text style={styles.progressPercent}>{Math.round(progressPercent)}%</Text>
          </View>
          <Text style={[styles.title, titleStyle]}>{title}</Text>
          <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = colors => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.modal,
    borderRadius: 14,
    padding: spacing.md,
    alignItems: 'center',
    gap: 8,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  progressRing: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercent: {
    position: 'absolute',
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
  },
  title: {
    fontSize: fontSize.medium,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.small,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});

export default BackupProgressModal;
