import type { DiscoverEntry } from '@kromatv/client/discovery';
import type { SearchHit } from '@kromatv/client/media';
import { useEffect, useRef, useState } from 'react';
import { useClient } from '#tv/app/router';

const DEBOUNCE_MS = 250;

interface SearchAnswers {
  query: string;
  library: SearchHit[];
  discover: DiscoverEntry[];
}

const NOTHING: SearchAnswers = { query: '', library: [], discover: [] };

/** The latest query wins, so a slow answer to an abandoned prefix is dropped.
 * `offline` answers the library half where the server would not, and must keep
 * its identity between renders. */
export function useSearchAnswers(
  typed: string,
  offline: (query: string) => SearchHit[],
): SearchAnswers {
  const client = useClient();
  const [answers, setAnswers] = useState<SearchAnswers>(NOTHING);
  const seq = useRef(0);

  useEffect(() => {
    const query = typed.trim();
    if (!query) {
      seq.current += 1;
      setAnswers(NOTHING);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      void Promise.all([
        client.media.search(query).then(
          (answer) => answer.results,
          () => offline(query),
        ),
        client.discovery.search(query).then(
          (answer) => answer.results,
          () => [] as DiscoverEntry[],
        ),
      ]).then(([library, discover]) => {
        if (mine === seq.current) setAnswers({ query, library, discover });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, client, offline]);

  return answers;
}
