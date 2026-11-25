import { matchLocale, type OfferedLocale, type Translate } from '@kromatv/i18n';

/** One language a picker offers: its name for itself, which leads the row,
 *  and its name in the language the interface speaks now. */
export interface LocaleChoice<L extends string = string> {
  code: L;
  endonym: string;
  name: string;
  beta: boolean;
}

/** The two runs a long list of languages is read in: the few a reader most
 *  likely wants, then every other one. */
export interface LocaleGroups<L extends string = string> {
  suggested: LocaleChoice<L>[];
  others: LocaleChoice<L>[];
}

function readerName(t: Translate, { code, name, labelKey }: OfferedLocale<string>): string {
  const named = t(`lang.${code}`);
  return named === labelKey ? name : named;
}

/** Each offered locale as a choice, named in the reader's language by `t`.
 *  A language the reader's catalog does not name yet keeps its own name. */
export function localeChoices<L extends string>(
  locales: readonly OfferedLocale<L>[],
  t: Translate,
): LocaleChoice<L>[] {
  return locales.map((locale) => ({
    code: locale.code,
    endonym: locale.name,
    name: readerName(t, locale),
    beta: locale.stage === 'beta',
  }));
}

/** The choices in the order a reader of `locale` looks them up: by the name
 *  they know each one by, as their language sorts. */
export function sortLocales<L extends string>(
  choices: readonly LocaleChoice<L>[],
  locale: string,
): LocaleChoice<L>[] {
  const collator = new Intl.Collator(locale);
  return [...choices].sort((a, b) => collator.compare(a.name, b.name));
}

/** The languages worth offering first: the one picked, then each one the
 *  device asks for, in the device's order, matched the way a browser's
 *  language is, and each once. */
export function suggestedLocales<L extends string>(
  codes: readonly L[],
  { picked, device }: Readonly<{ picked: string | null; device: readonly string[] }>,
): L[] {
  const chosen = codes.filter((code) => code === picked);
  const asked = device.flatMap((tag) => matchLocale(codes, tag) ?? []);
  return [...new Set([...chosen, ...asked])];
}

/** `sorted` split into the suggested choices, in the order `suggested` names
 *  them, and the others, in the order they came. */
export function groupLocales<L extends string>(
  sorted: readonly LocaleChoice<L>[],
  suggested: readonly L[],
): LocaleGroups<L> {
  return {
    suggested: suggested.flatMap((code) => sorted.find((choice) => choice.code === code) ?? []),
    others: sorted.filter((choice) => !suggested.includes(choice.code)),
  };
}

function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** The choices a search keeps, in their order: those whose own name, name in
 *  the reader's language or code holds what was typed, whatever its case or
 *  accents. Nothing typed keeps them all. */
export function searchLocales<L extends string>(
  choices: readonly LocaleChoice<L>[],
  typed: string,
): LocaleChoice<L>[] {
  const wanted = folded(typed.trim());
  if (!wanted) {
    return [...choices];
  }
  return choices.filter((choice) =>
    [choice.endonym, choice.name, choice.code].some((text) => folded(text).includes(wanted)),
  );
}
