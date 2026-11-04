import { Health } from '@kromatv/client/media';
import { useEffect, useState } from 'react';

const INTERVAL_MS = 12000;
const FIRST_RETRY_MS = 1000;
// A probe unanswered by now counts as unreachable: a dead host never refuses.
const TIMEOUT_MS = 4000;

// What one `/api/health` answer says about a server. Everything but `online` is
// optional: a server can answer with a body this build can't read (older or
// newer wire shape), and `name` is LAN-only by design, so it is absent through
// a tunnel.
export interface ServerProbe {
  online: boolean;
  latencyMs?: number;
  name?: string;
  version?: string;
  libraries?: number;
  items?: number;
  shows?: number;
}

/** Probes each `<url>/api/health` on a slow loop for the profile picker; a url
 * is absent until its first probe answers. A round with a server down retries
 * after a second, doubling back up to the slow loop. Meant for the *other* saved
 * servers: the active one already has a live heartbeat driving `connection.online`. */
export function useServersHealth(urls: string[]): Record<string, ServerProbe> {
  const [map, setMap] = useState<Record<string, ServerProbe>>({});
  // Collapse to a stable primitive so the effect restarts only when the SET of
  // urls changes, not on every render's fresh array identity.
  const key = urls.join('|');

  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    if (!key) setMap({});
  }

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failedRounds = 0;

    const round = async () => {
      const results = await Promise.all(list.map(probeServer));
      if (cancelled) return;
      setMap(Object.fromEntries(results));
      failedRounds = results.every(([, probe]) => probe.online) ? 0 : failedRounds + 1;
      timer = setTimeout(round, nextRoundIn(failedRounds));
    };
    void round();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return map;
}

function nextRoundIn(failedRounds: number): number {
  if (failedRounds === 0) return INTERVAL_MS;
  return Math.min(INTERVAL_MS, FIRST_RETRY_MS * 2 ** (failedRounds - 1));
}

async function probeServer(url: string): Promise<[string, ServerProbe]> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return [url, { online: false }];
    const parsed = Health.safeParse(await res.json());
    const latencyMs = Date.now() - started;
    // It answered, so it IS up even when the body is one we can't read (a much
    // older server, a captive portal): report reachable, just anonymous.
    if (!parsed.success) return [url, { online: true, latencyMs }];
    const { name, version, libraries, items, shows } = parsed.data;
    return [url, { online: true, latencyMs, name, version, libraries, items, shows }];
  } catch {
    return [url, { online: false }];
  } finally {
    clearTimeout(to);
  }
}
