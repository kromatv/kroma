import type { DecoderFrameLimits, LanDiscoveryBridge } from '@kromatv/core';
import { useDeviceStore } from '@kromatv/ui/device-store';
import {
  configureKit,
  KitProvider,
  OverlayHost,
  PerfProvider,
  Toaster,
  useStyleScope,
} from '@kromatv/ui/kit';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { canExitOnBack, exitOnBack } from '#tv/app/app-quit';
import { BrandIntro } from '#tv/app/brand-intro';
import { CompatBanner } from '#tv/app/compat-banner';
import { ClientOutdatedScreen } from '#tv/app/client-outdated-screen';
import { CrashBoundary } from '#tv/app/crash-boundary';
import { CrashScreen } from '#tv/app/crash-screen';
import { type DeviceNameSource, useDeviceName } from '#tv/app/device-name';
import { createEnginePref, EnginePrefProvider } from '#tv/app/engine-pref';
import { resolveRedirect } from '#tv/app/guard';
import { type LauncherBackend, LauncherProvider } from '#tv/app/launcher';
import { GUARD } from '#tv/app/nav-policy';
import { AuthProvider, useAuth } from '#tv/app/providers/auth';
import { ConnectionProvider, useConnection } from '#tv/app/providers/connection';
import { ContinueProvider } from '#tv/app/providers/continue';
import { computeEnv, EnvProvider, type TvEnvOverrides } from '#tv/app/providers/env';
import { LocaleProvider } from '#tv/app/providers/locale';
import { MyListProvider } from '#tv/app/providers/mylist';
import { PlaybackCapabilitiesProvider } from '#tv/app/providers/playback-capabilities';
import { RecommendProvider } from '#tv/app/providers/recommend';
import { WatchedProvider } from '#tv/app/providers/watched';
import { TvClientProvider, TvNavProvider, TvOutlet, type TvScreens, useNav } from '#tv/app/router';
import {
  createSearchRequests,
  type SearchRequests,
  SearchRequestsProvider,
  useSearchRequests,
} from '#tv/app/search-request';
import { type SearchShell, SearchShellProvider } from '#tv/app/search-shell';
import type { ServerBrowse } from '#tv/app/server-browse';
import { ARTWORK_SCALE, ArtworkPrefProvider, createArtworkPref } from '#tv/app/settings/store';
import { useCatalogue } from '#tv/app/use-catalogue';
import { type VoiceSearchBackend, VoiceSearchProvider } from '#tv/app/voice-search';
import { HandoffBeaconProvider } from '#tv/features/accounts/handoff-beacon-provider';
import { TvAddProfile } from '#tv/features/accounts/tv-add-profile';
import { TvConnect } from '#tv/features/accounts/tv-connect';
import { TvDeviceSettings } from '#tv/features/accounts/tv-device-settings';
import { TvPin } from '#tv/features/accounts/tv-pin';
import { TvProfileMenu } from '#tv/features/accounts/tv-profile-menu';
import { TvProfiles } from '#tv/features/accounts/tv-profiles';
import { TvQuickConnect } from '#tv/features/accounts/tv-quick-connect';
import { CastReceiverProvider } from '#tv/features/cast/cast-receiver-provider';
import { TvDiscoverDetail } from '#tv/features/catalog/discover/tv-discover-detail';
import { BROWSE_CHROME } from '#tv/features/catalog/home/chrome';
import { TvGenreGrid } from '#tv/features/catalog/tv-genre-grid';
import { TvGenres } from '#tv/features/catalog/tv-genres';
import { TvGrid } from '#tv/features/catalog/tv-grid';
import { TvHome } from '#tv/features/catalog/tv-home';
import { TvMovieDetail } from '#tv/features/catalog/tv-movie-detail';
import { TvPerson } from '#tv/features/catalog/tv-person';
import { TvSearch } from '#tv/features/catalog/tv-search';
import { TvShowDetail } from '#tv/features/catalog/tv-show-detail';
import type { PlaybackPlatform } from '#tv/features/playback/player/playback-backend';
import { TvReleases } from '#tv/features/releases/tv-releases';
import { TvReport } from '#tv/features/reports/tv-report';
import { createDeviceIdentity } from '#tv/shared/device';
import type { DeepLinks } from '#tv/shared/preview';
import { AUTH_BACKDROP } from '#tv/shared/ui';
import { createDevicePreferences, DevicePreferencesProvider } from './device-preferences';

export interface TvAppProps {
  /** The player screen and the engines behind it, from the shell. */
  playback: PlaybackPlatform;
  searchRequests?: SearchRequests;
  deepLinks?: DeepLinks;
  decoderFrameLimits?: DecoderFrameLimits;
  platform?: string;
  capabilities?: TvEnvOverrides;
  introVideoSrc?: string;
  voiceSearch?: VoiceSearchBackend | null;
  searchShell?: SearchShell | null;
  launcher?: LauncherBackend | null;
  serverBrowse?: ServerBrowse | null;
  /** This television's DNS-SD stack, when the shell has one. Passed down rather
   * than registered in a module: a capability read deep in the tree through a
   * module-level `let` is one bundling accident away from being silently null,
   * and silently null here means the television never announces itself on the
   * link and nothing anywhere says so. */
  lan?: LanDiscoveryBridge;
  /** What this set calls itself, when its platform will say. Passed down for
   * the same reason as `lan`, and for a second one: the buses that answer at
   * all answer late, so the name has to be something the tree can re-read, and
   * a module-level `let` is not. */
  deviceName?: DeviceNameSource;
}

// Module scope, so the remote is wired before the first screen renders.

// This app's form factor, stated once instead of at every control: a television
// is read across a room and driven by a D-pad, so its entries take the shell's
// ten-foot size and never the physical-keyboard spelling (see lib/field-shell).
const TV_KIT = configureKit({ formFactor: 'tv', remote: true });

// The layers the outlet keeps mounted across a route set: the browse top bar,
// and the gate's artwork beneath every sign-in screen.
const LAYERS = [BROWSE_CHROME, AUTH_BACKDROP] as const;

const TOAST_INSET = { x: 64, y: 132 } as const;

// Rendered inside <TvNavProvider>, which is what lets it offer Back: TvApp is
// the component that MOUNTS that provider, so it cannot read the nav itself.
function CrashFallback({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const nav = useNav();
  return <CrashScreen onRetry={onRetry} onBack={nav.canGoBack ? nav.back : undefined} />;
}

const crashFallback = (retry: () => void) => <CrashFallback onRetry={retry} />;

// Rendered inside <ConnectionProvider>, which TvApp mounts, so TvApp cannot
// read the verdict itself.
function CompatGate({ children }: Readonly<{ children: ReactNode }>) {
  const { compat } = useConnection();
  return compat === 'client-outdated' ? <ClientOutdatedScreen /> : children;
}

export function TvApp({
  platform = 'TV',
  capabilities,
  introVideoSrc,
  voiceSearch = null,
  searchShell = null,
  launcher = null,
  serverBrowse,
  searchRequests: suppliedSearchRequests,
  deepLinks,
  decoderFrameLimits,
  lan,
  deviceName,
  playback,
}: Readonly<TvAppProps>) {
  const storage = useDeviceStore();
  const inheritedTheme = useStyleScope().theme;
  const [devicePreferences] = useState(() => createDevicePreferences(storage));
  const [artworkPref] = useState(() => createArtworkPref(storage));
  const artworkScale = useCallback(() => ARTWORK_SCALE[artworkPref.get()], [artworkPref]);
  const { connection, client, activeServerUrl, setActiveServer, setSignedIn } = useCatalogue(
    platform,
    serverBrowse ?? undefined,
    deepLinks,
    artworkScale,
  );
  const kitConfig = useMemo(
    () => ({
      ...TV_KIT,
      ground: inheritedTheme ? undefined : ('dark' as const),
      pointerShowsFocus: computeEnv(platform, capabilities).mousePointer,
    }),
    [inheritedTheme, platform, capabilities],
  );
  const [enginePref] = useState(() => createEnginePref(storage));
  const [identity] = useState(() => createDeviceIdentity(storage));
  const [ownedSearchRequests] = useState(createSearchRequests);
  const searchRequests = suppliedSearchRequests ?? ownedSearchRequests;
  const name = useDeviceName(deviceName, platform);
  const screens = useMemo(
    () => ({ ...SCREENS, player: playback.Player, trailer: playback.Trailer }),
    [playback.Player, playback.Trailer],
  );

  return (
    <DevicePreferencesProvider value={devicePreferences}>
      <ArtworkPrefProvider value={artworkPref}>
        <EnginePrefProvider value={enginePref}>
          <KitProvider config={kitConfig}>
            <PlaybackCapabilitiesProvider limits={decoderFrameLimits}>
              <SearchRequestsProvider value={searchRequests}>
                <PerfProvider debug>
                  <LauncherProvider value={launcher}>
                    <VoiceSearchProvider value={voiceSearch}>
                      <SearchShellProvider value={searchShell}>
                        <EnvProvider platform={platform} overrides={capabilities}>
                          <TvNavProvider
                            screens={screens}
                            chrome={LAYERS}
                            onExit={canExitOnBack() ? exitOnBack : undefined}
                          >
                            <ConnectionProvider value={connection}>
                              <TvClientProvider client={client}>
                                <AuthProvider
                                  client={client}
                                  activeServerUrl={activeServerUrl}
                                  setActiveServer={setActiveServer}
                                  onSignedInChange={setSignedIn}
                                >
                                  <LocaleProvider client={client}>
                                    <CrashBoundary
                                      client={client}
                                      platform={platform}
                                      fallback={crashFallback}
                                    >
                                      <CompatBanner />
                                      <CompatGate>
                                        <ContinueProvider>
                                          <RecommendProvider>
                                            <MyListProvider>
                                              <WatchedProvider>
                                                {/* Above the router: a TV must be castable from its home
                            screen, not only from the player. */}
                                                <CastReceiverProvider
                                                  client={client}
                                                  lan={lan}
                                                  name={name}
                                                  identity={identity}
                                                >
                                                  {/* Also above the router: the beacon has to be up on
                              whichever gate screen the TV is showing. */}
                                                  <HandoffBeaconProvider
                                                    client={client}
                                                    lan={lan}
                                                    name={name}
                                                    identity={identity}
                                                  >
                                                    {/* A television cannot use React Native's <Modal>: its
                              view controller never receives a press from a remote
                              (see @kromatv/ui lib/overlay-host). */}
                                                    <OverlayHost>
                                                      <TvRouterGuard />
                                                      {/* Above the router so notices survive a screen
                                change; they never take focus. */}
                                                      <Toaster
                                                        position="top-right"
                                                        inset={TOAST_INSET}
                                                      />
                                                    </OverlayHost>
                                                  </HandoffBeaconProvider>
                                                </CastReceiverProvider>
                                              </WatchedProvider>
                                            </MyListProvider>
                                          </RecommendProvider>
                                        </ContinueProvider>
                                      </CompatGate>
                                    </CrashBoundary>
                                  </LocaleProvider>
                                </AuthProvider>
                              </TvClientProvider>
                            </ConnectionProvider>
                          </TvNavProvider>
                          <BrandIntro videoSrc={introVideoSrc} />
                        </EnvProvider>
                      </SearchShellProvider>
                    </VoiceSearchProvider>
                  </LauncherProvider>
                </PerfProvider>
              </SearchRequestsProvider>
            </PlaybackCapabilitiesProvider>
          </KitProvider>
        </EnginePrefProvider>
      </ArtworkPrefProvider>
    </DevicePreferencesProvider>
  );
}

const SCREENS: Omit<TvScreens, 'player' | 'trailer'> = {
  connect: TvConnect,
  profiles: TvProfiles,
  addProfile: TvAddProfile,
  quick: TvQuickConnect,
  deviceSettings: TvDeviceSettings,
  pin: TvPin,
  profileMenu: TvProfileMenu,
  home: TvHome,
  grid: TvGrid,
  genres: TvGenres,
  genre: TvGenreGrid,
  search: TvSearch,
  person: TvPerson,
  movie: TvMovieDetail,
  show: TvShowDetail,
  discover: TvDiscoverDetail,
  report: TvReport,
  releases: TvReleases,
};

function TvRouterGuard() {
  const { onSearchRequest, onListenRequest } = useSearchRequests();
  const nav = useNav();
  const { deepLink, movies, shows, clearDeepLink } = useConnection();
  const { user, ready } = useAuth();

  useEffect(() => {
    // Routing on a session that has not been resumed yet would send the TV home
    // and back to the picker when the exchange turns out to fail.
    if (!ready) {
      return;
    }
    const target = resolveRedirect(GUARD, { signedIn: Boolean(user) }, nav.route.name);
    if (target) {
      nav.replace(target);
    }
  }, [ready, user, nav]);

  // Siri search, only once signed in: there is no catalogue before that.
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

  useEffect(() => {
    if (!user || !deepLink) {
      return;
    }
    if (deepLink.type === 'movie') {
      const movie = movies.find((m) => m.id === deepLink.id);
      if (movie) {
        nav.reset('movie', { item: movie });
        clearDeepLink();
      }
    } else {
      const show = shows.find((s) => s.id === deepLink.id);
      if (show) {
        nav.reset('show', { show });
        clearDeepLink();
      }
    }
  }, [user, deepLink, movies, shows, nav, clearDeepLink]);

  return <TvOutlet />;
}
