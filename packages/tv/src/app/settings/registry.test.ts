// The settings registry's option lists and value labels; the group wiring is
// covered in groups.test.tsx.

import { LANG_NO_PREF, LANG_OFF, LOCALES, type Locale, type Translate } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  artworkSetting,
  audioLanguageSetting,
  keyboardLayoutSetting,
  localeSetting,
  subtitleLanguageSetting,
} from './registry';
import { ARTWORK_SCALE } from './store';

// langOptions sorts by the translated name, so an identity translator keeps the
// order stable rather than locale-dependent.
const t = ((key: string) => key) as unknown as Translate;
const locale = 'en' as Locale;

const optionsOf = (item: typeof localeSetting) =>
  (item as { options: (t: Translate, l: Locale) => readonly string[] }).options(t, locale);
const labelOf = (item: typeof localeSetting, value: string) =>
  (item as { valueLabel: (v: string) => string }).valueLabel(value);

describe('locale setting', () => {
  it('offers exactly the shipped locales', () => {
    expect(optionsOf(localeSetting)).toEqual(LOCALES.map((l) => l.code));
  });

  it('labels a locale with its own name', () => {
    const first = LOCALES[0];
    if (!first) throw new Error('no locales are shipped');
    expect(labelOf(localeSetting, first.code)).toBe(first.labelKey);
  });

  it('falls back rather than showing a blank row for an unknown code', () => {
    // Unreachable through the picker, but a stored value from an older build can
    // arrive here.
    expect(labelOf(localeSetting, 'xx')).toBe('common.language');
  });
});

describe('language preferences', () => {
  it('audio offers "no preference" first, then the languages', () => {
    const options = optionsOf(audioLanguageSetting);
    expect(options[0]).toBe(LANG_NO_PREF);
    expect(options.length).toBeGreaterThan(1);
    // Audio has no "off": a title always plays some audio track.
    expect(options).not.toContain(LANG_OFF);
  });

  it('subtitles offer "off" as well, distinct from "no preference"', () => {
    const options = optionsOf(subtitleLanguageSetting);
    expect(options.slice(0, 2)).toEqual([LANG_NO_PREF, LANG_OFF]);
    // "Never show subtitles" is a real answer, distinct from declining to choose.
    expect(new Set(options).size).toBe(options.length);
  });

  it('both preferences draw from the same language list', () => {
    const audio = optionsOf(audioLanguageSetting).filter((c) => c !== LANG_NO_PREF);
    const subs = optionsOf(subtitleLanguageSetting).filter(
      (c) => c !== LANG_NO_PREF && c !== LANG_OFF,
    );
    expect(subs).toEqual(audio);
  });

  it('labels off, no-preference and a real language differently', () => {
    const off = labelOf(subtitleLanguageSetting, LANG_OFF);
    const none = labelOf(subtitleLanguageSetting, LANG_NO_PREF);
    const french = labelOf(subtitleLanguageSetting, 'fr');
    expect(off).toBe('player.subtitlesOff');
    expect(none).toBe('account.noPreference');
    expect(new Set([off, none, french]).size).toBe(3);
  });

  it('reads an unknown stored code as "no preference" rather than blank', () => {
    expect(labelOf(audioLanguageSetting, 'zz')).toBe('account.noPreference');
  });
});

describe('keyboard layout setting', () => {
  it('labels every layout it offers', () => {
    const options = optionsOf(keyboardLayoutSetting);
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) expect(labelOf(keyboardLayoutSetting, option)).toBeTruthy();
  });
});

describe('artwork quality setting', () => {
  it('offers exactly the scales the store knows how to apply', () => {
    // A row the store cannot resolve would set the scale to `undefined` and
    // every URL minted after it would ask for NaN pixels.
    expect(optionsOf(artworkSetting)).toEqual(Object.keys(ARTWORK_SCALE));
  });

  it('labels every scale it offers', () => {
    for (const option of optionsOf(artworkSetting)) {
      expect(labelOf(artworkSetting, option)).toBe(`artworkQuality.${option}`);
    }
  });
});
