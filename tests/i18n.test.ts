import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { pt } from '../src/i18n/pt';
import { detectLanguage, isLanguage, localeTag, translate, type TranslationKey } from '../src/i18n';

const placeholders = (value: string) => (value.match(/\{\w+\}/g) || []).sort();

describe('translations', () => {
  it('covers every English key in every other language, with nothing left over', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    expect(Object.values(pt).filter((value) => !value.trim())).toEqual([]);
  });

  it('keeps the same placeholders as the English source, so no value goes missing', () => {
    for (const key of Object.keys(en) as TranslationKey[]) {
      expect({ key, vars: placeholders(pt[key]) }).toEqual({ key, vars: placeholders(en[key]) });
    }
  });

  it('actually translates rather than echoing English back', () => {
    expect(translate('pt', 'home.title')).toBe('O que você quer assistir?');
    expect(translate('en', 'home.title')).toBe('What do you want to watch?');
  });
});

describe('translate', () => {
  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(translate('en', 'live.channelCount', { count: 42 })).toBe('42 channels');
    expect(translate('pt', 'live.channelCount', { count: 42 })).toBe('42 canais');
    expect(translate('en', 'details.season', {})).toBe('Season {number}');
    expect(translate('en', 'live.channelCount')).toBe('{count} channels');
  });

  it('falls back to English rather than showing a raw key', () => {
    expect(translate('pt', 'settings.save')).toBe('Salvar');
    // A language with no dictionary, and a key a dictionary has not caught up with.
    expect(translate('es' as 'pt', 'settings.save')).toBe('Save');
    expect(translate('pt', 'settings.missing' as TranslationKey)).toBe('settings.missing');
  });
});

describe('language detection', () => {
  it('reads the base tag so pt-BR, pt-PT and pt all mean Portuguese', () => {
    expect(detectLanguage(['pt-BR'])).toBe('pt');
    expect(detectLanguage(['pt'])).toBe('pt');
    expect(detectLanguage(['PT-pt'])).toBe('pt');
  });

  it('skips languages it has no dictionary for and ends on English', () => {
    expect(detectLanguage(['es-ES', 'pt-BR'])).toBe('pt');
    expect(detectLanguage(['es-ES', 'fr'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage([''])).toBe('en');
  });

  it('recognizes only supported languages and maps them to locales', () => {
    expect(isLanguage('pt')).toBe(true);
    expect(isLanguage('es')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(localeTag('pt')).toBe('pt-BR');
    expect(localeTag('en')).toBe('en-US');
  });
});
