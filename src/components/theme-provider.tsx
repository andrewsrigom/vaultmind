'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type Theme = 'dark' | 'light';

type ThemeContextValue = {
  isDarkMode: boolean;
  setTheme: (theme: Theme) => void;
  theme: Theme;
  toggleTheme: () => void;
};

const themeStorageKey = 'vaultmind-theme';
const themeChangeEventName = 'vaultmind-theme-change';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredTheme(): Theme | null {
  const storedTheme = window.localStorage.getItem(themeStorageKey);

  return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
}

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function getThemeSnapshot(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

function getServerThemeSnapshot(): Theme {
  return 'light';
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleStorage = (event: StorageEvent) => {
    if (event.key === themeStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener(themeChangeEventName, onStoreChange);
  window.addEventListener('storage', handleStorage);
  mediaQuery.addEventListener('change', onStoreChange);

  return () => {
    window.removeEventListener(themeChangeEventName, onStoreChange);
    window.removeEventListener('storage', handleStorage);
    mediaQuery.removeEventListener('change', onStoreChange);
  };
}

function notifyThemeChange() {
  window.dispatchEvent(new Event(themeChangeEventName));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme: Theme) => {
    window.localStorage.setItem(themeStorageKey, nextTheme);
    applyTheme(nextTheme);
    notifyThemeChange();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({
      isDarkMode: theme === 'dark',
      setTheme,
      theme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }

  return context;
}
