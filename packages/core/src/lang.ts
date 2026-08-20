// Language codes, normalized once for the whole app: the matcher, the option
// list, and the two track pickers every client shares.

import type { MessageKey, Translate } from './i18n';
import { LANG_ALIAS, type LangCode, PREF_LANGS } from './lang-table';

export { type LangCode, PREF_LANGS } from './lang-table';

/**
 * Canonical base for a language code: `"eng"` → `"en"`, `"pt-BR"` → `"pt"`.
 * An unknown three-letter code is returned unchanged rather than truncated -
 * chopping `"swe"` to `"sw"` would claim Swedish is Swahili.
 */
export function langBase(code?: string | null): string | null {
  if (!code) return null;
  const raw = code.trim().toLowerCase();
  if (!raw) return null;
  const base = raw.split(/[-_]/)[0] ?? raw;
  if (!base) return null;
  return LANG_ALIAS[base] ?? base;
}

export function matchesLang(pref: string | null | undefined, code?: string | null): boolean {
  const a = langBase(pref);
  return a != null && a === langBase(code);
}

/** "No preference": stored as `null` on the account, but a select needs a
 * value, so the pickers use this sentinel. */
export const LANG_NO_PREF = 'none';

export const LANG_OFF = 'off';

/**
 * The most specific code in {@link PREF_LANGS} a language tag maps onto, or
 * null. Specific first: `fr-CA` is offered so a Quebec preference stays Quebec,
 * `pt-AO` is not so an Angolan track resolves to plain Portuguese.
 */
export function offeredLang(code?: string | null): LangCode | null {
  const base = langBase(code);
  if (base == null) return null;
  const region = langRegion(code);
  const full = region ? `${base}-${region}` : base;
  if (isLangCode(full)) return full;
  return isLangCode(base) ? base : null;
}

export function langKey(code?: string | null): MessageKey | null {
  const offered = offeredLang(code);
  return offered ? `lang.${offered}` : null;
}

const LANG_CODES: ReadonlySet<string> = new Set(PREF_LANGS);

function isLangCode(code: string): code is LangCode {
  return LANG_CODES.has(code);
}

export interface LangOption {
  code: LangCode;
  label: string;
}

/** {@link PREF_LANGS} as picker rows, labelled for `locale` and sorted by label
 * with that locale's collator. Built fresh per call. */
export function langOptions(t: Translate, locale?: string): LangOption[] {
  const options = PREF_LANGS.map((code) => ({ code, label: t(`lang.${code}`) }));
  return options.sort(byLabel(locale));
}

function byLabel(locale?: string): (a: LangOption, b: LangOption) => number {
  try {
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    return (a, b) => collator.compare(a.label, b.label);
  } catch {
    return (a, b) => {
      if (a.label === b.label) return 0;
      return a.label < b.label ? -1 : 1;
    };
  }
}

export interface AudioCandidate {
  index: number;
  language?: string | null;
  title?: string | null;
}

/**
 * The dub variant a track's title betrays, as a full language tag, or null.
 * Containers cannot say it any other way - VFF and VFQ both declare
 * `language: fre`. Bare "VF" names no side and stays null.
 */
export function titleLangVariant(title?: string | null): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\bvfq\b|\bvq\b|qu[eé]b[eé]c|fr[-_ ]ca\b|canadian french|french canadian/.test(t))
    return 'fr-CA';
  if (/\bvff\b|true\s?french|fr[-_ ]fr\b/.test(t)) return 'fr-FR';
  if (/castellano|castilian/.test(t)) return 'es-ES';
  if (/\blatino\b|latin american/.test(t)) return 'es-419';
  if (/bra[sz]il/.test(t)) return 'pt-BR';
  if (/\bpt[-_ ]pt\b|european portuguese/.test(t)) return 'pt-PT';
  return null;
}

export function langRegion(code?: string | null): string | null {
  if (!code) return null;
  const region = code.trim().split(/[-_]/)[1];
  return region ? region.toUpperCase() : null;
}

/**
 * A track's declared language refined by the variant its title betrays
 * (`('fre', 'VFF AC3 5.1')` → `'fr-FR'`). The variant only refines a matching
 * base: an English track titled "VFF" is a mislabel, not a French track.
 */
export function refineTrackLang(language?: string | null, title?: string | null): string | null {
  const base = langBase(language);
  const variant = titleLangVariant(title);
  if (variant && (base == null || langBase(variant) === base)) return variant;
  return base;
}

export interface SubtitleCandidate {
  index: number;
  language?: string | null;
  url?: string | null;
  generated?: boolean;
}

/** Index of the audio track matching `pref`, or null (the caller then keeps the
 * file's default). A pref carrying a region ranks the language's tracks: exact
 * variant, then a track naming no variant, then the opposite one. */
export function preferredAudioIndex(
  tracks: readonly AudioCandidate[],
  pref?: string | null,
): number | null {
  if (!pref || pref === LANG_NO_PREF) return null;
  const matches = tracks.filter((tr) => matchesLang(pref, tr.language));
  if (matches.length === 0) return null;
  const want = langRegion(pref);
  if (!want) return matches[0]?.index ?? null;
  const variantOf = (tr: AudioCandidate) =>
    langRegion(tr.language) ?? langRegion(refineTrackLang(tr.language, tr.title));
  const exact = matches.find((tr) => variantOf(tr) === want);
  if (exact) return exact.index;
  const neutral = matches.find((tr) => variantOf(tr) == null);
  if (neutral) return neutral.index;
  return matches[0]?.index ?? null;
}

/** Index of the subtitle track to auto-enable for `pref`, or null. Only
 * renderable, non-generated tracks are ever auto-enabled. */
export function preferredSubIndex(
  subs: readonly SubtitleCandidate[],
  pref?: string | null,
): number | null {
  if (!pref || pref === LANG_OFF || pref === LANG_NO_PREF) return null;
  const hit = subs.find((s) => Boolean(s.url) && !s.generated && matchesLang(pref, s.language));
  return hit ? hit.index : null;
}
