import React from 'react';
import {View, Text, Image} from 'react-native';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import TapEffect from '../components/ui/TapEffect';
import {getChatStatusIndicator} from '../services/chatMessageStatus';

const LedgerContactRow = ({
  item,
  isFirst,
  isLast,
  styles,
  colors,
  photoUri,
  cachedApiName,
  lastActivity,
  unreadCount,
  balance,
  isPinned,
  formatCurrency,
  formatRelativeTime,
  onPress,
  onLongPress,
}) => {
  const structuredName = [item.givenName, item.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const name = item.savedName || structuredName || item.displayName || 'Unnamed Contact';
  const isEmailLike = value => Boolean(value) && String(value).includes('@');
  const isUsernameLike = value =>
    Boolean(value) &&
    !String(value).includes(' ') &&
    String(value) === String(value).toLowerCase() &&
    String(value).length > 5;
  const nameForInitial =
    structuredName ||
    (!isEmailLike(item.savedName) && !isUsernameLike(item.savedName) && item.savedName) ||
    (!isEmailLike(item.displayName) &&
      !isUsernameLike(item.displayName) &&
      item.displayName) ||
    (!isEmailLike(cachedApiName) && cachedApiName) ||
    '?';
  const balanceStatus =
    balance.netBalance > 0 ? 'positive' : balance.netBalance < 0 ? 'negative' : 'neutral';
  const statusText =
    balanceStatus === 'positive'
      ? 'You will get'
      : balanceStatus === 'negative'
      ? 'You will give'
      : 'Settled';
  const relativeTime = lastActivity ? formatRelativeTime(lastActivity.timestamp) : '';
  const activityColor = lastActivity?.type === 'paid' ? colors.error : colors.success;
  const chatIndicator = lastActivity?.kind === 'chat' && lastActivity.isOutgoing
    ? getChatStatusIndicator(lastActivity.deliveryStatus, colors.text.secondary)
    : null;

  return (
    <TapEffect
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.contactItem,
        isFirst && styles.firstContactItem,
        isLast && styles.lastContactItem,
      ]}>
      <View style={styles.contactRow}>
        <View style={styles.avatarWrapper}>
          <View
            style={[
              styles.contactAvatar,
              (item.isAppUser === true || Number(item.isAppUser) === 1) &&
                String(item.appInstallState || 'installed').trim().toLowerCase() !==
                  'uninstalled' &&
                !photoUri &&
                styles.contactAvatarAppUser,
              photoUri && styles.contactAvatarPhoto,
            ]}>
            {photoUri ? (
              <Image source={{uri: photoUri}} style={styles.contactAvatarImage} />
            ) : (
              <Text style={styles.contactAvatarText}>
                {(nameForInitial || '?').charAt(0).toUpperCase()}
              </Text>
            )}
            {isPinned ? (
              <View style={styles.pinnedBadge}>
                <MaterialIcon name="push-pin" size={12} color={colors.white} />
              </View>
            ) : null}
          </View>
          {unreadCount > 0 ? (
            <View style={styles.chatUnreadBadge}>
              <Text style={styles.chatUnreadBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.contactDetails}>
          <Text
            style={[
              styles.contactName,
              (item.isAppUser === true || Number(item.isAppUser) === 1) && item.username
                ? styles.contactNameNoMargin
                : null,
            ]}
            numberOfLines={1}>
            {name}
          </Text>
          {(item.isAppUser === true || Number(item.isAppUser) === 1) && item.username ? (
            <Text style={styles.usernameInline} numberOfLines={1}>
              {item.username}
            </Text>
          ) : null}
          {lastActivity ? (
            lastActivity.kind === 'chat' ? (
              <Text style={styles.lastActivityText} numberOfLines={1}>
                {chatIndicator ? (
                  <Icon name={chatIndicator.icon} size={14} color={chatIndicator.color} />
                ) : null}
                {chatIndicator ? ' ' : ''}
                {lastActivity.text}
                {relativeTime ? (
                  <Text style={styles.lastActivityTime}>{` · ${relativeTime}`}</Text>
                ) : null}
              </Text>
            ) : (
              <View style={styles.lastActivityRow}>
                <Text
                  style={[styles.lastActivityText, {color: activityColor}]}
                  numberOfLines={1}>
                  {lastActivity.type === 'paid' ? 'Paid' : 'Got'} - ₹
                  {Math.abs(lastActivity.amount)}
                  {lastActivity.note ? ` · ${lastActivity.note}` : ''}
                  {relativeTime ? (
                    <Text style={styles.lastActivityTime}>{` · ${relativeTime}`}</Text>
                  ) : null}
                </Text>
              </View>
            )
          ) : null}
        </View>
        <View style={styles.balanceInfo}>
          <Text style={[styles.balanceText, styles[`balance_${balanceStatus}`]]}>
            {statusText}
          </Text>
          <Text style={[styles.balanceAmount, styles[`balance_${balanceStatus}`]]}>
            {formatCurrency(balance.netBalance)}
          </Text>
        </View>
      </View>
    </TapEffect>
  );
};

export default React.memo(LedgerContactRow);
