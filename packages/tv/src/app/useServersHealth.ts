import { Health } from '@kroma/core';
import { useEffect, useState } from 'react';

/** Slow cadence the picker list is informational, not the active-server heartbeat. */
const INTERVAL_MS = 12000;
/** A probe unanswered by now counts as unreachable (a dead host never refuses). */
const TIMEOUT_MS = 4000;

/** What one `/api/health` answer says about a server. Everything but `online` is
 * optional: a server can answer with a body this build can't read (older or newer
 * wire shape), and `name` is LAN-only by design, so it is absent through a
 * tunnel. Absent fields are simply not rendered. */
export interface ServerProbe {
  online: boolean;
  /** Probe round-trip in ms (answered probes only). */
  latencyMs?: number;
  /** Admin-configured server name. */
  name?: string;
  version?: string;
  libraries?: number;
  /** Playable items: movies + episodes. */
  items?: number;
  shows?: number;
}

/**
 * Identity + reachability of a set of servers for the profile picker: probes
 * each `<url>/api/health` on a slow loop and returns a `url → probe` map (a url
 * is absent until its first probe answers, which the UI shows as "checking").
 * The endpoint is public, so this works while signed out.
 *
 * Meant for the *other* saved servers the active one already has a live
 * heartbeat driving `connection.online`, so pass only the alternates here to
 * avoid probing it twice.
 */
export function useServersHealth(urls: string[]): Record<string, ServerProbe> {
  const [map, setMap] = useState<Record<string, ServerProbe>>({});
  // Collapse to a stable primitive so the effect restarts only when the SET of
  // urls changes, not on every render's fresh array identity.
  const key = urls.join('|');

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (list.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const round = async () => {
      const results = await Promise.all(list.map(probeServer));
      if (cancelled) return;
      setMap(Object.fromEntries(results));
      timer = setTimeout(round, INTERVAL_MS);
    };
    void round();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return map;
}

/** One `/api/health` request, bounded by {@link TIMEOUT_MS}, as a map entry. */
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
