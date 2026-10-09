import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  readCachedSessionUser,
  subscribeSessionUserUpdates,
  writeCachedSessionUser,
} from '../services/sessionService';
import {subscribeToBackupRestored} from '../services/backupRestoreEvents';

const SessionUserContext = createContext({
  sessionUser: null,
  isReady: false,
  refreshSessionUser: async () => null,
  updateSessionUser: async () => null,
});

const hasUserPayload = value =>
  Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);

export const SessionUserProvider = ({children}) => {
  const [sessionUser, setSessionUser] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const sessionUserRef = useRef(null);

  useEffect(() => {
    sessionUserRef.current = sessionUser;
  }, [sessionUser]);

  const refreshSessionUser = useCallback(async () => {
    try {
      const cachedUser = await readCachedSessionUser();
      const resolved = hasUserPayload(cachedUser) ? cachedUser : null;
      sessionUserRef.current = resolved;
      setSessionUser(resolved);
      return resolved;
    } catch {
      return sessionUserRef.current;
    }
  }, []);

  const updateSessionUser = useCallback(async nextUser => {
    const mergedPayload = {
      ...(sessionUserRef.current || {}),
      ...(nextUser || {}),
    };
    const persistedUser = await writeCachedSessionUser(mergedPayload);
    const resolved = hasUserPayload(persistedUser) ? persistedUser : null;
    sessionUserRef.current = resolved;
    setSessionUser(resolved);
    return resolved;
  }, []);

  useEffect(() => {
    let mounted = true;
    refreshSessionUser().finally(() => {
      if (mounted) {
        setIsReady(true);
      }
    });
    const unsubscribe = subscribeSessionUserUpdates(nextUser => {
      const resolved = hasUserPayload(nextUser) ? nextUser : null;
      sessionUserRef.current = resolved;
      setSessionUser(resolved);
    });
    const restoreSubscription = subscribeToBackupRestored(() => {
      refreshSessionUser();
    });
    return () => {
      mounted = false;
      unsubscribe();
      restoreSubscription.remove();
    };
  }, [refreshSessionUser]);

  const value = useMemo(
    () => ({
      sessionUser,
      isReady,
      refreshSessionUser,
      updateSessionUser,
    }),
    [sessionUser, isReady, refreshSessionUser, updateSessionUser],
  );

  return (
    <SessionUserContext.Provider value={value}>
      {children}
    </SessionUserContext.Provider>
  );
};

export const useSessionUser = () => useContext(SessionUserContext);
