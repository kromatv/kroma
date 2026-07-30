import type { KromaClient, MediaItem, ReportSubjectKind, Show, StoredSession } from '@kroma/core';
import { Box, FocusScope, PageMain, PerfHud } from '@kroma/ui/kit';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SettingsGroupId } from '#tv/app/settings/registry';
import { perfHudPrefStore, useStoredPref } from '#tv/app/settings/store';

// The screen registry of the in-memory router: a TV has no address bar, so
// history is a stack. Adding a key here type-checks `go` / `reset` / `<TvOutlet>`.
export interface TvRoutes {
  connect: undefined;
  profiles: undefined;
  addProfile: undefined;
  quick: undefined;
  deviceSettings: undefined;
  about: undefined;
  pin: { intent: 'verify' | 'set' | 'clear'; account?: StoredSession };
  profileMenu: undefined;
  settingsGroup: { group: SettingsGroupId };
  home: undefined;
  grid: { kind: 'films' | 'series' | 'mylist' };
  genres: undefined;
  genre: { name: string };
  search: undefined;
  person: { name: string };
  movie: { item: MediaItem };
  show: { show: Show };
  player: { item: MediaItem };
  report: {
    kind: ReportSubjectKind;
    id: string;
    title: string;
    episodes?: ReportEpisode[];
  };
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

// Dev-only: the stack is in-memory, so it is mirrored to sessionStorage to survive
// an HMR full-reload. Compiled out of production builds via IS_DEV.
const IS_DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
const DEV_NAV_KEY = 'kroma:dev-nav';

function loadDevStack(): TvRoute[] | null {
  if (!IS_DEV) return null;
  try {
    // biome-ignore lint/style/noRestrictedGlobals: audited - dev-only (IS_DEV) and inside try/catch, so React Native simply keeps the default stack.
    const saved = sessionStorage.getItem(DEV_NAV_KEY);
    const parsed = saved ? (JSON.parse(saved) as TvRoute[]) : null;
    return parsed?.length ? parsed : null;
  } catch {
    return null;
  }
}

/** The route → component registry. Screens take no props; they read their own
 * params and data from hooks. */
export type TvScreens = { [K in RouteName]: ComponentType };
const ScreensCtx = createContext<TvScreens | null>(null);

// Chrome that outlives the screen under it (the browse top bar): the outlet
// renders one instance across a section change, inside the shared <FocusScope>,
// which is why the routes sharing it share one scope.
export interface TvChrome {
  routes: readonly RouteName[];
  render: ComponentType;
}
const ChromeCtx = createContext<TvChrome | null>(null);

function make<K extends RouteName>(name: K, params?: TvRoutes[K]): TvRoute {
  return { name, params } as TvRoute;
}

export function TvNavProvider({
  screens,
  chrome,
  children,
}: Readonly<{ screens: TvScreens; chrome?: TvChrome; children: ReactNode }>) {
  const [stack, setStack] = useState<TvRoute[]>(() => loadDevStack() ?? [PROFILES]);

  useEffect(() => {
    if (!IS_DEV) return;
    try {
      // biome-ignore lint/style/noRestrictedGlobals: audited - dev-only (IS_DEV) and inside try/catch.
      sessionStorage.setItem(DEV_NAV_KEY, JSON.stringify(stack));
    } catch {
      /* ignore quota/availability */
    }
  }, [stack]);

  const go = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    setStack((s) => [...s, make(name, params)]);
  }, []);
  // A no-op at depth 1 is the invariant, not an oversight: the bottom of the stack
  // is always a root (home / profiles), so there is nowhere to go back to.
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    setStack(name === 'home' ? [HOME] : [HOME, make(name, params)]);
  }, []);
  const replace = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    setStack([make(name, params)]);
  }, []);
  const swap = useCallback(<K extends RouteName>(...[name, params]: GoArgs<K>) => {
    setStack((s) => [...s.slice(0, -1), make(name, params)]);
  }, []);
  const home = useCallback(() => setStack([HOME]), []);

  const value = useMemo<TvNav>(
    () => ({
      route: stack.at(-1) ?? HOME,
      depth: stack.length,
      canGoBack: stack.length > 1,
      go,
      back,
      reset,
      replace,
      swap,
      home,
    }),
    [stack, go, back, reset, replace, swap, home],
  );
  return (
    <NavCtx.Provider value={value}>
      <ScreensCtx.Provider value={screens}>
        <ChromeCtx.Provider value={chrome ?? null}>{children}</ChromeCtx.Provider>
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

export function TvOutlet() {
  const { route } = useNav();
  const screens = useContext(ScreensCtx);
  const chrome = useContext(ChromeCtx);
  if (!screens) throw new Error('<TvOutlet> must be inside <TvNavProvider screens={…}>');
  const Screen = screens[route.name];
  const Chrome = chrome?.routes.includes(route.name) ? chrome.render : null;
  // Keyed by item id so an "up next" swap remounts the player into clean
  // engine/resume state even though the route itself doesn't change.
  const key = route.name === 'player' ? `player:${route.params.item.id}` : route.name;
  // The focus engine on Apple TV / Android TV invents no entry point on its own;
  // without <FocusScope> a screen with no `autoFocus` control mounts with focus
  // nowhere and the remote does nothing.
  const scopeKey = Chrome ? 'chrome' : key;
  return (
    <PageMain>
      <Suspense fallback={<Box fill bg="bg" />}>
        <FocusScope key={scopeKey} entryKey={key}>
          {Chrome ? <Chrome /> : null}
          <Screen key={key} />
        </FocusScope>
      </Suspense>
      {/* Outside the scope on purpose: the remote must not be able to land on it. */}
      <PerfHud enabled={usePerfHud()} />
    </PageMain>
  );
}

function usePerfHud(): boolean {
  return useStoredPref(perfHudPrefStore)[0] === 'on';
}
