import {
  createContext,
  use,
  useLayoutEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from 'react';

/**
 * The canonical set of selectable themes, in display order. This is the single
 * source of truth for which themes exist; the `Theme` union is derived from it,
 * and UIs (e.g. the Settings picker) iterate it to render their options. Labels
 * and icons are a presentation concern and live with the consuming view.
 */
export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/** Type guard narrowing an arbitrary value (e.g. a Radix `string`) to a `Theme`. */
export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value);

type ThemeProviderState = {
  /** The user's preference: may be `system`. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = 'findias-theme';
const DEFAULT_THEME: Theme = 'system';

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

/** Read the persisted preference, falling back to the default for unknown values. */
const readStoredTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : DEFAULT_THEME;
};

type ThemeProviderProps = {
  children: ReactNode;
};

/**
 * Applies the active color scheme to `<html>` and exposes the user's preference.
 * `system` follows the OS via `prefers-color-scheme` and reacts to live changes.
 * The choice is persisted in `localStorage` so it survives restarts without an
 * IPC round-trip (avoids a startup theme flash). The window only shows on
 * `ready-to-show`, so the layout-effect class swap lands before first paint.
 */
export const ThemeProvider: FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useLayoutEffect(() => {
    const root = window.document.documentElement;

    const apply = (resolved: 'light' | 'dark'): void => {
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
    };

    if (theme !== 'system') {
      apply(theme);
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (): void => apply(media.matches ? 'dark' : 'light');
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [theme]);

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      setTheme: (next: Theme) => {
        localStorage.setItem(STORAGE_KEY, next);
        setThemeState(next);
      },
    }),
    [theme],
  );

  return <ThemeProviderContext value={value}>{children}</ThemeProviderContext>;
};

/** Access the current theme preference and setter; must be used under a ThemeProvider. */
export const useTheme = (): ThemeProviderState => {
  const context = use(ThemeProviderContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
