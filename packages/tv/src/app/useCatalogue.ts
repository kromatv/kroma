import {
  discoverServer,
  forgetServer as forgetServerStore,
  type KromaClient,
  loadSession,
  type MediaItem,
  normalizeServerUrl as norm,
  type SavedServer,
  type Show,
  saveServer as saveServerStore,
} from '@kroma/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeClient } from '#tv/app/apiClient';
import type { Connection } from '#tv/app/providers/connection';
import { serverBrowse } from '#tv/app/serverBrowse';
import { useCatalogueSync } from '#tv/app/useCatalogueSync';
import { useServerHealth } from '#tv/app/useServerHealth';
import { type DeepLink, onDeepLink, publishPreview, readDeepLink } from '#tv/shared/preview';
import { initialServers } from '#tv/shared/server';

type Status = 'discovering' | 'connecting' | 'ready' | 'error';

function serverLabel(servers: SavedServer[], url: string | null): string | null {
  if (!url) return null;
  const saved = servers.find((s) => s.url === norm(url));
  if (saved?.name) return saved.name;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** What the catalogue hook exposes to the shell: the connection context value
 * plus the few handles the auth provider needs wired directly. */
export interface Catalogue {
  connection: Connection;
  client: KromaClient | null;
  activeServerUrl: string | null;
  setActiveServer: (url: string) => void;
  setSignedIn: (v: boolean) => void;
}

/** Owns the TV's multi-server connection + catalogue state: discovery, the
 * active client, the movies/shows catalogue, the live event stream, Smart-Hub
 * preview publishing and deep links. */
export function useCatalogue(platform: string): Catalogue {
  // Read once, so the first client starts pointed at the right server with its
  // token applied and "Reprendre" does not flicker.
  const bootSession = useMemo(() => loadSession(), []);
  const [servers, setServers] = useState<SavedServer[]>(() => initialServers());
  const [activeServerUrl, setActiveServerUrl] = useState<string | null>(
    () => bootSession?.serverUrl ?? servers[0]?.url ?? null,
  );

  const client = useMemo<KromaClient | null>(() => {
    if (!activeServerUrl) return null;
    // No initial bearer: the auth provider exchanges the active account's access
    // token for a session token and calls `setAuthToken` (+ installs the refresh
    // handler) once the session belongs to this server.
    return makeClient(activeServerUrl);
  }, [activeServerUrl]);
  const liveClient = useRef(client);
  liveClient.current = client;

  // Reported up by the auth provider; gates the catalogue + event stream so the
  // signed-out picker makes no requests at all.
  const [signedIn, setSignedIn] = useState(Boolean(bootSession));
  const [status, setStatus] = useState<Status>(activeServerUrl ? 'connecting' : 'discovering');
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [error, setError] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [deepLink, setDeepLink] = useState<DeepLink | null>(() => readDeepLink());

  const setActiveServer = useCallback((url: string) => setActiveServerUrl(norm(url)), []);

  const addServer = useCallback((url: string, name?: string | null) => {
    const next = saveServerStore({ url, name });
    setServers(next);
    setActiveServerUrl(norm(url));
  }, []);

  const forgetServer = useCallback(
    (url: string) => {
      const u = norm(url);
      // Drop it from core storage (also clears its accounts + active session).
      forgetServerStore(u);
      const next = servers.filter((s) => s.url !== u);
      setServers(next);
      if (activeServerUrl && norm(activeServerUrl) === u) setActiveServerUrl(next[0]?.url ?? null);
    },
    [servers, activeServerUrl],
  );

  const discover = useCallback(() => {
    setDiscovering(true);
    let cancelled = false;
    // The browse is read at call time, not at mount: the shell registers it at
    // the app root, and a discovery that ran first would otherwise be stuck on
    // the sweep for the life of the process.
    void discoverServer({ browse: serverBrowse() ?? undefined })
      .catch(() => null)
      .then((found) => {
        if (cancelled) return;
        setDiscovering(false);
        if (found) {
          setDiscovered((d) => (d.includes(found) ? d : [...d, found]));
          // First-run bootstrap: no servers yet → adopt the discovered one.
          if (servers.length === 0) addServer(found);
        }
      });
    return () => {
      cancelled = true;
      setDiscovering(false);
    };
  }, [servers.length, addServer]);

  // No saved servers → auto-discover on the LAN (first run).
  useEffect(() => {
    if (servers.length === 0) return discover();
    setStatus((s) => (s === 'discovering' ? 'connecting' : s));
  }, [servers.length, discover]);

  // Fetch the catalogue. `quiet` skips the status/error toggles (used by the live
  // refetch below no "connecting" flicker, keep current data on a transient error).
  const fetchCatalogue = useCallback(async (c: KromaClient, quiet = false) => {
    if (!quiet) setStatus('connecting');
    try {
      const [mvs, shs] = await Promise.all([c.movies(), c.shows()]);
      // A server switch mid-flight: the answer belongs to the server that has
      // just been left, so it must not become the catalogue on screen.
      if (liveClient.current !== c) return;
      setMovies(mvs);
      setShows(shs);
      if (!quiet) setStatus('ready');
    } catch (err) {
      if (liveClient.current !== c) return;
      if (!quiet) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    }
  }, []);

  // Load the catalogue only once a profile is active the signed-out picker
  // stays silent (no /api/movies, /api/shows before sign-in).
  useEffect(() => {
    if (client && signedIn) void fetchCatalogue(client);
  }, [client, signedIn, fetchCatalogue]);

  // Heartbeat: detect when the server drops and auto-refetch when it returns.
  const { online, recheck, serverVersion, compat } = useServerHealth(client, signedIn, () => {
    if (client) void fetchCatalogue(client, true);
  });

  const activity = useCatalogueSync(client, signedIn, fetchCatalogue, recheck);

  // Smart Hub preview (Samsung TV): keep the home-screen carousel in sync.
  useEffect(() => {
    if (status !== 'ready' || !client) return;
    const id = setTimeout(() => void publishPreview(client, movies), 1500);
    return () => clearTimeout(id);
  }, [status, client, movies]);

  useEffect(() => onDeepLink(setDeepLink), []);

  const connection = useMemo<Connection>(
    () => ({
      platform,
      status,
      servers,
      activeServerUrl,
      activeServerName: serverLabel(servers, activeServerUrl),
      error,
      online,
      serverVersion,
      compat,
      client,
      movies,
      shows,
      activity,
      discovering,
      discovered,
      deepLink,
      addServer,
      setActiveServer,
      discover,
      forgetServer,
      clearDeepLink: () => setDeepLink(null),
    }),
    [
      platform,
      status,
      servers,
      activeServerUrl,
      error,
      online,
      serverVersion,
      compat,
      client,
      movies,
      shows,
      activity,
      discovering,
      discovered,
      deepLink,
      addServer,
      setActiveServer,
      discover,
      forgetServer,
    ],
  );

  return { connection, client, activeServerUrl, setActiveServer, setSignedIn };
}
