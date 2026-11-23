import { langBase } from './lang';

/** Which of a title's streams a language filter reads. */
export type LanguageStream = 'audio' | 'subtitles';

/** What a card says a title can be heard and read in. */
export interface Spoken {
  audioLanguages?: readonly string[];
  subtitleLanguages?: readonly string[];
}

export interface LanguageCount {
  code: string;
  count: number;
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
