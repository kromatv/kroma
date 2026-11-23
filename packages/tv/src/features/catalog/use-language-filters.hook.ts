import {
  type LanguageFilter,
  type LanguageStream,
  languagesByStream,
  matchesLanguages,
  type Spoken,
} from '@kromatv/core';
import { useMemo, useState } from 'react';
import type { LanguageChipProps } from '#tv/features/catalog/language-chip.component';

export interface LanguageFilters {
  filter: LanguageFilter;
  narrow: <T extends Spoken>(titles: readonly T[]) => T[];
  chips: LanguageChipProps[];
}

interface Picked extends LanguageFilter {
  section: string;
}

/** The language filters of one browse section: what is picked, the titles the
 * picks keep, and a chip for each stream that the section's titles name a
 * language on. Changing `section` clears the picks. */
export function useLanguageFilters(items: readonly Spoken[], section: string): LanguageFilters {
  const [picked, setPicked] = useState<Picked>({ section });
  const current = picked.section === section ? picked : null;
  const audio = current?.audio;
  const subtitles = current?.subtitles;
  const counts = useMemo(() => languagesByStream(items), [items]);

  return useMemo(() => {
    const filter: LanguageFilter = { audio, subtitles };
    const pick = (stream: LanguageStream, code: string | undefined) => {
      const next: Picked = { ...filter, section };
      next[stream] = code;
      setPicked(next);
    };
    return {
      filter,
      narrow: (titles) => titles.filter((title) => matchesLanguages(title, filter)),
      chips: counts.map(({ stream, languages }) => ({
        stream,
        languages,
        value: filter[stream],
        onValueChange: (code: string | undefined) => pick(stream, code),
      })),
    };
  }, [audio, subtitles, counts, section]);
}
