import { LocaleTag } from '#site/core/config';
import type { Language, Stage } from '#site/lib/views';

const english = new Intl.DisplayNames(['en'], { type: 'language' });

/** A language tag named in English and in itself, falling back to the tag. */
export function languageOf(tag: string): Language {
  try {
    return {
      tag,
      name: english.of(tag) ?? tag,
      nativeName: new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag,
    };
  } catch {
    return { tag, name: tag, nativeName: tag };
  }
}

const COMMON = ['es', 'de', 'it', 'pt-BR', 'nl', 'pl', 'ja', 'zh-Hans', 'vi', 'ru', 'ar', 'ko'];

const MORE = [
  'af bg bn ca cs cy da el eo et eu fa fi fil ga gl gu he hi hr hu hy id is ka kk',
  'km kn lt lv mk ml mr ms nb ne pa pt-PT ro sk sl sq sr sv sw ta te th tr uk ur',
  'uz zh-Hant es-419 fr en fr-CA en-GB',
]
  .join(' ')
  .split(' ');

function byName(tags: readonly string[]): Language[] {
  return tags.map(languageOf).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

const OFFERED: readonly Language[] = [...COMMON.map(languageOf), ...byName(MORE)];

function typedTag(query: string): Language | null {
  const trimmed = query.trim();
  if (!LocaleTag.safeParse(trimmed).success) {
    return null;
  }
  try {
    const [tag = trimmed] = Intl.getCanonicalLocales(trimmed);
    const language = languageOf(tag);
    return language.name === tag ? null : language;
  } catch {
    return null;
  }
}

const said = (language: Language, wanted: string) =>
  [language.tag, language.name, language.nativeName].some((text) =>
    text.toLocaleLowerCase().includes(wanted),
  );

/**
 * The languages a project can start, `taken` ones left out: the common ones
 * first, then the rest by English name, matched by tag or by either name. A
 * valid tag typed in full that the list lacks comes first.
 */
export function languageChoices(query: string, taken: ReadonlySet<string>): Language[] {
  const wanted = query.trim().toLocaleLowerCase();
  const listed = OFFERED.filter((l) => !taken.has(l.tag) && (wanted === '' || said(l, wanted)));
  const typed = typedTag(query);
  const extra =
    typed && !taken.has(typed.tag) && !listed.some((l) => l.tag === typed.tag) ? [typed] : [];
  return [...extra, ...listed];
}

/** What a language's stage in `i18n.json` means to a reader of the project, in a word and a sentence. */
export const STAGES: Record<Stage, { label: string; hint: string }> = {
  draft: { label: 'Draft', hint: 'In the repository, not offered to users yet' },
  beta: { label: 'Beta', hint: 'Offered to users; a missing message shows in the fallback' },
  stable: { label: 'Stable', hint: 'Offered to users; every message must be translated' },
};
