/**
 * Forj i18n — language registry.
 *
 * We deliberately ship a LIGHTWEIGHT custom solution instead of next-intl's
 * `[locale]` route restructure because:
 *   1. Routing-based i18n forces every page under `app/[locale]/...` —
 *      a sweeping refactor that breaks every internal link until done.
 *   2. We're pre-launch — SEO per language isn't a priority yet.
 *   3. Letting the user switch language in-app (localStorage + reload)
 *      covers 95% of MVP needs and lets us expand to route-based later.
 *
 * Adding a new language:
 *   1. Drop a file at `lib/i18n/messages/<code>.json` (mirror `en.json`).
 *   2. Add the entry to LANGUAGES below.
 *   3. That's it — the picker auto-discovers it.
 *
 * The dictionary uses dotted keys (`hero.title`, `nav.jobs`) so we can
 * group related strings and grep cleanly.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'tl', label: 'Filipino', flag: '🇵🇭' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** localStorage key + cookie name. Cookie lets the server hint the right
 *  language on the next request, even though we don't route by it. */
export const LANG_STORAGE_KEY = 'forj:lang';

/** Detect the best initial language from browser settings.
 *  Picks the first navigator.languages entry that matches one of ours;
 *  defaults to English otherwise. */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const codes = LANGUAGES.map((l) => l.code) as readonly string[];
  for (const tag of navigator.languages ?? []) {
    const short = tag.toLowerCase().split('-')[0];
    if (short && codes.includes(short)) return short as LanguageCode;
  }
  return DEFAULT_LANGUAGE;
}
