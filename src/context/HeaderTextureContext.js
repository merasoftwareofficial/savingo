import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter} from 'react-native';
import {
  DEFAULT_HEADER_TEXTURE_ID,
  HEADER_TEXTURE_CHANGED_EVENT,
  loadStoredHeaderTextureId,
  normalizeHeaderTextureId,
} from '../utils/headerTextureTheme';
import {subscribeToBackupRestored} from '../services/backupRestoreEvents';

const HeaderTextureContext = createContext({
  themeId: DEFAULT_HEADER_TEXTURE_ID,
  isReady: false,
});

export const HeaderTextureProvider = ({children}) => {
  const [themeId, setThemeId] = useState(DEFAULT_HEADER_TEXTURE_ID);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadTheme = async () => {
      try {
        const storedId = await loadStoredHeaderTextureId();
        if (isMounted) {
          setThemeId(storedId);
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    loadTheme();

    const subscription = DeviceEventEmitter.addListener(
      HEADER_TEXTURE_CHANGED_EVENT,
      nextId => {
        if (!isMounted) {
          return;
        }
        setThemeId(normalizeHeaderTextureId(nextId));
      },
    );
    const restoreSubscription = subscribeToBackupRestored(() => {
      loadTheme();
    });

    return () => {
      isMounted = false;
      subscription.remove();
      restoreSubscription.remove();
    };
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      isReady,
    }),
    [themeId, isReady],
  );

  return (
    <HeaderTextureContext.Provider value={value}>
      {children}
    </HeaderTextureContext.Provider>
  );
};

export const useHeaderTextureTheme = () => useContext(HeaderTextureContext);
