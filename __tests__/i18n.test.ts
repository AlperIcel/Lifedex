/**
 * Tests for the i18n engine (src/i18n). Covers the pure translate() lookup +
 * interpolation + fallback chain, and the setLang/getLang round-trip.
 */
import { translate, setLang, getLang, LANGS, LANG_LABEL } from '../src/i18n';

const CAT = {
  en: { hi: 'Hello', greet: 'Hi {name}', onlyEn: 'English only' },
  de: { hi: 'Hallo', greet: 'Hallo {name}' },
} as const;

describe('translate', () => {
  it('returns the string for the active language', () => {
    expect(translate(CAT, 'de', 'hi')).toBe('Hallo');
    expect(translate(CAT, 'en', 'hi')).toBe('Hello');
  });

  it('falls back to English when a key is missing in the target language', () => {
    expect(translate(CAT, 'de', 'onlyEn')).toBe('English only');
  });

  it('falls back to the key itself when missing everywhere', () => {
    // @ts-expect-error — intentionally unknown key
    expect(translate(CAT, 'de', 'nope')).toBe('nope');
  });

  it('interpolates {placeholder} vars', () => {
    expect(translate(CAT, 'de', 'greet', { name: 'Alper' })).toBe('Hallo Alper');
    expect(translate(CAT, 'en', 'greet', { name: 'Sam' })).toBe('Hi Sam');
  });

  it('leaves unknown placeholders intact', () => {
    expect(translate(CAT, 'en', 'greet', { other: 'x' })).toBe('Hi {name}');
  });
});

describe('language switch', () => {
  it('has English and German', () => {
    expect(LANGS).toEqual(['en', 'de']);
    expect(LANG_LABEL.de).toBe('Deutsch');
  });

  it('setLang updates getLang', () => {
    setLang('de');
    expect(getLang()).toBe('de');
    setLang('en');
    expect(getLang()).toBe('en');
  });
});
