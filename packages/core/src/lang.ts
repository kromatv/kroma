// Language codes, normalized once for the whole app: the alias table, the
// matcher, and the two track pickers every client shares.

import type { MessageKey, Translate } from './i18n';

// Generated from CLDR: ISO 639-2/B and /T, 639-3 macrolanguage members, and the
// deprecated two-letter tags still in the wild.
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
  return ALIAS[base] ?? base;
}

export function matchesLang(pref: string | null | undefined, code?: string | null): boolean {
  const a = langBase(pref);
  return a != null && a === langBase(code);
}

/** A language the catalog has a name for, derived from the `lang.*` message
 * keys so the list and the catalog cannot drift. */
export type LangCode = LangSuffix<MessageKey>;

// Naked type parameter: required so the conditional distributes over the
// MessageKey union instead of matching it whole.
type LangSuffix<K> = K extends `lang.${infer C}` ? C : never;

/** Every language a client offers as an audio or subtitle preference. The six
 * region-tagged entries are the dub variants {@link titleLangVariant} reads out
 * of a track title. */
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
