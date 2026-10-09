import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AppAlertModal from '../components/ui/AppAlertModal';
import {setAppAlertHandler} from './AppAlertBridge';

const AppAlertContext = createContext({
  showAlert: () => Promise.resolve({actionIndex: -1, action: null}),
  hideAlert: () => {},
  alertError: () => Promise.resolve({actionIndex: -1, action: null}),
  alertSuccess: () => Promise.resolve({actionIndex: -1, action: null}),
  alertConfirm: () => Promise.resolve(false),
});

const normalizeActions = actions => {
  if (Array.isArray(actions) && actions.length > 0) {
    return actions.map(item => ({
      text: String(item?.text || 'OK'),
      style: item?.style || 'default',
      onPress: item?.onPress,
    }));
  }
  return [{text: 'OK', style: 'default'}];
};

export const AppAlertProvider = ({children}) => {
  const [queue, setQueue] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(-1);

  useEffect(() => {
    if (currentAlert || queue.length === 0) {
      return;
    }
    const [first, ...rest] = queue;
    setCurrentAlert(first);
    setQueue(rest);
  }, [currentAlert, queue]);

  const showAlert = useCallback(config => {
    return new Promise(resolve => {
      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: String(config?.title || ''),
        message: String(config?.message || ''),
        actions: normalizeActions(config?.actions),
        resolve,
      };
      setQueue(prev => [...prev, payload]);
    });
  }, []);

  useEffect(() => {
    setAppAlertHandler(showAlert);
    return () => {
      setAppAlertHandler(null);
    };
  }, [showAlert]);

  const hideAlert = useCallback(() => {
    if (!currentAlert) {
      return;
    }
    currentAlert.resolve?.({actionIndex: -1, action: null});
    setProcessing(false);
    setProcessingIndex(-1);
    setCurrentAlert(null);
  }, [currentAlert]);

  const onActionPress = useCallback(async index => {
    if (!currentAlert || processing) {
      return;
    }
    const action = currentAlert.actions?.[index] || null;
    setProcessing(true);
    setProcessingIndex(index);
    try {
      if (typeof action?.onPress === 'function') {
        await Promise.resolve(action.onPress());
      }
      currentAlert.resolve?.({actionIndex: index, action});
    } catch (error) {
      currentAlert.resolve?.({actionIndex: index, action, error});
    } finally {
      setProcessing(false);
      setProcessingIndex(-1);
      setCurrentAlert(null);
    }
  }, [currentAlert, processing]);

  const alertError = useCallback(
    message =>
      showAlert({
        title: 'Error',
        message,
        actions: [{text: 'OK', style: 'destructive'}],
      }),
    [showAlert],
  );

  const alertSuccess = useCallback(
    message =>
      showAlert({
        title: 'Success',
        message,
        actions: [{text: 'OK'}],
      }),
    [showAlert],
  );

  const alertConfirm = useCallback(
    async ({title, message, confirmText = 'Confirm', cancelText = 'Cancel'}) => {
      const result = await showAlert({
        title,
        message,
        actions: [
          {text: cancelText, style: 'cancel'},
          {text: confirmText, style: 'destructive'},
        ],
      });
      return result?.actionIndex === 1;
    },
    [showAlert],
  );

  const contextValue = useMemo(
    () => ({
      showAlert,
      hideAlert,
      alertError,
      alertSuccess,
      alertConfirm,
    }),
    [showAlert, hideAlert, alertError, alertSuccess, alertConfirm],
  );

  return (
    <AppAlertContext.Provider value={contextValue}>
      {children}
      <AppAlertModal
        visible={Boolean(currentAlert)}
        title={currentAlert?.title}
        message={currentAlert?.message}
        actions={currentAlert?.actions || []}
        processing={processing}
        processingIndex={processingIndex}
        onActionPress={onActionPress}
        onRequestClose={hideAlert}
      />
    </AppAlertContext.Provider>
  );
};

export const useAppAlert = () => useContext(AppAlertContext);

export default AppAlertContext;
