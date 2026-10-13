import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {withAlpha} from '../utils/color';

const PhoneClaimDecisionModal = ({
  visible,
  claim,
  loadingAction = '',
  onApprove,
  onReject,
  onBlock,
}) => {
  const {colors} = useTheme();
  const requesterName = String(claim?.requesterName || 'User').trim() || 'User';
  const phoneLastFour = String(claim?.phoneLastFour || '').trim();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Phone Number Change Request</Text>
          <Text style={styles.message}>
            {requesterName} wants to use
            {phoneLastFour ? ` the number ending in ${phoneLastFour}.` : ' your phone number.'}
          </Text>
          <Text style={styles.subtext}>
            Please choose whether to approve, reject, or reject and block this request.
          </Text>

          <TouchableOpacity
            style={[styles.button, styles.approveButton]}
            disabled={Boolean(loadingAction)}
            onPress={onApprove}>
            {loadingAction === 'approve' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.approveButtonText}>Approve</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.rejectButton]}
            disabled={Boolean(loadingAction)}
            onPress={onReject}>
            {loadingAction === 'reject' ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.rejectButtonText}>Reject</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.blockButton]}
            disabled={Boolean(loadingAction)}
            onPress={onBlock}>
            {loadingAction === 'block' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.blockButtonText}>Reject and Block</Text>
            )}
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.modal,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  message: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.primary,
  },
  subtext: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  button: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    marginTop: 20,
    backgroundColor: colors.success,
  },
  rejectButton: {
    backgroundColor: withAlpha(colors.error, 0.1),
  },
  blockButton: {
    backgroundColor: colors.primary,
  },
  approveButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  rejectButtonText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '700',
  },
  blockButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default PhoneClaimDecisionModal;
