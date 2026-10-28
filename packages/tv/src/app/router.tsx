import type { KromaClient } from '@kromatv/client';
import type { StoredSession } from '@kromatv/client/accounts';
import type { DiscoverEntry } from '@kromatv/client/discovery';
import type { MediaItem, Show } from '@kromatv/client/media';
import type { ReportSubjectKind } from '@kromatv/client/reports';
import { Box, ConfirmHost, FocusScope, PageMain, PerfHud } from '@kromatv/ui/kit';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  Suspense,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { ARTWORK_SCALE, useArtworkPref, useStoredPref } from '#tv/app/settings/store';
import { loadDevStack, useDevStackMirror } from './devStack';
import { useDevicePreferences } from './device-preferences';
import { PlayerDockProvider, PlayerSlot } from './playerDock';

// The screen registry of the in-memory router: a TV has no address bar, so
// history is a stack. Adding a key here type-checks `go` / `reset` / `<TvOutlet>`.
export interface TvRoutes {
  connect: undefined;
  profiles: undefined;
  addProfile: undefined;
  quick: undefined;
  deviceSettings: undefined;
  pin: { account: StoredSession };
  profileMenu: undefined;
  home: undefined;
  grid: { kind: 'films' | 'series' | 'mylist' };
  genres: undefined;
  genre: { slug: string };
  search: undefined;
  person: { name: string };
  movie: { item: MediaItem };
  show: { show: Show };
  discover: { entry: DiscoverEntry };
  player: { item: MediaItem };
  report: {
    kind: ReportSubjectKind;
    id: string;
    title: string;
    episodes?: ReportEpisode[];
  };
  releases: undefined;
}

export interface ReportEpisode {
  id: string;
  label: string;
}

export type RouteName = keyof TvRoutes;
export type TvRoute = { [K in RouteName]: { name: K; params: TvRoutes[K] } }[RouteName];

type GoArgs<K extends RouteName> = TvRoutes[K] extends undefined
  ? [name: K]
  : [name: K, params: TvRoutes[K]];

export interface TvNav {
  route: TvRoute;
  depth: number;
  canGoBack: boolean;
  canExit: boolean;
  go: <K extends RouteName>(...args: GoArgs<K>) => void;
  back: () => void;
  reset: <K extends RouteName>(...args: GoArgs<K>) => void;
  replace: <K extends RouteName>(...args: GoArgs<K>) => void;
  swap: <K extends RouteName>(...args: GoArgs<K>) => void;
  home: () => void;
}

const PROFILES = { name: 'profiles', params: undefined } as TvRoute;
const HOME = { name: 'home', params: undefined } as TvRoute;
const NavCtx = createContext<TvNav | null>(null);

/** The route → component registry. Screens take no props; they read their own
 * params and data from hooks. */
export type TvScreens = { [K in RouteName]: ComponentType };
const ScreensCtx = createContext<TvScreens | null>(null);

/**
 * A layer that outlives the screen it belongs to: the outlet renders ONE
 * instance across every route in `routes`, so it neither remounts nor refetches
 * as the viewer moves between them. That is what lets the browse nav pill's
 * lens travel between sections instead of arriving with no previous box to
 * animate from, and what stops the gate's splash cutting to another cover and
 * restarting its pan on every step of a sign-in.
 *
 * `under` is the whole difference between the two kinds. Chrome sits INSIDE the
 * shared <FocusScope> - it is reachable, so its routes share one scope. A
 * backdrop sits under it: decorative, never a focus target, and its routes keep
 * their own scopes.
 */
export interface TvChrome {
  routes: readonly RouteName[];
  render: ComponentType;
  under?: boolean;
}
const ChromeCtx = createContext<readonly TvChrome[] | null>(null);

function make<K extends RouteName>(name: K, params?: TvRoutes[K]): TvRoute {
  return { name, params } as TvRoute;
}

export function TvNavProvider({
  screens,
  chrome,
  onExit,
  children,
}: Readonly<{
  screens: TvScreens;
  chrome?: readonly TvChrome[];
  onExit?: () => void;
  children: ReactNode;
}>) {
  const [stack, setStack] = useState<TvRoute[]>(() => loadDevStack(screens) ?? [PROFILES]);

  useDevStackMirror(stack);

  const go = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    startTransition(() => setStack((s) => [...s, make(name, params)]));
  }, []);
  // The bottom of the stack is always a root (home / profiles), so there is
  // nowhere to go back to: Back there leaves the app where the shell can.
  const root = stack.length <= 1;
  const back = useCallback(() => {
    if (root) onExit?.();
    else startTransition(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)));
  }, [root, onExit]);
  const reset = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    startTransition(() => setStack(name === 'home' ? [HOME] : [HOME, make(name, params)]));
  }, []);
  const replace = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    startTransition(() => setStack([make(name, params)]));
  }, []);
  const swap = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    startTransition(() => setStack((s) => [...s.slice(0, -1), make(name, params)]));
  }, []);
  const home = useCallback(() => startTransition(() => setStack([HOME])), []);

  const value = useMemo<TvNav>(
    () => ({
      route: stack.at(-1) ?? HOME,
      depth: stack.length,
      canGoBack: stack.length > 1,
      canExit: onExit != null,
      go,
      back,
      reset,
      replace,
      swap,
      home,
    }),
    [stack, onExit, go, back, reset, replace, swap, home],
  );
  return (
    <NavCtx.Provider value={value}>
      <ScreensCtx.Provider value={screens}>
        <ChromeCtx.Provider value={chrome ?? null}>
          <PlayerDockProvider>{children}</PlayerDockProvider>
        </ChromeCtx.Provider>
      </ScreensCtx.Provider>
    </NavCtx.Provider>
  );
}

export function useNav(): TvNav {
  const ctx = useContext(NavCtx);
  if (!ctx) throw new Error('useNav() must be used inside <TvNavProvider>');
  return ctx;
}

/** Typed access to the current route's params; throws on any other route. */
export function useParams<K extends RouteName>(name: K): TvRoutes[K] {
  const { route } = useNav();
  if (route.name !== name) throw new Error(`useParams('${name}') called on route '${route.name}'`);
  return route.params as TvRoutes[K];
}

const ClientCtx = createContext<KromaClient | null>(null);

export function TvClientProvider({
  client,
  children,
}: Readonly<{
  client: KromaClient | null;
  children: ReactNode;
}>) {
  return <ClientCtx.Provider value={client}>{children}</ClientCtx.Provider>;
}

/** The KromaClient; throws if read before a server is reached. */
export function useClient(): KromaClient {
  const c = useContext(ClientCtx);
  if (!c) throw new Error('useClient() called before the server was reached');
  return c;
}

// Two routes can replace their own subject without changing name: an "up next"
// swap, a suggestion opened from a film's page. Keyed by name alone they would
// reconcile in place, keeping the previous engine and leaving the ring on a card
// that has just unmounted; keyed by the subject they remount.
function subjectKey(route: TvRoute): string {
  if (route.name === 'player' || route.name === 'movie') {
    return `${route.name}:${route.params.item.id}`;
  }
  if (route.name === 'discover') return `discover:${route.params.entry.tmdbId}`;
  return route.name;
}

export function TvOutlet() {
  const { route } = useNav();
  const screens = useContext(ScreensCtx);
  const chrome = useContext(ChromeCtx);
  if (!screens) throw new Error('<TvOutlet> must be inside <TvNavProvider screens={…}>');
  const Screen = screens[route.name];
  const here = (chrome ?? []).filter((layer) => layer.routes.includes(route.name));
  const under = here.filter((layer) => layer.under);
  const inScope = here.filter((layer) => !layer.under);
  const key = subjectKey(route);
  // The focus engine on Apple TV / Android TV invents no entry point on its own;
  // without <FocusScope> a screen with no `autoFocus` control mounts with focus
  // nowhere and the remote does nothing.
  const scopeKey = inScope.length > 0 ? 'chrome' : key;
  const playing = route.name === 'player' ? route.params.item : null;
  return (
    <PageMain>
      {/* First, so they paint behind, and outside the scope, so the remote can
          never land on one and a route change never remounts it. */}
      {under.map((layer) => (
        <layer.render key={layer.routes[0]} />
      ))}
      <PlayerSlot top={playing} Screen={screens.player} />
      {playing ? null : (
        <Suspense fallback={<Box fill bg="bg" />}>
          <FocusScope key={scopeKey} entryKey={key}>
            <ConfirmHost>
              {inScope.map((layer) => (
                <layer.render key={layer.routes[0]} />
              ))}
              <Screen key={key} />
              {/* Inside the scope, because that is what a dialog needs to take the
                remote: outside one, `useLockFocusBehind` is a documented no-op and
                the panel's own buttons never register with a navigator. */}
            </ConfirmHost>
          </FocusScope>
        </Suspense>
      )}
      {/* Outside the scope on purpose: the remote must not be able to land on it. */}
      <PerfHud
        enabled={usePerfHud()}
        artworkScale={ARTWORK_SCALE[useStoredPref(useArtworkPref())[0]]}
      />
    </PageMain>
  );
}

function usePerfHud(): boolean {
  return useStoredPref(useDevicePreferences().perfHud)[0] === 'on';
}
