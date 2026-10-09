import React, {createContext, useContext, useReducer, useCallback, useEffect, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LedgerContactStateContext = createContext();

const ACTIONS = {
  UPDATE_CONTACT_STATE: 'UPDATE_CONTACT_STATE',
  ADD_TO_QUEUE: 'ADD_TO_QUEUE',
  CLEAR_FROM_QUEUE: 'CLEAR_FROM_QUEUE',
  RETRY_QUEUE_ITEM: 'RETRY_QUEUE_ITEM',
  SET_PERSISTING: 'SET_PERSISTING',
};

const initialState = {
  contacts: {}, // {contactId: {appInstallState, ...}}
  persistenceQueue: [], // [{contactId, appInstallState, retryCount, timestamp}]
  isPersisting: false,
};

const reducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.UPDATE_CONTACT_STATE:
      return {
        ...state,
        contacts: {
          ...state.contacts,
          [action.payload.contactId]: {
            ...state.contacts[action.payload.contactId],
            appInstallState: action.payload.appInstallState,
          },
        },
      };

    case ACTIONS.ADD_TO_QUEUE:
      const existingIndex = state.persistenceQueue.findIndex(
        item => item.contactId === action.payload.contactId,
      );
      if (existingIndex >= 0) {
        const updated = [...state.persistenceQueue];
        updated[existingIndex] = {
          ...action.payload,
          retryCount: 0,
          timestamp: Date.now(),
        };
        return {...state, persistenceQueue: updated};
      }
      return {
        ...state,
        persistenceQueue: [
          ...state.persistenceQueue,
          {
            ...action.payload,
            retryCount: 0,
            timestamp: Date.now(),
          },
        ],
      };

    case ACTIONS.CLEAR_FROM_QUEUE:
      return {
        ...state,
        persistenceQueue: state.persistenceQueue.filter(
          item => item.contactId !== action.payload.contactId,
        ),
      };

    case ACTIONS.RETRY_QUEUE_ITEM:
      return {
        ...state,
        persistenceQueue: state.persistenceQueue.map(item =>
          item.contactId === action.payload.contactId
            ? {...item, retryCount: item.retryCount + 1}
            : item,
        ),
      };

    case ACTIONS.SET_PERSISTING:
      return {...state, isPersisting: action.payload};

    default:
      return state;
  }
};

export const LedgerContactStateProvider = ({children}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const persistenceIntervalRef = useRef(null);

  const updateContactState = useCallback(
    ({contactId, appInstallState}) => {
      // Update in-memory immediately
      dispatch({
        type: ACTIONS.UPDATE_CONTACT_STATE,
        payload: {contactId, appInstallState},
      });

      // Add to queue for persistence
      dispatch({
        type: ACTIONS.ADD_TO_QUEUE,
        payload: {contactId, appInstallState},
      });
    },
    [],
  );

  // Persistence service (background)
  const persistQueue = useCallback(async () => {
    if (state.persistenceQueue.length === 0 || state.isPersisting) {
      return;
    }

    dispatch({type: ACTIONS.SET_PERSISTING, payload: true});

    try {
      // Get all contacts from storage
      const raw = await AsyncStorage.getItem('ledgerContacts');
      const contacts = raw ? JSON.parse(raw) : [];

      // Update with queued changes
      state.persistenceQueue.forEach(queueItem => {
        const contactIndex = contacts.findIndex(
          contact => String(contact?.recordID || '').trim() === queueItem.contactId,
        );

        if (contactIndex >= 0) {
          contacts[contactIndex] = {
            ...contacts[contactIndex],
            appInstallState: queueItem.appInstallState,
          };
        }
      });

      // Write to storage
      await AsyncStorage.setItem('ledgerContacts', JSON.stringify(contacts));

      // Clear queue on success
      state.persistenceQueue.forEach(queueItem => {
        dispatch({
          type: ACTIONS.CLEAR_FROM_QUEUE,
          payload: {contactId: queueItem.contactId},
        });
      });

      if (__DEV__) {
        console.log('[LEDGER_PERSISTENCE] Queue persisted successfully', {
          itemCount: state.persistenceQueue.length,
        });
      }
    } catch (error) {
      // Retry logic: exponential backoff
      state.persistenceQueue.forEach(queueItem => {
        if (queueItem.retryCount < 3) {
          dispatch({
            type: ACTIONS.RETRY_QUEUE_ITEM,
            payload: {contactId: queueItem.contactId},
          });
        }
      });

      if (__DEV__) {
        console.error('[LEDGER_PERSISTENCE] Error persisting queue', {
          error: error.message,
          queueLength: state.persistenceQueue.length,
        });
      }
    } finally {
      dispatch({type: ACTIONS.SET_PERSISTING, payload: false});
    }
  }, [state.persistenceQueue, state.isPersisting]);

  // Start persistence service (every 2 seconds)
  useEffect(() => {
    persistenceIntervalRef.current = setInterval(() => {
      persistQueue();
    }, 2000);

    return () => {
      if (persistenceIntervalRef.current) {
        clearInterval(persistenceIntervalRef.current);
      }
    };
  }, [persistQueue]);

  const value = {
    contactStates: state.contacts,
    persistenceQueue: state.persistenceQueue,
    isPersisting: state.isPersisting,
    updateContactState,
  };

  return (
    <LedgerContactStateContext.Provider value={value}>
      {children}
    </LedgerContactStateContext.Provider>
  );
};

export const useLedgerContactState = () => {
  const context = useContext(LedgerContactStateContext);
  if (!context) {
    throw new Error('useLedgerContactState must be used within LedgerContactStateProvider');
  }
  return context;
};
