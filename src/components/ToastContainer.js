import React from 'react';
import {View, StyleSheet, Modal} from 'react-native';
import Toast from './Toast';
import {useToast} from '../hooks/useToast';

const ToastContainer = () => {
  const {toasts, dismissToast} = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <Modal transparent animationType="none" visible>
      <View style={styles.container} pointerEvents="none">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
});

export default ToastContainer;
