import { createContext } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import { localeTag, setActiveLocale, translate, type Language, type TranslateVars, type TranslationKey } from './index';

export interface I18n {
  language: Language;
  locale: string;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
}

const build = (language: Language): I18n => ({ language, locale: localeTag(language), t: (key, vars) => translate(language, key, vars) });

const I18nContext = createContext<I18n>(build('en'));

export function I18nProvider({ language, children }: { language: Language; children: preact.ComponentChildren }) {
  // Set during render so helpers called outside the tree (formatTime) format in the language on screen.
  setActiveLocale(language);
  const value = useMemo(() => build(language), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { return useContext(I18nContext); }
export function useTranslate() { return useI18n().t; }
