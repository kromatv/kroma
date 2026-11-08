import type { SearchHit } from '@kromatv/client/media';
import { useEffect, useState } from 'react';
import { useClient } from '#tv/app/router';

/** Every library title one person is credited in, best-known first, or null
 * until the server answers. A failed lookup reads as no credits. */
export function usePersonCredits(name: string): SearchHit[] | null {
  const client = useClient();
  const [settled, setSettled] = useState<{
    client: typeof client;
    name: string;
    credits: SearchHit[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.media.people(name).then(
      (res) => {
        if (!cancelled) setSettled({ client, name, credits: res.results });
      },
      () => {
        if (!cancelled) setSettled({ client, name, credits: [] });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, name]);

  return settled?.client === client && settled.name === name ? settled.credits : null;
}
