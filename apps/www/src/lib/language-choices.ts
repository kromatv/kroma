import { flagRegion } from '@kromatv/i18n';
import { displayName } from './display-name';

const SQUARE_FLAGS = new Map(
  Object.entries(
    import.meta.glob<string>(
      '../../node_modules/country-flag-icons/1x1/{BR,CN,DE,ES,FR,JP,KR,US,VN}.svg',
      { query: '?no-inline', import: 'default', eager: true },
    ),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url]),
);

/** One language the site is written in, as the language switcher shows it: its
 *  name for itself, its name in the reader's language, and its square flag. */
export interface LanguageChoice<L extends string = string> {
  lang: L;
  ownName: string;
  name: string;
  flag: string | undefined;
}

const capitalized = (text: string, locale: string): string =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/** The square flag that stands for `lang`, or nothing where no flag does. */
export function languageFlagUrl(lang: string): string | undefined {
  const region = flagRegion(lang);
  return region ? SQUARE_FLAGS.get(region) : undefined;
}

/** Every language of `langs` for a reader of `active`: `active` first, then the
 *  others by their name in `active`, as `active` sorts. */
export function languageChoices<L extends string>(
  langs: readonly L[],
  active: L,
): LanguageChoice<L>[] {
  const inActive = displayName('language', active);
  const collator = new Intl.Collator(active);
  const choices = langs.map((lang) => ({
    lang,
    ownName: capitalized(displayName('language', lang)(lang), lang),
    name: capitalized(inActive(lang), active),
    flag: languageFlagUrl(lang),
  }));
  const first = (choice: LanguageChoice<L>) => (choice.lang === active ? 0 : 1);
  return choices.sort((a, b) => first(a) - first(b) || collator.compare(a.name, b.name));
}
