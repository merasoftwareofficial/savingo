import React from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  readCachedSessionUser,
  subscribeSessionUserUpdates,
} from '../services/sessionService';
import {subscribeToBackupRestored} from '../services/backupRestoreEvents';

const DEFAULT_CURRENCY_SYMBOL = '\u20B9';

const getSymbolFromUser = userData => {
  return (
    userData?.currencySymbol ||
    userData?.currency ||
    userData?.currency_symbol ||
    DEFAULT_CURRENCY_SYMBOL
  );
};

export const useCurrencySymbol = () => {
  const [currencySymbol, setCurrencySymbol] = React.useState(
    DEFAULT_CURRENCY_SYMBOL
  );

  const loadCurrencySymbol = React.useCallback(async () => {
    try {
      const userData = await readCachedSessionUser();
      if (Object.keys(userData || {}).length > 0) {
        setCurrencySymbol(getSymbolFromUser(userData));
        return;
      }
    } catch (error) {
      console.error('Failed to load currency symbol:', error);
    }
    setCurrencySymbol(DEFAULT_CURRENCY_SYMBOL);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadCurrencySymbol();
    }, [loadCurrencySymbol])
  );

  React.useEffect(() => {
    const sessionUnsubscribe = subscribeSessionUserUpdates(userData => {
      if (Object.keys(userData || {}).length > 0) {
        setCurrencySymbol(getSymbolFromUser(userData));
      }
    });
    const restoreSubscription = subscribeToBackupRestored(() => {
      loadCurrencySymbol();
    });
    return () => {
      sessionUnsubscribe();
      restoreSubscription.remove();
    };
  }, [loadCurrencySymbol]);

  return currencySymbol;
};

export const DEFAULT_CURRENCY = DEFAULT_CURRENCY_SYMBOL;

