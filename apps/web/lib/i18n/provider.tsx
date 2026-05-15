'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LANGUAGE,
  LANG_STORAGE_KEY,
  LANGUAGES,
  detectBrowserLanguage,
  type LanguageCode,
} from './config';
import en from './messages/en.json';
import id from './messages/id.json';
import es from './messages/es.json';
import vi from './messages/vi.json';
import zh from './messages/zh.json';
import tl from './messages/tl.json';

/**
 * Bundled dictionaries. We import statically so the bundler can tree-
 * shake unused languages from server components — at the cost of all
 * dictionaries hitting the client bundle. Each language file is ~3 KB
 * gzipped, so the combined cost (~20 KB for 6 languages) is acceptable
 * versus the complexity of dynamic per-route imports.
 */
type Dictionary = Record<string, unknown>;
const DICTIONARIES: Record<LanguageCode, Dictionary> = {
  en: en as Dictionary,
  id: id as Dictionary,
  es: es as Dictionary,
  vi: vi as Dictionary,
  zh: zh as Dictionary,
  tl: tl as Dictionary,
};

interface I18nContextValue {
  lang: LanguageCode;
  setLang: (next: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provider that reads the persisted language preference, falls back to
 * the browser locale, and exposes a `t()` helper for components.
 *
 * Language switches are persisted to localStorage and a cookie so the
 * preference survives reloads. We don't re-route by language — switches
 * just re-render the tree with the new dictionary. SEO-grade per-locale
 * routing is a Phase 9 concern when we have enough traffic to care.
 */
export function I18nProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang?: LanguageCode;
}) {
  // SSR-safe initial state: caller can pass the cookie-derived language
  // from the server to avoid a flash of English on first paint.
  const [lang, setLangState] = useState<LanguageCode>(initialLang ?? DEFAULT_LANGUAGE);

  // On mount: read persisted preference or detect browser.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY) as LanguageCode | null;
      const codes = LANGUAGES.map((l) => l.code) as readonly string[];
      if (stored && codes.includes(stored)) {
        setLangState(stored);
        return;
      }
    } catch {
      // Storage blocked (incognito quota error / privacy mode). Fall back
      // to browser detection silently.
    }
    setLangState(detectBrowserLanguage());
  }, []);

  const setLang = useCallback((next: LanguageCode) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
      // Cookie too — lets the server hint the right language on the next
      // request. 1-year expiry; SameSite=Lax so OAuth callbacks still
      // carry it.
      document.cookie = `${LANG_STORAGE_KEY}=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
    } catch {
      // Persistence failed — language still switches for this session.
    }
  }, []);

  // `t(key, vars?)` — looks up a dotted key in the current dictionary,
  // falls back to English, then to the key itself if neither has it.
  // Variables: `t('wallet.sendOnBaseOnly', { network: 'Base' })` replaces
  // `{network}` in the string.
  const t = useMemo(() => {
    const dict = DICTIONARIES[lang] ?? DICTIONARIES.en;
    const fallback = DICTIONARIES.en;
    return (key: string, vars?: Record<string, string | number>): string => {
      const value = resolveKey(dict, key) ?? resolveKey(fallback, key) ?? key;
      if (typeof value !== 'string') return key;
      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (_m, name) =>
        name in vars ? String(vars[name]) : `{${name}}`,
      );
    };
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
  );
}

function resolveKey(dict: Dictionary, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

/** Convenience — most call sites only need `t`. */
export function useT() {
  return useI18n().t;
}
