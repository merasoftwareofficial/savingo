import React, {useEffect, useMemo, useRef} from 'react';
import {View, Text} from 'react-native';
import Reanimated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import TapEffect from '../ui/TapEffect';
import {getChatStatusIndicator} from '../../services/chatMessageStatus';

// A just-sent optimistic bubble mounts within this window; older rows mount without the entry animation.
const FRESH_SEND_WINDOW_MS = 1500;

// Primitive message props let unchanged rows skip rendering after a timeline reload.
const LedgerMessageBubble = ({messageId, timestamp, text, deliveryStatusValue,
  isSent, isSelected, isSelectionMode, showDate,
  styles, colors, enterSelectionMode, toggleMessageSelection, onRetry,
  ownerId, receiverId, conversationId}) => {
  const timeLabel = useMemo(() => new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  }), [timestamp]);
  const dateLabel = useMemo(() => showDate ? new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '', [timestamp, showDate]);
    // Sent-bubble tone: 0 = sending/sent (gray), 1 = delivered (blue), 2 = read (green).
    const {status, tone: sentTone, icon: tickIconName, color: tickColor} =
      getChatStatusIndicator(deliveryStatusValue, colors.text.light);

    const toneBackgrounds = [
      styles.chatBubbleSentPending.backgroundColor,
      styles.chatBubbleSentDelivered.backgroundColor,
      styles.chatBubbleSentRead.backgroundColor,
    ];
    const toneBorders = [
      styles.chatBubbleSentPending.borderColor,
      styles.chatBubbleSentDelivered.borderColor,
      styles.chatBubbleSentRead.borderColor,
    ];

    const isFreshSend = useRef(
      isSent && !status.failed && Date.now() - Number(timestamp || 0) < FRESH_SEND_WINDOW_MS,
    ).current;
    const toneProgress = useSharedValue(sentTone);
    const entry = useSharedValue(isFreshSend ? 0 : 1);
    const tickScale = useSharedValue(1);
    const previousTone = useRef(sentTone);

    useEffect(() => {
      if (isFreshSend) {
        entry.value = withSpring(1, {damping: 16, stiffness: 180, mass: 0.7});
      }
      // Entry runs once per mount only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (previousTone.current === sentTone) return;
      previousTone.current = sentTone;
      toneProgress.value = withTiming(sentTone, {duration: 300});
      tickScale.value = withSequence(
        withTiming(1.3, {duration: 120}),
        withSpring(1, {damping: 10, stiffness: 220}),
      );
    }, [sentTone, toneProgress, tickScale]);

    const applyTone = isSent && !isSelected;
    const animatedBubbleStyle = useAnimatedStyle(() => {
      const style = {
        opacity: entry.value,
        transform: [
          {translateY: (1 - entry.value) * 28},
          {scale: 0.94 + entry.value * 0.06},
        ],
      };
      if (applyTone) {
        style.backgroundColor = interpolateColor(toneProgress.value, [0, 1, 2], toneBackgrounds);
        style.borderColor = interpolateColor(toneProgress.value, [0, 1, 2], toneBorders);
      }
      return style;
    }, [applyTone, toneBackgrounds[0], toneBackgrounds[1], toneBackgrounds[2]]);

    const animatedTickStyle = useAnimatedStyle(() => ({
      transform: [{scale: tickScale.value}],
    }));

    return (
      <View>
        {showDate && (
          <View style={styles.datePill}>
            <Text style={styles.datePillText}>
              {dateLabel}
            </Text>
          </View>
        )}
        <TapEffect
          style={styles.chatRow}
          accessibilityLabel={isSent ? `${text}. ${status.label}` : text}
          onLongPress={() => enterSelectionMode(messageId)}
          onPress={() => {
            if (!isSelectionMode) {
              if (isSent && status.failed && onRetry) {
                onRetry({messageId, text, pressedAt: timestamp, ownerId, receiverId, conversationId, consumed: true});
              }
              return;
            }
            toggleMessageSelection(messageId);
          }}
          delayLongPress={250}>
          <View
            style={[
              styles.messageSelectableRow,
              isSent ? styles.messageSelectableRowSent : styles.messageSelectableRowReceived,
            ]}>
            {isSelectionMode ? (
              <View
                style={[
                  styles.messageSelectionDot,
                  isSelected && styles.messageSelectionDotSelected,
                ]}>
                {isSelected ? (
                  <Icon name="checkmark" size={12} color={colors.white} />
                ) : null}
              </View>
            ) : null}
            <Reanimated.View
              style={[
                styles.chatBubble,
                isSent ? styles.chatBubbleSent : styles.chatBubbleReceived,
                isSelected && styles.chatBubbleSelected,
                animatedBubbleStyle,
              ]}>
              <Text style={styles.chatMessageText}>{text}</Text>
              {isSent && status.failed ? (
                <Text style={[styles.chatTime, {color: colors.error}]}>Failed · tap to retry</Text>
              ) : null}
              <View style={styles.chatMetaRow}>
                <Text style={styles.chatTime}>
                  {timeLabel}
                </Text>
                {isSent && tickIconName ? (
                  <Reanimated.View style={animatedTickStyle}>
                    <Icon
                      name={tickIconName}
                      size={14}
                      color={tickColor}
                      style={styles.chatTickIcon}
                    />
                  </Reanimated.View>
                ) : null}
              </View>
            </Reanimated.View>
          </View>
        </TapEffect>
      </View>
    );

};

export default React.memo(LedgerMessageBubble);
