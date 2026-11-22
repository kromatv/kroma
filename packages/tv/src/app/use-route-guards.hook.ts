import type { MediaCard, Show } from '@kromatv/client/media';
import { useEffect } from 'react';
import { sessionTarget } from '#tv/app/nav-policy';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';
import { type TvNav, useNav } from '#tv/app/router';
import { useSearchRequests } from '#tv/app/search-request';
import type { DeepLink } from '#tv/shared/preview';

/** Keeps the television on a screen its session may be on, opens the search
 *  the platform asks for once signed in, and opens what a deep link names once
 *  the catalogue holds it. */
export function useRouteGuards(): void {
  useSessionGuard();
  useSearchShortcuts();
  useDeepLinks();
}

function useSessionGuard(): void {
  const nav = useNav();
  const { user, ready } = useAuth();
  useEffect(() => {
    const target = sessionTarget({ ready, user, route: nav.route.name });
    if (target) {
      nav.replace(target);
    }
  }, [ready, user, nav]);
}

function useSearchShortcuts(): void {
  const nav = useNav();
  const { user } = useAuth();
  const { onSearchRequest, onListenRequest } = useSearchRequests();
  useEffect(() => {
    if (!user) {
      return undefined;
    }
    return onSearchRequest(() => nav.reset('search'));
  }, [user, nav, onSearchRequest]);
  useEffect(() => {
    if (!user) {
      return undefined;
    }
    return onListenRequest(() => {
      if (nav.route.name !== 'search') {
        nav.reset('search');
      }
    });
  }, [user, nav, onListenRequest]);
}

function useDeepLinks(): void {
  const nav = useNav();
  const { user } = useAuth();
  const { deepLink, movies, shows, clearDeepLink } = useConnection();
  useEffect(() => {
    if (user && deepLink && openDeepLink(nav, deepLink, { movies, shows })) {
      clearDeepLink();
    }
  }, [user, deepLink, movies, shows, nav, clearDeepLink]);
}

function openDeepLink(
  nav: Pick<TvNav, 'reset'>,
  link: DeepLink,
  catalogue: Readonly<{ movies: readonly MediaCard[]; shows: readonly Show[] }>,
): boolean {
  if (link.type === 'movie') {
    const item = catalogue.movies.find((movie) => movie.id === link.id);
    if (item) {
      nav.reset('movie', { item });
    }
    return item !== undefined;
  }
  const show = catalogue.shows.find((candidate) => candidate.id === link.id);
  if (show) {
    nav.reset('show', { show });
  }
  return show !== undefined;
}
