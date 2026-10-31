import { createAdminApi } from '#web/features/admin/module-api';
import { createQueries } from './queries';
import { makeQueryClient } from './query';
// KROMA API origin resolution.

import type { KromaClient } from '@kromatv/client';
import { loadSession } from '@kromatv/client/accounts';
import type { MediaCard, MediaItem, Show } from '@kromatv/client/media';
import { createQueryClient, type QueryClient } from '@kromatv/client/query';
import type { SubtitleId } from '@kromatv/client/subtitles';
import { deviceLocale, isTextSubtitle, resolveImageUrl } from '@kromatv/core';

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

/** Request state and query factories belong to one router, including SSR. */
export function createWebRuntime(options: { client?: QueryClient } = {}) {
  const client =
    options.client ?? createQueryClient({ baseUrl: apiBase(), locale: deviceLocale() });
  const queryClient = makeQueryClient();
  async function exchangeStoredSession(): Promise<string | undefined> {
    const active = loadSession();
    if (!active) return undefined;
    try {
      const result = await client.session.sharedTokenExchange(() =>
        client.accounts.exchangeToken(active.accessToken),
      );
      client.setAuthToken(result.token);
      return result.token;
    } catch {
      client.setAuthToken(undefined);
      return undefined;
    }
  }
  client.setRefreshHandler(exchangeStoredSession);
  return {
    client,
    queryClient,
    queries: createQueries(client),
    moduleApi: createAdminApi(client),
    async ensureSession(): Promise<void> {
      if (!client.sessionToken) await exchangeStoredSession();
    },
  };
}
export type WebRuntime = ReturnType<typeof createWebRuntime>;

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
  title?: string | null;
  forced?: boolean;
  downloaded?: boolean;
  label?: string;
  subId?: SubtitleId;
  provider?: string;
}

/** A movie as a grid draws it, with its art pre-resolved to absolute KROMA URLs.
 *  Every `MovieView` is one. */
export interface MovieCardView extends MediaCard {
  poster: string;
  backdrop: string | null;
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

export function toMovieCardView(c: KromaClient, card: MediaCard): MovieCardView {
  return {
    ...card,
    poster: c.media.artwork.posterFor(card),
    backdrop: c.media.artwork.backdropFor(card),
  };
}

export function toMovieView(c: KromaClient, item: MediaItem): MovieView {
  const subs: SubtitleView[] = item.subtitles.map((s, index) => ({
    index,
    language: s.language,
    codec: s.codec,
    title: s.title,
    forced: s.forced,
    url: isTextSubtitle(s.codec) ? c.media.subtitleUrl(item.id, index) : null,
  }));
  return {
    ...item,
    poster: c.media.artwork.posterFor(item),
    backdrop: c.media.artwork.backdropFor(item),
    stream: c.media.streamUrl(item.id),
    subs,
  };
}

export function toShowView(c: KromaClient, show: Show): ShowView {
  return {
    ...show,
    poster: c.media.artwork.showPosterFor(show),
    backdrop: c.media.artwork.backdropFor(show),
  };
}
