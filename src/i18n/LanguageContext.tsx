import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type Language = 'es' | 'en';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Reads the saved language outside React (module-level services, class
 * components) without needing a hook. Same source of truth and same
 * default as LanguageProvider's own initial state.
 */
export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try { return window.localStorage.getItem('language') === 'es' ? 'es' : 'en'; }
  catch { return 'en'; }
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  useEffect(() => {
    try { window.localStorage.setItem('language', language); } catch { /* Private browsers retain the in-memory preference. */ }
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    toggleLanguage: () => setLanguageState((current) => (current === 'es' ? 'en' : 'es')),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
