import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {useColorScheme} from 'react-native';
import {lightColors, darkColors} from '../utils/theme';
import {
  readColorSchemePreference,
  writeColorSchemePreference,
} from '../utils/darkModePreference';
import {subscribeToBackupRestored} from '../services/backupRestoreEvents';

const ThemeContext = createContext({
  colors: lightColors,
  isDark: false,
  themePreference: 'system',
  setThemePreference: () => {},
  isReady: false,
});

export const ThemeProvider = ({children}) => {
  const systemScheme = useColorScheme(); // 'dark' | 'light' | null
  const [themePreference, setThemePreferenceState] = useState('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadThemePreference = async () => {
      const stored = await readColorSchemePreference();
      if (isMounted) {
        setThemePreferenceState(stored);
        setIsReady(true);
      }
    };
    loadThemePreference();
    const subscription = subscribeToBackupRestored(() => {
      loadThemePreference();
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const setThemePreference = useCallback(async value => {
    setThemePreferenceState(value);
    await writeColorSchemePreference(value);
  }, []);

  const isDark = useMemo(() => {
    if (themePreference === 'dark') {return true;}
    if (themePreference === 'light') {return false;}
    return systemScheme === 'dark';
  }, [themePreference, systemScheme]);

  const value = useMemo(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      themePreference,
      setThemePreference,
      isReady,
    }),
    [isDark, themePreference, setThemePreference, isReady],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
