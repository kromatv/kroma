import type { PersonDetail } from '@kromatv/client/media';
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
  const [settled, setSettled] = useState<{
    client: typeof client;
    name: string;
    detail: PersonDetail | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.media
      .person(name)
      .then((res) => {
        if (!cancelled) setSettled({ client, name, detail: res.person ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, name]);

  return settled?.client === client && settled.name === name ? settled.detail : null;
}
