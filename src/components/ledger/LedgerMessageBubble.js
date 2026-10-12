import React, {useMemo} from 'react';
import {View, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import TapEffect from '../ui/TapEffect';

// Primitive message props let unchanged rows skip rendering after a timeline reload.
const LedgerMessageBubble = ({messageId, timestamp, text, deliveryStatusValue,
  isSent, isSelected, isSelectionMode, showDate,
  styles, colors, enterSelectionMode, toggleMessageSelection}) => {
  const timeLabel = useMemo(() => new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  }), [timestamp]);
  const dateLabel = useMemo(() => showDate ? new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '', [timestamp, showDate]);
    const deliveryStatus = String(deliveryStatusValue || '').toLowerCase();
    const showDoubleTick = deliveryStatus === 'delivered' || deliveryStatus === 'read';
    const showSingleTick =
      !showDoubleTick &&
      (deliveryStatus === 'sent' ||
        deliveryStatus === 'sending' ||
        deliveryStatus === 'pending' ||
        deliveryStatus === 'queued' ||
        deliveryStatus === 'accepted' ||
        deliveryStatus === 'pushed');
    const tickIconName = showDoubleTick ? 'checkmark-done' : showSingleTick ? 'checkmark' : null;
    const tickColor = deliveryStatus === 'read' ? '#22C55E' : colors.text.light;

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
          onLongPress={() => enterSelectionMode(messageId)}
          onPress={() => {
            if (!isSelectionMode) {
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
            <View
              style={[
                styles.chatBubble,
                isSent ? styles.chatBubbleSent : styles.chatBubbleReceived,
                isSelected && styles.chatBubbleSelected,
              ]}>
              <Text style={styles.chatMessageText}>{text}</Text>
              <View style={styles.chatMetaRow}>
                <Text style={styles.chatTime}>
                  {timeLabel}
                </Text>
                {isSent && tickIconName ? (
                  <Icon
                    name={tickIconName}
                    size={14}
                    color={tickColor}
                    style={styles.chatTickIcon}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </TapEffect>
      </View>
    );

};

export default React.memo(LedgerMessageBubble);
