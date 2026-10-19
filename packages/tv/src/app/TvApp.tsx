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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { canExitOnBack, exitOnBack } from '#tv/app/appQuit';
import { BrandIntro } from '#tv/app/BrandIntro';
import { CompatBanner } from '#tv/app/CompatBanner';
import { CrashBoundary } from '#tv/app/CrashBoundary';
import { CrashScreen } from '#tv/app/CrashScreen';
import { type DeviceNameSource, useDeviceName } from '#tv/app/deviceName';
import { createEnginePref, EnginePrefProvider } from '#tv/app/enginePref';
import { resolveRedirect } from '#tv/app/guard';
import { type LauncherBackend, LauncherProvider } from '#tv/app/launcher';
import { GUARD } from '#tv/app/navPolicy';
import { AuthProvider, useAuth } from '#tv/app/providers/auth';
import { ConnectionProvider, useConnection } from '#tv/app/providers/connection';
import { ContinueProvider } from '#tv/app/providers/continue';
import { EnvProvider, type TvEnvOverrides } from '#tv/app/providers/env';
import { LocaleProvider } from '#tv/app/providers/locale';
import { MyListProvider } from '#tv/app/providers/mylist';
import { PlaybackCapabilitiesProvider } from '#tv/app/providers/playbackCapabilities';
import { RecommendProvider } from '#tv/app/providers/recommend';
import { WatchedProvider } from '#tv/app/providers/watched';
import { TvClientProvider, TvNavProvider, TvOutlet, type TvScreens, useNav } from '#tv/app/router';
import {
  createSearchRequests,
  type SearchRequests,
  SearchRequestsProvider,
  useSearchRequests,
} from '#tv/app/searchRequest';
import { type SearchShell, SearchShellProvider } from '#tv/app/searchShell';
import type { ServerBrowse } from '#tv/app/serverBrowse';
import { ARTWORK_SCALE, ArtworkPrefProvider, createArtworkPref } from '#tv/app/settings/store';
import { useCatalogue } from '#tv/app/useCatalogue';
import { type VoiceSearchBackend, VoiceSearchProvider } from '#tv/app/voiceSearch';
import { HandoffBeaconProvider } from '#tv/features/accounts/HandoffBeaconProvider';
import { TvAddProfile } from '#tv/features/accounts/TvAddProfile';
import { TvConnect } from '#tv/features/accounts/TvConnect';
import { TvDeviceSettings } from '#tv/features/accounts/TvDeviceSettings';
import { TvPin } from '#tv/features/accounts/TvPin';
import { TvProfileMenu } from '#tv/features/accounts/TvProfileMenu';
import { TvProfiles } from '#tv/features/accounts/TvProfiles';
import { TvQuickConnect } from '#tv/features/accounts/TvQuickConnect';
import { CastReceiverProvider } from '#tv/features/cast/CastReceiverProvider';
import { TvDiscoverDetail } from '#tv/features/catalog/discover/TvDiscoverDetail';
import { BROWSE_CHROME } from '#tv/features/catalog/home/chrome';
import { TvGenreGrid } from '#tv/features/catalog/TvGenreGrid';
import { TvGenres } from '#tv/features/catalog/TvGenres';
import { TvGrid } from '#tv/features/catalog/TvGrid';
import { TvHome } from '#tv/features/catalog/TvHome';
import { TvMovieDetail } from '#tv/features/catalog/TvMovieDetail';
import { TvPerson } from '#tv/features/catalog/TvPerson';
import { TvSearch } from '#tv/features/catalog/TvSearch';
import { TvShowDetail } from '#tv/features/catalog/TvShowDetail';
import type { PlaybackPlatform } from '#tv/features/playback/player/playbackBackend';
import { TvReleases } from '#tv/features/releases/TvReleases';
import { TvReport } from '#tv/features/reports/TvReport';
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
      frostEnabled: false,
    }),
    [inheritedTheme],
  );
  const [enginePref] = useState(() => createEnginePref(storage));
  const [identity] = useState(() => createDeviceIdentity(storage));
  const [ownedSearchRequests] = useState(createSearchRequests);
  const searchRequests = suppliedSearchRequests ?? ownedSearchRequests;
  const name = useDeviceName(deviceName, platform);
  const screens = useMemo(() => ({ ...SCREENS, player: playback.Player }), [playback.Player]);

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

const SCREENS: Omit<TvScreens, 'player'> = {
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
  const { onSearchRequest } = useSearchRequests();
  const nav = useNav();
  const { deepLink, movies, shows, clearDeepLink } = useConnection();
  const { user, ready } = useAuth();

  useEffect(() => {
    // Routing on a session that has not been resumed yet would send the TV home
    // and back to the picker when the exchange turns out to fail.
    if (!ready) return;
    const target = resolveRedirect(GUARD, { signedIn: Boolean(user) }, nav.route.name);
    if (target) nav.replace(target);
  }, [ready, user, nav]);

  // Siri search, only once signed in: there is no catalogue before that.
  useEffect(() => {
    if (!user) return;
    return onSearchRequest(() => nav.reset('search'));
  }, [user, nav, onSearchRequest]);

  useEffect(() => {
    if (!user || !deepLink) return;
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
