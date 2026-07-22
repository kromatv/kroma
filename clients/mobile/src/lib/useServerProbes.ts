// Probes each saved server's public /health on mount: reachability for the
// profile gate's offline badges plus the admin-configured server name, which
// is persisted back onto the saved-server entry.

import { KromaClient } from '@kroma/core';
import { useEffect, useState } from 'react';
import { useSession } from './session';

export interface ServerProbe {
  online: boolean;
  name?: string;
}

export function useServerProbes(urls: string[]): Record<string, ServerProbe> {
  const { renameServer } = useSession();
  const [probes, setProbes] = useState<Record<string, ServerProbe>>({});
  const key = urls.join('|');

  useEffect(() => {
    let cancelled = false;
    const targets = key ? key.split('|') : [];
    for (const url of targets) {
      void (async () => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 4000);
        try {
          const health = await new KromaClient({ baseUrl: url }).health({ signal: abort.signal });
          if (cancelled) return;
          setProbes((prev) => ({ ...prev, [url]: { online: true, name: health.name } }));
          if (health.name) renameServer(url, health.name);
        } catch {
          if (!cancelled) setProbes((prev) => ({ ...prev, [url]: { online: false } }));
        } finally {
          clearTimeout(timer);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [key, renameServer]);

  return probes;
}
