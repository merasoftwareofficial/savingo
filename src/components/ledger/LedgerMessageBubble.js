import React, {useMemo} from 'react';
import {View, Text} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import TapEffect from '../ui/TapEffect';
import {getChatMessageStatus} from '../../services/chatMessageStatus';

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
    const status = getChatMessageStatus(deliveryStatusValue);
    const tickIconName = status.icon;
    const tickColor = status.failed ? '#EF4444' : status.read ? '#22C55E' : colors.text.light;

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
            <View
              style={[
                styles.chatBubble,
                isSent ? styles.chatBubbleSent : styles.chatBubbleReceived,
                isSelected && styles.chatBubbleSelected,
              ]}>
              <Text style={styles.chatMessageText}>{text}</Text>
              {isSent && status.failed ? (
                <Text style={[styles.chatTime, {color: '#EF4444'}]}>Failed · tap to retry</Text>
              ) : null}
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
