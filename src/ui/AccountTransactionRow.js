import React from 'react';
import {View, Text, Pressable, Image} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import TapEffect from '../components/ui/TapEffect';

const AccountTransactionRow = ({
  item,
  styles,
  themeColors,
  formatCurrency,
  formatDateLabel,
  formatTimeLabel,
  parseEditHistory,
  formatEditHistoryValue,
  isTransferTransaction,
  withDeletedStyle,
  deletedUiStyles,
  renderDeletedBadge,
  renderDeletedNote,
  getDeletedTapEffectProps,
  normalizeImageUri,
  openTransactionMenu,
  openReceiptPreview,
}) => {
  const {txn, balanceAfter, isDeleted, showDate} = item;
  const editCount = Number(txn.edit_count) || 0;
  const editHistory = editCount ? parseEditHistory(txn) : [];
  const isTransfer = isTransferTransaction(txn);
  const isOffSessionEntry = Boolean(String(txn?.off_session_id || '').trim());
  const ecoLeafColor = isOffSessionEntry ? themeColors.text.light : themeColors.success;
  const receiptUri = txn.image_uri ? normalizeImageUri(txn.image_uri) : '';

  return (
    <View>
      {showDate ? (
        <View style={styles.datePill}>
          <Text style={styles.datePillText}>
            {formatDateLabel(txn.transaction_date)}
          </Text>
        </View>
      ) : null}
      <TapEffect
        style={[styles.chatRow, Number(txn.amount) < 0 && styles.chatRowDebit]}
        {...getDeletedTapEffectProps(isDeleted, () => openTransactionMenu(txn))}
        delayLongPress={250}>
        <View
          style={[
            styles.chatBubble,
            Number(txn.amount) > 0 && styles.chatBubbleCredit,
            Number(txn.amount) < 0 && styles.chatBubbleDebit,
            isDeleted && deletedUiStyles.bubble,
          ]}>
          <View style={styles.chatHeader}>
            <View
              style={[
                styles.chatIcon,
                Number(txn.amount) < 0 && styles.chatIconDebit,
                isTransfer && styles.chatIconTransfer,
                isDeleted && deletedUiStyles.iconContainer,
              ]}>
              <Icon
                name={Number(txn.amount) < 0 ? 'arrow-down' : 'arrow-up'}
                size={16}
                color={
                  isDeleted
                    ? themeColors.text.secondary
                    : isTransfer
                    ? themeColors.text.primary
                    : Number(txn.amount) < 0
                    ? themeColors.error
                    : themeColors.success
                }
              />
            </View>
            <Text
              style={withDeletedStyle(
                isDeleted,
                [
                  styles.chatAmount,
                  Number(txn.amount) < 0 && styles.chatAmountDebit,
                  isTransfer && styles.chatAmountTransfer,
                ],
                deletedUiStyles.amount,
              )}>
              {(Number(txn.amount) < 0 ? '-' : '+') +
                formatCurrency(Math.abs(Number(txn.amount) || 0))}
            </Text>
            <View style={styles.chatHeaderRight}>
              <Icon
                name="leaf"
                size={15}
                color={ecoLeafColor}
                style={isDeleted ? {opacity: 0.7} : null}
              />
              {renderDeletedBadge(
                isDeleted,
                deletedUiStyles.badge,
                deletedUiStyles.badgeText,
              )}
            </View>
          </View>
          {isDeleted ? (
            renderDeletedNote(isDeleted)
          ) : txn.remark ? (
            <Text style={styles.chatRemark}>
              {txn.remark}
            </Text>
          ) : null}
          {!isDeleted && receiptUri ? (
            <Pressable
              style={styles.receiptBubbleThumb}
              onPress={() => openReceiptPreview(txn.image_uri)}>
              <Image source={{uri: receiptUri}} style={styles.receiptBubbleImage} />
            </Pressable>
          ) : null}
          <View
            style={[styles.chatMeta, Number(txn.amount) < 0 && styles.chatMetaDebit]}>
            <Text style={styles.chatBalance}>
              {formatCurrency(balanceAfter)}
            </Text>
            <View style={styles.chatMetaRight}>
              <Text style={styles.chatTime}>
                {formatTimeLabel(txn.transaction_date)}
              </Text>
            </View>
          </View>
          {editHistory.length > 1 ? (
            <Text style={styles.editHistoryText}>
              {`Edited: ${editHistory.map(formatEditHistoryValue).join(' -> ')}`}
            </Text>
          ) : null}
        </View>
      </TapEffect>
    </View>
  );
};

export default React.memo(AccountTransactionRow);
