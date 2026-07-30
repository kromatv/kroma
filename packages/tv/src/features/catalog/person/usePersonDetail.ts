import type { PersonDetail } from '@kroma/core';
import { useEffect, useState } from 'react';
import { useClient } from '#tv/app/router';

/**
 * The provider profile behind a name (biography, birth, birthplace), or null
 * while it loads and whenever the server has nothing. Deliberately no loading
 * flag: the person screen is a filmography first, and the header simply grows
 * a paragraph when the biography arrives.
 */
export function usePersonDetail(name: string): PersonDetail | null {
  const client = useClient();
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The screen is reused across `person` routes; drop the previous
    // biography immediately rather than show it under the wrong name.
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
