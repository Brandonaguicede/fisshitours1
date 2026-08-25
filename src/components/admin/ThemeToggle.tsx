import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pft-admin-theme';
type Theme = 'light' | 'dark';

function resolveInitialTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  if (current === 'light' || current === 'dark') return current;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode): theme still applies for this session.
    }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function onSystemChange(event: MediaQueryListEvent) {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (stored !== 'light' && stored !== 'dark') {
        setTheme(event.matches ? 'dark' : 'light');
      }
    }
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  const isDark = theme === 'dark';

  return (
    <button
      className="admin-icon-btn admin-theme-toggle"
      type="button"
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-pressed={isDark}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default ThemeToggle;
