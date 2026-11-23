import type { MessageKey, Translate } from '@kromatv/i18n';
import { langBase } from './lang';
import { langName } from './lang-labels';

/** Which of a title's streams a language filter reads. */
export type LanguageStream = 'audio' | 'subtitles';

/** What a card says a title can be heard and read in. A series also lists
 * what each of its episodes can, in `episodeLanguages`. */
export interface Spoken {
  audioLanguages?: readonly string[];
  subtitleLanguages?: readonly string[];
  episodeLanguages?: readonly Spoken[];
}

export interface LanguageCount {
  code: string;
  count: number;
}

/** The choice that clears a language filter. */
export const ANY_LANGUAGE = '*';

/** What a language filter is called, on each stream. */
export const LANGUAGE_FILTER_LABEL: Record<LanguageStream, MessageKey> = {
  audio: 'browse.audioLanguage',
  subtitles: 'browse.subtitleLanguage',
};

/** One language a filter offers, named in the reader's language, with how many
 * titles have it as its note. */
export interface LanguageChoice {
  value: string;
  label: string;
  note: string;
}

/** The language a browse page is narrowed to on each stream, as a code in any
 * spelling. A stream left unset keeps every title. */
export interface LanguageFilter {
  audio?: string;
  subtitles?: string;
}

function languagesOf(item: Spoken, stream: LanguageStream): Set<string> {
  const listed = stream === 'audio' ? item.audioLanguages : item.subtitleLanguages;
  const codes = new Set<string>();
  for (const code of listed ?? []) {
    const base = langBase(code);
    if (base) {
      codes.add(base);
    }
  }
  return codes;
}

/** One row per language, however the files spelled it (`fre`, `fra` and `fr`
 * count once), with how many titles have it. Most common first, ties broken by
 * code. */
export function collectLanguages(
  items: readonly Spoken[],
  stream: LanguageStream,
): LanguageCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const code of languagesOf(item, stream)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Whether any file of the title has a `stream` track in `code`, in any
 * spelling of it. */
export function hasLanguage(item: Spoken, stream: LanguageStream, code: string): boolean {
  const want = langBase(code);
  return want !== null && languagesOf(item, stream).has(want);
}

function hasEvery(item: Spoken, filter: LanguageFilter): boolean {
  return (
    (!filter.audio || hasLanguage(item, 'audio', filter.audio)) &&
    (!filter.subtitles || hasLanguage(item, 'subtitles', filter.subtitles))
  );
}

/** Whether the title has every language `filter` asks for. With both streams
 * set, a series that lists its episodes needs one episode that has both. */
export function matchesLanguages(item: Spoken, filter: LanguageFilter): boolean {
  const episodes = filter.audio && filter.subtitles ? item.episodeLanguages : undefined;
  return episodes ? episodes.some((episode) => hasEvery(episode, filter)) : hasEvery(item, filter);
}

/** The languages a filter offers, in the order `languages` lists them. */
export function languageChoices(
  t: Translate,
  languages: readonly LanguageCount[],
): LanguageChoice[] {
  return languages.map(({ code, count }) => ({
    value: code,
    label: langName(t, code) ?? code,
    note: String(count),
  }));
}
