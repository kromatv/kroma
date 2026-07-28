// The settings registry's OPTION LISTS and value labels.
//
// The group wiring is covered next door in groups.test.tsx; what is untested is
// each declaration's own callbacks, and one of them encodes a design rule that
// is easy to lose: a subtitle preference has THREE kinds of value, not two.
// "No preference" (use whatever the file offers) and "off" (never show them)
// are different answers, and a picker that collapses them leaves a viewer no
// way to say "never" - they can only decline to choose.

import { LANG_NO_PREF, LANG_OFF, LOCALES, type Locale, type Translate } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import {
  audioLanguageSetting,
  keyboardLayoutSetting,
  localeSetting,
  subtitleLanguageSetting,
} from './registry';

/** Enough of a Translate for langOptions to sort by: it orders languages by
 *  their translated NAME, so the identity here keeps that order stable and
 *  predictable rather than locale-dependent. */
const t = ((key: string) => key) as unknown as Translate;
const locale = 'en' as Locale;

/** `options` is declared on choice items only; narrowing keeps the casts here
 *  rather than at every call. */
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
    // Unreachable through the picker - options() only offers LOCALES - but a
    // stored value from an older build can arrive here.
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
    // The whole point: "never show subtitles" is a real answer, and it is not
    // the same as declining to express one.
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
    // Three distinct rows: collapsing any pair loses a choice the viewer made.
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
    // A layout with no label renders an empty row, which is worse than not
    // offering it: the row is selectable and says nothing.
    for (const option of options) expect(labelOf(keyboardLayoutSetting, option)).toBeTruthy();
  });
});
