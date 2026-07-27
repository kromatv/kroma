import type { PersonDetail } from '@kroma/core';
import { useEffect, useState } from 'react';
import { useClient } from '#tv/app/router';

/**
 * The provider profile behind a name (biography, birth, birthplace), or null
 * while it loads and whenever the server has nothing.
 *
 * A miss is not an error state and deliberately has no loading flag: the person
 * screen is a filmography first, drawn instantly from the already-loaded
 * catalogue. The biography arrives late, or never (no TMDB key, an uncredited
 * name), and the header simply grows a paragraph when it does.
 */
export function usePersonDetail(name: string): PersonDetail | null {
  const client = useClient();
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Drop the previous person's biography immediately: the screen is reused
    // across `person` routes, and showing one person's life under another's
    // name for the length of a request is worse than showing none.
    setDetail(null);
    client
      .personDetails(name)
      .then((res) => {
        if (!cancelled) setDetail(res.person ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, name]);

  return detail;
}
