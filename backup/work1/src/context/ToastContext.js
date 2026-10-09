import React, {createContext, useState, useCallback} from 'react';
import {Platform, ToastAndroid} from 'react-native';

export const ToastContext = createContext();

export const ToastProvider = ({children}) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success', duration = 2000) => {
    if (Platform.OS === 'android') {
      const toastDuration =
        duration && duration <= 2000
          ? ToastAndroid.SHORT
          : ToastAndroid.LONG;
      ToastAndroid.showWithGravity(
        message,
        toastDuration,
        ToastAndroid.BOTTOM
      );
      return null;
    }
    const id = Math.random().toString(36).substr(2, 9);
    const toast = {id, message, type, duration};

    setToasts(prev => [...prev, toast]);

    setTimeout(() => {
      dismissToast(id);
    }, duration);

    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = {
    showToast,
    showUniversalToast: showToast,
    dismissToast,
    toasts,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
};
