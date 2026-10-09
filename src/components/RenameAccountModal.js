import React from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

const RenameAccountModal = ({
  visible,
  value,
  onChange,
  onSave,
  onClose,
  loading,
  inputRef,
  styles,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Rename Account</Text>
          <TextInput
            style={styles.modalTextInput}
            placeholder="Account name"
            value={value}
            onChangeText={onChange}
            editable={!loading}
            showSoftInputOnFocus
            ref={inputRef}
          />
          <TouchableOpacity
            style={[styles.modalAddButton, loading && styles.buttonDisabled]}
            onPress={onSave}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={styles.modalAddButtonText.color} />
            ) : (
              <Text style={styles.modalAddButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default RenameAccountModal;
