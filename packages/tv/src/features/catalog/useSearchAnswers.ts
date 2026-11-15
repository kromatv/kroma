import type { DiscoverEntry } from '@kromatv/client/discovery';
import type { MediaCard, PersonHit, SearchHit } from '@kromatv/client/media';
import { useEffect, useRef, useState } from 'react';
import { useClient } from '#tv/app/router';

const DEBOUNCE_MS = 250;

/** A library answer: the server's ranked hit, or a catalogue card the offline
 * fallback matched. */
export type LibraryHit = SearchHit | { type: 'movie'; item: MediaCard };

export interface SearchAnswers {
  query: string;
  library: LibraryHit[];
  people: PersonHit[];
  discover: DiscoverEntry[];
}

const NOTHING: SearchAnswers = { query: '', library: [], people: [], discover: [] };

/** The latest query wins, so a slow answer to an abandoned prefix is dropped.
 * `offline` answers the library half where the server would not, and must keep
 * its identity between renders. */
export function useSearchAnswers(
  typed: string,
  offline: (query: string) => LibraryHit[],
): SearchAnswers {
  const client = useClient();
  const [answers, setAnswers] = useState<SearchAnswers>(NOTHING);
  const seq = useRef(0);
  const empty = !typed.trim();
  const [wasEmpty, setWasEmpty] = useState(empty);
  if (wasEmpty !== empty) {
    setWasEmpty(empty);
    if (empty) setAnswers(NOTHING);
  }

  useEffect(() => {
    const query = typed.trim();
    if (!query) {
      seq.current += 1;
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      void Promise.all([
        client.media.search(query).then(
          (answer): Pick<SearchAnswers, 'library' | 'people'> => ({
            library: answer.results,
            people: answer.people,
          }),
          () => ({ library: offline(query), people: [] }),
        ),
        client.discovery.search(query).then(
          (answer) => answer.results,
          () => [] as DiscoverEntry[],
        ),
      ]).then(([found, discover]) => {
        if (mine === seq.current) setAnswers({ query, ...found, discover });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, client, offline]);

  return answers;
}
