import { describe, expect, it } from 'vitest';
import type { Translate } from './i18n';
import {
  type AudioCandidate,
  langBase,
  langKey,
  langOptions,
  langRegion,
  matchesLang,
  PREF_LANGS,
  preferredAudioIndex,
  preferredSubIndex,
  refineTrackLang,
  type SubtitleCandidate,
  titleLangVariant,
} from './lang';

const audio = (index: number, language: string | null): AudioCandidate => ({ index, language });

const sub = (
  index: number,
  language: string | null,
  over: Partial<SubtitleCandidate> = {},
): SubtitleCandidate => ({ index, language, url: `/s${index}.vtt`, ...over });

describe('langBase', () => {
  it('canonicalizes the spellings a muxer can write', () => {
    expect(langBase('fra')).toBe('fr');
    expect(langBase('FRE')).toBe('fr');
    expect(langBase('fr-FR')).toBe('fr');
    expect(langBase('pt_BR')).toBe('pt');
    expect(langBase(' en ')).toBe('en');
  });

  it('leaves an unknown 3-letter code alone rather than truncating it', () => {
    // "fil" (Filipino) chopped to "fi" would claim it is Finnish; an unmatched
    // code is far better than one that matches the wrong language.
    expect(langBase('fil')).toBe('fil');
    expect(langBase('xyz')).toBe('xyz');
  });

  it('is null for a missing or empty code', () => {
    expect(langBase(null)).toBeNull();
    expect(langBase(undefined)).toBeNull();
    expect(langBase('  ')).toBeNull();
  });

  it('is null for a tag that starts with its separator', () => {
    expect(langBase('-FR')).toBeNull();
    expect(langBase('_BR')).toBeNull();
  });
});

describe('langRegion', () => {
  it('upper-cases the region of a tag that carries one', () => {
    expect(langRegion('pt_br')).toBe('BR');
    expect(langRegion('fr-CA')).toBe('CA');
  });

  it('is null without a region or without a code at all', () => {
    expect(langRegion('fr')).toBeNull();
    expect(langRegion(null)).toBeNull();
    expect(langRegion(undefined)).toBeNull();
    expect(langRegion('')).toBeNull();
  });
});

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
  const t = ((key: string) => NAMES[key] ?? key) as Translate;
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
    for (const code of PREF_LANGS) expect(langKey(code)).toBe(`lang.${code}`);
  });

  it('orders rows by their translated label, not by code', () => {
    const labels = langOptions(t, 'fr').map((o) => o.label);
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

describe('matchesLang', () => {
  it('matches ISO-639-2 aliases against their 2-letter base', () => {
    expect(matchesLang('fr', 'fra')).toBe(true);
    expect(matchesLang('fr', 'fre')).toBe(true);
    expect(matchesLang('en', 'eng')).toBe(true);
    expect(matchesLang('de', 'ger')).toBe(true);
    expect(matchesLang('de', 'deu')).toBe(true);
    expect(matchesLang('pt', 'por')).toBe(true);
  });

  it('matches identical 2-letter codes and is case-insensitive on the preference', () => {
    expect(matchesLang('en', 'en')).toBe(true);
    expect(matchesLang('EN', 'eng')).toBe(true);
  });

  it('does not match different languages or a missing code', () => {
    expect(matchesLang('fr', 'en')).toBe(false);
    expect(matchesLang('fr', null)).toBe(false);
    expect(matchesLang('fr', undefined)).toBe(false);
    expect(matchesLang(null, 'fr')).toBe(false);
  });
});

describe('preferredAudioIndex', () => {
  const tracks = [audio(0, 'eng'), audio(1, 'fra'), audio(2, 'jpn')];

  it('returns the index of the track matching the preference', () => {
    expect(preferredAudioIndex(tracks, 'fr')).toBe(1);
    expect(preferredAudioIndex(tracks, 'en')).toBe(0);
    expect(preferredAudioIndex(tracks, 'ja')).toBe(2);
  });

  it('returns null when nothing matches or no preference is set', () => {
    expect(preferredAudioIndex(tracks, 'de')).toBeNull();
    expect(preferredAudioIndex(tracks, 'none')).toBeNull();
    expect(preferredAudioIndex(tracks, null)).toBeNull();
    expect(preferredAudioIndex(tracks, undefined)).toBeNull();
    expect(preferredAudioIndex([], 'en')).toBeNull();
  });
});

describe('preferredSubIndex', () => {
  const subs = [
    sub(0, 'eng'),
    sub(1, 'fra', { generated: true }), // AI-generated → never auto-picked
    sub(2, 'fra', { url: null }), // image sub (no url) → skipped
    sub(3, 'fra'), // the embedded fr track that should win
  ];

  it('auto-enables the first selectable embedded track for the preference', () => {
    expect(preferredSubIndex(subs, 'fr')).toBe(3);
    expect(preferredSubIndex(subs, 'en')).toBe(0);
  });

  it('never picks the "off" sentinel or an absent preference', () => {
    expect(preferredSubIndex(subs, 'off')).toBeNull();
    expect(preferredSubIndex(subs, 'none')).toBeNull();
    expect(preferredSubIndex(subs, null)).toBeNull();
    expect(preferredSubIndex(subs, undefined)).toBeNull();
  });

  it('returns null when no selectable embedded track matches', () => {
    expect(preferredSubIndex(subs, 'de')).toBeNull();
    // Only an AI track and a picture sub match here, so neither is auto-picked.
    expect(
      preferredSubIndex([sub(1, 'fra', { generated: true }), sub(2, 'fra', { url: null })], 'fr'),
    ).toBeNull();
  });
});

describe('titleLangVariant', () => {
  it('reads the French dub variant out of the wild track titles', () => {
    expect(titleLangVariant('VFF AC3 5.1 @448kbps')).toBe('fr-FR');
    expect(titleLangVariant('TrueFrench DTS')).toBe('fr-FR');
    expect(titleLangVariant('VFQ AC3 5.1')).toBe('fr-CA');
    expect(titleLangVariant('Français québécois')).toBe('fr-CA');
    expect(titleLangVariant('French Canadian 5.1')).toBe('fr-CA');
  });

  it('keeps bare "VF" neutral: it names the language, not a side', () => {
    expect(titleLangVariant('VF AC3 5.1')).toBeNull();
    expect(titleLangVariant('Surround 5.1')).toBeNull();
    expect(titleLangVariant(null)).toBeNull();
  });

  it('knows the Spanish and Portuguese splits too', () => {
    expect(titleLangVariant('Español Castellano')).toBe('es-ES');
    expect(titleLangVariant('Latino 2.0')).toBe('es-419');
    expect(titleLangVariant('Português Brasil')).toBe('pt-BR');
    expect(titleLangVariant('Portugues PT-PT')).toBe('pt-PT');
    expect(titleLangVariant('European Portuguese 2.0')).toBe('pt-PT');
  });
});

describe('refineTrackLang', () => {
  it('refines a declared language with the variant its title betrays', () => {
    expect(refineTrackLang('fre', 'VFF AC3 5.1')).toBe('fr-FR');
    expect(refineTrackLang('fra', 'VFQ AC3 5.1')).toBe('fr-CA');
    expect(refineTrackLang('fre', 'AC3 5.1')).toBe('fr');
  });

  it('ignores a variant that contradicts the declared language', () => {
    expect(refineTrackLang('eng', 'VFF AC3')).toBe('en');
  });

  it('takes the title at its word when no language is declared', () => {
    expect(refineTrackLang(null, 'VFQ 5.1')).toBe('fr-CA');
    expect(refineTrackLang(null, null)).toBeNull();
  });
});

describe('preferredAudioIndex with a dub-variant preference', () => {
  const vfq = { index: 0, language: 'fre', title: 'VFQ AC3 5.1' };
  const vff = { index: 1, language: 'fre', title: 'VFF AC3 5.1' };
  const plain = { index: 2, language: 'fre', title: 'AC3 5.1' };
  const eng = { index: 3, language: 'eng', title: 'ENG AC3 5.1' };

  it('never hands a VFF viewer the VFQ dub while a better French exists', () => {
    expect(preferredAudioIndex([vfq, vff, eng], 'fr-FR')).toBe(1);
    expect(preferredAudioIndex([vfq, plain, eng], 'fr-FR')).toBe(2);
  });

  it('and the mirror: a VFQ viewer is not handed VFF', () => {
    expect(preferredAudioIndex([vff, vfq, eng], 'fr-CA')).toBe(0);
  });

  it('takes the opposite variant only as the last French resort', () => {
    expect(preferredAudioIndex([vfq, eng], 'fr-FR')).toBe(0);
  });

  it('honours a region declared on the track language itself', () => {
    expect(
      preferredAudioIndex(
        [
          { index: 0, language: 'fr-CA', title: null },
          { index: 1, language: 'fr-FR', title: null },
        ],
        'fr-FR',
      ),
    ).toBe(1);
  });

  it('a bare preference keeps the old first-match rule', () => {
    expect(preferredAudioIndex([vfq, vff], 'fr')).toBe(0);
  });
});
