'use client';

import * as React from 'react';
import {THEME_COLORS} from '@/lib/theme-colors';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'clearcalorie-theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined,
);

function applyTheme(theme: Theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  // iOS standalone apps ignore content changes on an existing tag; they only pick up a new element.
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = isDark ? THEME_COLORS.dark : THEME_COLORS.light;
  document.head.appendChild(meta);
  // iOS home-screen apps restyle the status bar live when this tag changes; black-translucent shows white text over the dark page.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', isDark ? 'black-translucent' : 'default');
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
}

function getSnapshot(): Theme {
  return (window.localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
}

function getServerSnapshot(): Theme {
  return 'system';
}

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const theme = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  React.useEffect(() => {
    applyTheme(theme);

    if (theme !== 'system') return;

    // Keep the applied theme in sync while the user has "system" selected.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    listeners.forEach((listener) => listener());
  }, []);

  const value = React.useMemo(() => ({theme, setTheme}), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
