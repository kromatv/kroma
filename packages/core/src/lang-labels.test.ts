import type { AudioTrack } from '@kromatv/client/media';
import type { Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { audioTrackLabel, langKey, langName, langOptions } from './lang-labels';
import { PREF_LANGS } from './lang-table';

const t = ((key: string) => key) as Translate;

describe('langKey', () => {
  it('resolves every spelling of a labelled language to one catalog key', () => {
    expect(langKey('fr')).toBe('lang.fr');
    expect(langKey('fre')).toBe('lang.fr');
    expect(langKey('fra')).toBe('lang.fr');
  });

  it('keeps a dub variant the catalog names, and only that one', () => {
    // fr-CA is offered (VFQ is a different dub from VFF, with a different cast),
    // so it keeps its own name rather than collapsing to French.
    expect(langKey('fr-CA')).toBe('lang.fr-CA');
    expect(langKey('fr-ca')).toBe('lang.fr-CA'); // the server stores it lower-cased
    expect(langKey('fre-CA')).toBe('lang.fr-CA');
    expect(langKey('es-419')).toBe('lang.es-419');
    // A region nobody offers falls back to the base rather than to nothing.
    expect(langKey('fr-BE')).toBe('lang.fr');
    expect(langKey('pt-AO')).toBe('lang.pt');
  });

  it('names every language a muxer can plausibly tag, not a curated few', () => {
    expect(langKey('swe')).toBe('lang.sv');
    expect(langKey('pol')).toBe('lang.pl');
    expect(langKey('tha')).toBe('lang.th');
    // Deprecated tags still written by old encoders.
    expect(langKey('iw')).toBe('lang.he');
    expect(langKey('in')).toBe('lang.id');
    // Filipino has no 639-1 code; "tl" is the tag files actually carry.
    expect(langKey('tl')).toBe('lang.fil');
  });

  it('is null for a code no catalog entry covers', () => {
    expect(langKey('xyz')).toBeNull();
    expect(langKey(null)).toBeNull();
  });
});

describe('PREF_LANGS / langOptions', () => {
  const named = ((key: string) => NAMES[key] ?? key) as Translate;
  const NAMES: Record<string, string> = {
    'lang.sv': 'Suédois',
    'lang.de': 'Allemand',
    'lang.fr': 'Français',
  };

  it('offers the whole ISO 639-1 set, plus the codes that never got one', () => {
    // The count is not the point; "no longer a curated handful" is.
    expect(PREF_LANGS.length).toBeGreaterThan(150);
    for (const code of ['sv', 'pl', 'th', 'ar', 'hi', 'tr', 'uk', 'vi', 'fil', 'yue']) {
      expect(PREF_LANGS).toContain(code);
    }
  });

  it('names every offered code (no raw keys leak into a picker)', () => {
    for (const code of PREF_LANGS) {
      expect(langKey(code)).toBe(`lang.${code}`);
    }
  });

  it('orders rows by their translated label, not by code', () => {
    const labels = langOptions(named, 'fr').map((o) => o.label);
    expect(labels.indexOf('Allemand')).toBeLessThan(labels.indexOf('Français'));
    expect(labels.indexOf('Français')).toBeLessThan(labels.indexOf('Suédois'));
  });

  it('still orders rows on a runtime that rejects the locale', () => {
    const sharing = ((key: string) =>
      key === 'lang.fr-CA' ? 'Français' : (NAMES[key] ?? key)) as Translate;
    const labels = langOptions(sharing, 'not a language tag').map((o) => o.label);
    expect(labels.indexOf('Allemand')).toBeLessThan(labels.indexOf('Suédois'));
    expect(labels.filter((l) => l === 'Français')).toHaveLength(2);
  });
});

describe('langName', () => {
  it('maps 2- and 3-letter ISO codes to a catalog key', () => {
    expect(langName(t, 'fr')).toBe('lang.fr');
    expect(langName(t, 'fra')).toBe('lang.fr');
    expect(langName(t, 'FRE')).toBe('lang.fr');
    expect(langName(t, 'eng')).toBe('lang.en');
  });

  it('upper-cases an unknown code, and returns null when absent', () => {
    expect(langName(t, 'xx')).toBe('XX');
    expect(langName(t, null)).toBeNull();
    expect(langName(t, '')).toBeNull();
  });
});

describe('audioTrackLabel', () => {
  const track = (p: Partial<AudioTrack>): AudioTrack => p as AudioTrack;

  it('joins name, channel layout and upper-cased codec', () => {
    expect(audioTrackLabel(t, track({ language: 'fr', channels: 6, codec: 'eac3' }))).toBe(
      'lang.fr · 5.1 · EAC3',
    );
  });

  it('prefers a stream title over the language name', () => {
    expect(
      audioTrackLabel(
        t,
        track({ title: '  Commentary ', language: 'en', channels: 2, codec: 'aac' }),
      ),
    ).toBe('Commentary · 2.0 · AAC');
  });

  it('drops missing parts', () => {
    expect(audioTrackLabel(t, track({ language: 'en', codec: 'aac' }))).toBe('lang.en · AAC');
    expect(audioTrackLabel(t, track({ channels: 2 }))).toBe('2.0');
  });

  it('returns undefined for no track', () => {
    expect(audioTrackLabel(t, null)).toBeUndefined();
    expect(audioTrackLabel(t, undefined)).toBeUndefined();
  });

  it('returns undefined rather than an empty label for a track with nothing to say', () => {
    expect(audioTrackLabel(t, track({}))).toBeUndefined();
  });
});
