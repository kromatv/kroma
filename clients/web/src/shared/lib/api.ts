// KROMA API origin resolution.

import {
  isTextSubtitle,
  KromaClient,
  loadSession,
  type MediaItem,
  resolveImageUrl,
  type Show,
  sessionToken,
  setSessionToken,
  sharedTokenExchange,
} from '@kroma/core';

declare global {
  interface Window {
    __KROMA_API__?: string;
  }
}

const DEFAULT_BASE = 'http://localhost:4040';

// Linear scan, no backtracking regex.
function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end -= 1;
  return s.slice(0, end);
}

/** The KROMA server origin (no trailing slash). */
export function apiBase(): string {
  if (typeof window !== 'undefined' && window.__KROMA_API__) {
    return stripTrailingSlashes(window.__KROMA_API__);
  }
  const envBase = import.meta.env?.VITE_KROMA_SERVER;
  if (envBase) return stripTrailingSlashes(envBase);
  if (import.meta.env?.DEV) {
    return typeof window !== 'undefined'
      ? stripTrailingSlashes(window.location.origin)
      : DEFAULT_BASE;
  }
  if (typeof window !== 'undefined') return stripTrailingSlashes(window.location.origin);
  const env = typeof process !== 'undefined' ? process.env.KROMA_SERVER_URL : undefined;
  return stripTrailingSlashes(env ?? DEFAULT_BASE);
}

/** Whether an account is active on this device (has a stored access token).
 * Route loaders use this to skip fetching the (now auth-gated) catalogue before
 * sign-in the router re-runs them once logged in (see the root invalidator). */
export function isAuthed(): boolean {
  return loadSession() != null;
}

// Exchange the stored access token for a fresh in-memory session bearer. Shared
// app-wide via `sharedTokenExchange`, so a reload's boot exchange (auth provider),
// this refresh, and any concurrent 401s coalesce into ONE POST /auth/token.
function exchangeStoredSession(): Promise<string | undefined> {
  const active = loadSession();
  if (!active) return Promise.resolve(undefined);
  return sharedTokenExchange(() =>
    new KromaClient({ baseUrl: apiBase() }).exchangeToken(active.accessToken),
  )
    .then((res) => {
      setSessionToken(res.token);
      return res.token as string | undefined;
    })
    .catch(() => {
      setSessionToken(undefined);
      return undefined;
    });
}

/** Ensure an in-memory session bearer exists, running the boot token exchange if
 * it hasn't happened yet. Route loaders `await` this so their first authed
 * request carries a bearer instead of racing the boot exchange and 401-then-
 * retrying on every reload. A no-op once a bearer is in memory or when signed
 * out (no stored session to exchange). */
export function ensureSession(): Promise<void> {
  if (sessionToken()) return Promise.resolve();
  return exchangeStoredSession().then(() => undefined);
}

export function kromaClient(): KromaClient {
  const c = new KromaClient({ baseUrl: apiBase(), authToken: sessionToken() });
  c.setRefreshHandler(exchangeStoredSession);
  return c;
}

/** Resolve a metadata image path (relative `/api/…` cached art, or an absolute
 * URL) against the KROMA origin. Works on both server and client. */
export function imageUrl(url: string | null | undefined): string | null {
  return resolveImageUrl(apiBase(), url);
}

/** A subtitle track with its on-demand WebVTT URL (text subs only). */
export interface SubtitleView {
  index: number;
  language: string | null;
  codec: string;
  url: string | null;
  downloaded?: boolean;
  label?: string;
  subId?: string;
  provider?: string;
}

/** A movie/episode with art + stream + subtitle URLs pre-resolved to absolute KROMA URLs. */
export interface MovieView extends MediaItem {
  poster: string;
  backdrop: string | null;
  stream: string;
  subs: SubtitleView[];
}

/** A show with art pre-resolved. */
export interface ShowView extends Show {
  poster: string;
  backdrop: string | null;
}

export function toMovieView(c: KromaClient, item: MediaItem): MovieView {
  const subs: SubtitleView[] = item.subtitles.map((s, index) => ({
    index,
    language: s.language,
    codec: s.codec,
    url: isTextSubtitle(s.codec) ? c.subtitleUrl(item.id, index) : null,
  }));
  return {
    ...item,
    poster: c.posterFor(item),
    backdrop: c.backdropFor(item),
    stream: c.streamUrl(item.id),
    subs,
  };
}

export function toShowView(c: KromaClient, show: Show): ShowView {
  return { ...show, poster: c.showPosterFor(show), backdrop: c.backdropFor(show) };
}
