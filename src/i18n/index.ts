import { en, type Dictionary, type TranslationKey } from './en';
import { pt } from './pt';

export type Language = 'en' | 'pt';
export type { TranslationKey };

const dictionaries: Record<Language, Dictionary> = { en, pt };

/** Endonyms: a language is always listed in its own words, so it stays readable to the person looking for it. */
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português (Brasil)' }
];

const LOCALES: Record<Language, string> = { en: 'en-US', pt: 'pt-BR' };

export const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'pt';

export const localeTag = (language: Language) => LOCALES[language];

/** The tag used by date/time formatting outside a component, kept in step with the provider. */
let activeLocale = LOCALES.en;
export const activeLocaleTag = () => activeLocale;
export function setActiveLocale(language: Language) { activeLocale = LOCALES[language]; }

/** Best guess before the saved preference arrives from the backend: `pt-BR`, `pt`, … all mean Portuguese. */
export function detectLanguage(candidates: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language]): Language {
  for (const candidate of candidates) {
    const base = String(candidate || '').toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export type TranslateVars = Record<string, string | number>;

/** Falls back to English for a key a translation has not caught up with, then to the key itself. */
export function translate(language: Language, key: TranslationKey, vars?: TranslateVars): string {
  const template = dictionaries[language]?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
