// Language codes, normalized ONCE for the whole app.
//
// Track languages reach us from ffprobe, so they are whatever the muxer wrote:
// "fr", "fra", "fre", "fr-FR", "por"... The account carries ONE preferred audio
// language and ONE preferred subtitle language, and every client (web, TV,
// mobile) has to decide "is this the French track?" against that mess. Doing it
// per client is how "I chose French" ends up meaning French on one screen and
// the file's default on another - so the alias table, the matcher and the two
// track pickers live here, and nowhere else.

import type { MessageKey, Translate } from './i18n';

/** Every code that is not itself the canonical one → the code the catalog and
 * the account use. Generated from CLDR, so it covers the whole mess a muxer can
 * write: ISO 639-2/B and /T (`fre` from a DVD rip, `fra` from a modern
 * encoder), 639-3 members of a macrolanguage (`arb` → `ar`, `cmn` → `zh`),
 * and the deprecated two-letter tags still in the wild (`iw` → `he`,
 * `in` → `id`, `mo` → `ro`, `tl` → `fil`). */
const ALIAS: Record<string, string> = {
  aar: 'aa',
  abk: 'ab',
  adp: 'dz',
  afr: 'af',
  aka: 'ak',
  alb: 'sq',
  als: 'sq',
  amh: 'am',
  ara: 'ar',
  arb: 'ar',
  arg: 'an',
  arm: 'hy',
  asm: 'as',
  ava: 'av',
  ave: 'ae',
  aym: 'ay',
  ayr: 'ay',
  aze: 'az',
  azj: 'az',
  bak: 'ba',
  bam: 'bm',
  baq: 'eu',
  bel: 'be',
  ben: 'bn',
  bis: 'bi',
  bod: 'bo',
  bos: 'bs',
  bre: 'br',
  bul: 'bg',
  bur: 'my',
  cat: 'ca',
  ces: 'cs',
  cha: 'ch',
  che: 'ce',
  chi: 'zh',
  chu: 'cu',
  chv: 'cv',
  cls: 'sa',
  cmn: 'zh',
  cnr: 'sr',
  cor: 'kw',
  cos: 'co',
  cre: 'cr',
  cwd: 'cr',
  cym: 'cy',
  cze: 'cs',
  dan: 'da',
  deu: 'de',
  div: 'dv',
  drh: 'mn',
  drw: 'fa',
  dut: 'nl',
  dzo: 'dz',
  ekk: 'et',
  ell: 'el',
  eng: 'en',
  epo: 'eo',
  esk: 'ik',
  est: 'et',
  eus: 'eu',
  ewe: 'ee',
  fao: 'fo',
  fas: 'fa',
  fat: 'ak',
  fij: 'fj',
  fin: 'fi',
  fra: 'fr',
  fre: 'fr',
  fry: 'fy',
  fuc: 'ff',
  ful: 'ff',
  gaz: 'om',
  geo: 'ka',
  ger: 'de',
  gla: 'gd',
  gle: 'ga',
  glg: 'gl',
  glv: 'gv',
  gre: 'el',
  grn: 'gn',
  gug: 'gn',
  guj: 'gu',
  hat: 'ht',
  hau: 'ha',
  hbs: 'sr',
  hea: 'hmn',
  heb: 'he',
  her: 'hz',
  hin: 'hi',
  hmo: 'ho',
  hrv: 'hr',
  hun: 'hu',
  hye: 'hy',
  ibo: 'ig',
  ice: 'is',
  ido: 'io',
  iii: 'ii',
  ike: 'iu',
  iku: 'iu',
  ile: 'ie',
  in: 'id',
  ina: 'ia',
  ind: 'id',
  ipk: 'ik',
  isl: 'is',
  ita: 'it',
  iw: 'he',
  jav: 'jv',
  jaw: 'jv',
  ji: 'yi',
  jpn: 'ja',
  jw: 'jv',
  kal: 'kl',
  kan: 'kn',
  kas: 'ks',
  kat: 'ka',
  kau: 'kr',
  kaz: 'kk',
  khk: 'mn',
  khm: 'km',
  kik: 'ki',
  kin: 'rw',
  kir: 'ky',
  kmr: 'ku',
  knc: 'kr',
  kng: 'kg',
  kom: 'kv',
  kon: 'kg',
  kor: 'ko',
  kpv: 'kv',
  kua: 'kj',
  kur: 'ku',
  lao: 'lo',
  lat: 'la',
  lav: 'lv',
  lim: 'li',
  lin: 'ln',
  lit: 'lt',
  ltz: 'lb',
  lub: 'lu',
  lug: 'lg',
  lvs: 'lv',
  mac: 'mk',
  mah: 'mh',
  mal: 'ml',
  mao: 'mi',
  mar: 'mr',
  may: 'ms',
  mkd: 'mk',
  mlg: 'mg',
  mlt: 'mt',
  mo: 'ro',
  mol: 'ro',
  mon: 'mn',
  mri: 'mi',
  msa: 'ms',
  mya: 'my',
  nau: 'na',
  nav: 'nv',
  nbl: 'nr',
  nde: 'nd',
  ndo: 'ng',
  nep: 'ne',
  nld: 'nl',
  nno: 'nn',
  nob: 'nb',
  nor: 'no',
  npi: 'ne',
  nya: 'ny',
  oci: 'oc',
  ojg: 'oj',
  oji: 'oj',
  ori: 'or',
  orm: 'om',
  ory: 'or',
  oss: 'os',
  pan: 'pa',
  pbu: 'ps',
  per: 'fa',
  pes: 'fa',
  pli: 'pi',
  plt: 'mg',
  pol: 'pl',
  por: 'pt',
  prp: 'gu',
  prs: 'fa',
  pus: 'ps',
  que: 'qu',
  quz: 'qu',
  roh: 'rm',
  ron: 'ro',
  rum: 'ro',
  run: 'rn',
  rus: 'ru',
  sag: 'sg',
  san: 'sa',
  scc: 'sr',
  scr: 'hr',
  sh: 'sr',
  sin: 'si',
  slk: 'sk',
  slo: 'sk',
  slv: 'sl',
  sme: 'se',
  smo: 'sm',
  sna: 'sn',
  snd: 'sd',
  som: 'so',
  sot: 'st',
  spa: 'es',
  sqi: 'sq',
  src: 'sc',
  srd: 'sc',
  srp: 'sr',
  ssw: 'ss',
  sun: 'su',
  swa: 'sw',
  swc: 'sw',
  swe: 'sv',
  swh: 'sw',
  tah: 'ty',
  tam: 'ta',
  tat: 'tt',
  tel: 'te',
  tgk: 'tg',
  tgl: 'fil',
  tha: 'th',
  tib: 'bo',
  tir: 'ti',
  tl: 'fil',
  tnf: 'fa',
  ton: 'to',
  tsn: 'tn',
  tso: 'ts',
  tuk: 'tk',
  tur: 'tr',
  tw: 'ak',
  twi: 'ak',
  uig: 'ug',
  ukr: 'uk',
  urd: 'ur',
  uzb: 'uz',
  uzn: 'uz',
  ven: 've',
  vie: 'vi',
  vol: 'vo',
  wel: 'cy',
  wln: 'wa',
  wol: 'wo',
  xho: 'xh',
  ydd: 'yi',
  yid: 'yi',
  yor: 'yo',
  zha: 'za',
  zho: 'zh',
  zsm: 'ms',
  zul: 'zu',
  zyb: 'za',
};

/**
 * Canonical base for a language code: `"eng"` → `"en"`, `"pt-BR"` → `"pt"`,
 * `"FRA"` → `"fr"`. Null when there is no code at all.
 *
 * An unknown three-letter code is returned UNCHANGED rather than truncated:
 * chopping `"swe"` to `"sw"` would silently claim Swedish is Swahili, and two
 * unknown codes that fail to match are far better than two that match wrongly.
 */
export function langBase(code?: string | null): string | null {
  if (!code) return null;
  const raw = code.trim().toLowerCase();
  if (!raw) return null;
  const base = raw.split(/[-_]/)[0] ?? raw;
  if (!base) return null;
  return ALIAS[base] ?? base;
}

/** Whether a track's language is the preferred one, both sides normalized. */
export function matchesLang(pref: string | null | undefined, code?: string | null): boolean {
  const a = langBase(pref);
  return a != null && a === langBase(code);
}

/** A language the catalog has a name for, read straight off the message keys:
 * `'lang.fr' | 'lang.sv' | ...` → `'fr' | 'sv' | ...`. Deriving it rather than
 * declaring it is what keeps {@link PREF_LANGS} and the catalog from drifting -
 * add a code to the list without its `lang.*` entry and the `satisfies` below
 * fails to compile. */
export type LangCode = LangSuffix<MessageKey>;

/** Distributes over the MessageKey union (a naked type parameter is required
 *  for that; inlining the conditional would match the whole union at once). */
type LangSuffix<K> = K extends `lang.${infer C}` ? C : never;

/**
 * Every language a client offers as an audio or subtitle preference: the whole
 * ISO 639-1 set, plus the handful of languages a media file realistically
 * carries that never got a two-letter code (Filipino, Cantonese, Cebuano,
 * Hawaiian, Hmong).
 *
 * The list is deliberately complete rather than curated. A curated one is only
 * ever right for the person who curated it - a Swedish or Polish or Thai dub is
 * not an exotic case, it is someone's only case - and the cost of the long list
 * is a picker that scrolls, which every client's picker already does.
 *
 * SIX OF THEM CARRY A REGION, and they are the dub variants {@link
 * titleLangVariant} can read out of a track title: VFF and VFQ are two different
 * dubs with two different casts, and a container has no way to say which beyond
 * a word in the title. Offering `fr-CA` next to `fr` is what lets a viewer state
 * that up front instead of having to find a title that happens to carry the
 * Quebec track and pick it there. They are named "Français (Canada)" rather than
 * "français canadien" precisely so they sort BESIDE their base language: the
 * pickers are alphabetical, and the dialect spelling would file Quebec French
 * under C, an alphabet away from French.
 *
 * `satisfies` is the check that matters: a code with no `lang.*` name in the
 * catalog fails to compile here rather than rendering as a raw key.
 */
export const PREF_LANGS = [
  'aa',
  'ab',
  'ae',
  'af',
  'ak',
  'am',
  'an',
  'ar',
  'as',
  'av',
  'ay',
  'az',
  'ba',
  'be',
  'bg',
  'bi',
  'bm',
  'bn',
  'bo',
  'br',
  'bs',
  'ca',
  'ce',
  'ch',
  'co',
  'cr',
  'cs',
  'cu',
  'cv',
  'cy',
  'da',
  'de',
  'dv',
  'dz',
  'ee',
  'el',
  'en',
  'eo',
  'es',
  'es-419',
  'es-ES',
  'et',
  'eu',
  'fa',
  'ff',
  'fi',
  'fj',
  'fo',
  'fr',
  'fr-CA',
  'fr-FR',
  'fy',
  'ga',
  'gd',
  'gl',
  'gn',
  'gu',
  'gv',
  'ha',
  'he',
  'hi',
  'ho',
  'hr',
  'ht',
  'hu',
  'hy',
  'hz',
  'ia',
  'id',
  'ie',
  'ig',
  'ii',
  'ik',
  'io',
  'is',
  'it',
  'iu',
  'ja',
  'jv',
  'ka',
  'kg',
  'ki',
  'kj',
  'kk',
  'kl',
  'km',
  'kn',
  'ko',
  'kr',
  'ks',
  'ku',
  'kv',
  'kw',
  'ky',
  'la',
  'lb',
  'lg',
  'li',
  'ln',
  'lo',
  'lt',
  'lu',
  'lv',
  'mg',
  'mh',
  'mi',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'mt',
  'my',
  'na',
  'nb',
  'nd',
  'ne',
  'ng',
  'nl',
  'nn',
  'no',
  'nr',
  'nv',
  'ny',
  'oc',
  'oj',
  'om',
  'or',
  'os',
  'pa',
  'pi',
  'pl',
  'ps',
  'pt',
  'pt-BR',
  'pt-PT',
  'qu',
  'rm',
  'rn',
  'ro',
  'ru',
  'rw',
  'sa',
  'sc',
  'sd',
  'se',
  'sg',
  'si',
  'sk',
  'sl',
  'sm',
  'sn',
  'so',
  'sq',
  'sr',
  'ss',
  'st',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'tg',
  'th',
  'ti',
  'tk',
  'tn',
  'to',
  'tr',
  'ts',
  'tt',
  'ty',
  'ug',
  'uk',
  'ur',
  'uz',
  've',
  'vi',
  'vo',
  'wa',
  'wo',
  'xh',
  'yi',
  'yo',
  'za',
  'zh',
  'zu',
  'fil',
  'yue',
  'ceb',
  'haw',
  'hmn',
] as const satisfies readonly LangCode[];

/** "No preference": keep the file's default track. Stored as `null` on the
 * account; this is the sentinel the pickers use, since a select needs a value. */
export const LANG_NO_PREF = 'none';

/** Subtitle preference sentinel: keep subtitles off, whatever the file offers. */
export const LANG_OFF = 'off';

/**
 * The most specific code in {@link PREF_LANGS} that a language tag maps onto,
 * or null when nothing does.
 *
 * SPECIFIC FIRST, and that is the whole of the dub-variant handling: `fr-CA` is
 * offered, so a Quebec preference stays Quebec; `pt-AO` is not, so an Angolan
 * track resolves to plain Portuguese rather than to nothing. Every spelling
 * {@link langBase} knows gets there - `fre`, `fra`, `FR_ca` all land on the same
 * pair of answers - and the server's own lower-casing (`norm_media_lang` stores
 * `fr-ca`) round-trips through it unharmed.
 */
export function offeredLang(code?: string | null): LangCode | null {
  const base = langBase(code);
  if (base == null) return null;
  const region = langRegion(code);
  const full = region ? `${base}-${region}` : base;
  if (isLangCode(full)) return full;
  return isLangCode(base) ? base : null;
}

/** Language code → the `lang.*` catalog key for its name in the reader's own
 * language, or null when the catalog has no name for it. */
export function langKey(code?: string | null): MessageKey | null {
  const offered = offeredLang(code);
  return offered ? `lang.${offered}` : null;
}

const LANG_CODES: ReadonlySet<string> = new Set(PREF_LANGS);

/** Whether a code is one the catalog names. */
function isLangCode(code: string): code is LangCode {
  return LANG_CODES.has(code);
}

/** One row of a language picker. */
export interface LangOption {
  code: LangCode;
  /** The language's name in the READER's language ("Swedish" / "Suédois"). */
  label: string;
}

/**
 * {@link PREF_LANGS} as picker rows, named and ordered for `locale`.
 *
 * Alphabetical by the LABEL, never by the code: a list sorted by code reads as
 * random once it is nearly two hundred rows long ("de" before "el" before "en"
 * puts German, Greek and English together for no reason a reader can see). The
 * collator is the locale's own, so French sorts "Éwé" where a French reader
 * looks for it; environments without Intl fall back to a plain comparison
 * rather than throwing.
 *
 * Built fresh per call and memoised by the caller (the label depends on the
 * active locale, so a cache here would have to be keyed by it anyway).
 */
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

/** An audio track, as the preference matcher needs it. */
export interface AudioCandidate {
  /** Audio-relative stream index (what a player selects by). */
  index: number;
  language?: string | null;
  /** The track's title/label ("VFF AC3 5.1", "VFQ …"): the only place a dub
   *  VARIANT lives, since VFF and VFQ both declare `language: fre`. */
  title?: string | null;
}

/**
 * The dub variant a track's TITLE betrays, as a full language tag - or null
 * for a title that names no variant (a neutral track).
 *
 * This exists because containers cannot say it any other way: a French-France
 * dub (VFF) and a Quebec dub (VFQ) both declare `language: fre`, and the only
 * difference is a word in the track title. A viewer who chose VFF is NOT
 * asking for VFQ - they are two different dubs with different casts - so the
 * preference machinery has to read the word. Bare "VF" stays null on purpose:
 * it means "French dub" and names no side. Same story for the other languages
 * the wild labels this way (Castilian vs Latino, Brazilian vs European
 * Portuguese).
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

/** The region half of a language tag (`fr-FR` → `FR`), or null. */
export function langRegion(code?: string | null): string | null {
  if (!code) return null;
  const region = code.trim().split(/[-_]/)[1];
  return region ? region.toUpperCase() : null;
}

/**
 * The most specific language a track admits to: its declared language refined
 * by the variant its title betrays (`('fre', 'VFF AC3 5.1')` → `'fr-FR'`).
 * The variant only refines a MATCHING base - an English track titled "VFF" is
 * a mislabel, not a French track - and a track with no declared language takes
 * the title's word for it.
 */
export function refineTrackLang(language?: string | null, title?: string | null): string | null {
  const base = langBase(language);
  const variant = titleLangVariant(title);
  if (variant && (base == null || langBase(variant) === base)) return variant;
  return base;
}

/**
 * A subtitle track, as the preference matcher needs it. Clients map their own
 * shapes onto this (web `SubtitleView.downloaded`, TV `SubView.ai`) so the rule
 * "never auto-enable a generated track" is written once.
 */
export interface SubtitleCandidate {
  index: number;
  language?: string | null;
  /** The WebVTT url; absent/null = a picture sub we cannot render as text. */
  url?: string | null;
  /** AI-transcribed or translated. Selectable by hand, never auto-enabled. */
  generated?: boolean;
}

/** Index of the audio track matching `pref`, or null when none does (the caller
 * then keeps the file's own default).
 *
 * A pref WITH a region (`fr-FR`, stored when the viewer picked a track whose
 * title named its variant) ranks the language's tracks rather than taking the
 * first: the exact variant, then a track naming NO variant, and the opposite
 * variant only as the last resort - a VFF viewer gets VFQ only when VFQ is the
 * only French in the file. A bare pref (`fr`) keeps the old first-match rule. */
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

/** Index of the subtitle track to auto-enable for `pref`, or null (leave them
 * off). `off` and "no preference" both yield null; only renderable, non-
 * generated tracks are considered. */
export function preferredSubIndex(
  subs: readonly SubtitleCandidate[],
  pref?: string | null,
): number | null {
  if (!pref || pref === LANG_OFF || pref === LANG_NO_PREF) return null;
  const hit = subs.find((s) => Boolean(s.url) && !s.generated && matchesLang(pref, s.language));
  return hit ? hit.index : null;
}
