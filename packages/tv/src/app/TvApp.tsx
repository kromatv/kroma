import type { LanDiscoveryBridge } from '@kroma/core';
import { configureRemote, OverlayHost, setEntryDefaults, Toaster } from '@kroma/ui/kit';
import { useEffect } from 'react';
import { BrandIntro } from '#tv/app/BrandIntro';
import { CompatBanner } from '#tv/app/CompatBanner';
import { type DeviceNameSource, useDeviceName } from '#tv/app/deviceName';
import { resolveRedirect } from '#tv/app/guard';
import { GUARD } from '#tv/app/navPolicy';
import { AuthProvider, useAuth } from '#tv/app/providers/auth';
import { ConnectionProvider, useConnection } from '#tv/app/providers/connection';
import { ContinueProvider } from '#tv/app/providers/continue';
import { EnvProvider, type TvEnvOverrides } from '#tv/app/providers/env';
import { LocaleProvider } from '#tv/app/providers/locale';
import { MyListProvider } from '#tv/app/providers/mylist';
import { RecommendProvider } from '#tv/app/providers/recommend';
import { WatchedProvider } from '#tv/app/providers/watched';
import { TvClientProvider, TvNavProvider, TvOutlet, type TvScreens, useNav } from '#tv/app/router';
import { onSearchRequest } from '#tv/app/searchRequest';
import { useCatalogue } from '#tv/app/useCatalogue';
import { HandoffBeaconProvider } from '#tv/features/accounts/HandoffBeaconProvider';
import { TvAbout } from '#tv/features/accounts/TvAbout';
import { TvAddProfile } from '#tv/features/accounts/TvAddProfile';
import { TvConnect } from '#tv/features/accounts/TvConnect';
import { TvDeviceSettings } from '#tv/features/accounts/TvDeviceSettings';
import { TvPin } from '#tv/features/accounts/TvPin';
import { TvProfileMenu } from '#tv/features/accounts/TvProfileMenu';
import { TvProfiles } from '#tv/features/accounts/TvProfiles';
import { TvQuickConnect } from '#tv/features/accounts/TvQuickConnect';
import { TvSettingsGroup } from '#tv/features/accounts/TvSettingsGroup';
import { CastReceiverProvider } from '#tv/features/cast/CastReceiverProvider';
import { BROWSE_CHROME } from '#tv/features/catalog/home/chrome';
import { TvGenreGrid } from '#tv/features/catalog/TvGenreGrid';
import { TvGenres } from '#tv/features/catalog/TvGenres';
import { TvGrid } from '#tv/features/catalog/TvGrid';
import { TvHome } from '#tv/features/catalog/TvHome';
import { TvMovieDetail } from '#tv/features/catalog/TvMovieDetail';
import { TvPerson } from '#tv/features/catalog/TvPerson';
import { TvSearch } from '#tv/features/catalog/TvSearch';
import { TvShowDetail } from '#tv/features/catalog/TvShowDetail';
// Loading the player is a platform decision: the browser targets code-split it,
// the native ones cannot.
import { TvPlayer } from '#tv/features/playback/playerChunk';
import { TvReport } from '#tv/features/reports/TvReport';
import { AUTH_BACKDROP } from '#tv/shared/ui';

export interface TvAppProps {
  platform?: string;
  capabilities?: TvEnvOverrides;
  introVideoSrc?: string;
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
configureRemote();

// This app's form factor, stated once instead of at every control: a television
// is read across a room and driven by a D-pad, so its entries take the shell's
// ten-foot size and never the physical-keyboard spelling (see lib/field-shell).
setEntryDefaults({ size: 'tv' });

// The layers the outlet keeps mounted across a route set: the browse top bar,
// and the gate's artwork beneath every sign-in screen.
const LAYERS = [BROWSE_CHROME, AUTH_BACKDROP] as const;

const TOAST_INSET = { x: 64, y: 132 } as const;

export function TvApp({
  platform = 'TV',
  capabilities,
  introVideoSrc,
  lan,
  deviceName,
}: Readonly<TvAppProps>) {
  const { connection, client, activeServerUrl, setActiveServer, setSignedIn } =
    useCatalogue(platform);
  const name = useDeviceName(deviceName, platform);

  return (
    <EnvProvider platform={platform} overrides={capabilities}>
      <TvNavProvider screens={SCREENS} chrome={LAYERS}>
        <ConnectionProvider value={connection}>
          <TvClientProvider client={client}>
            <AuthProvider
              client={client}
              activeServerUrl={activeServerUrl}
              setActiveServer={setActiveServer}
              onSignedInChange={setSignedIn}
            >
              <LocaleProvider client={client}>
                <CompatBanner />
                <ContinueProvider>
                  <RecommendProvider>
                    <MyListProvider>
                      <WatchedProvider>
                        {/* Above the router: a TV must be castable from its home
                            screen, not only from the player. */}
                        <CastReceiverProvider client={client} lan={lan} name={name}>
                          {/* Also above the router: the beacon has to be up on
                              whichever gate screen the TV is showing. */}
                          <HandoffBeaconProvider client={client} lan={lan} name={name}>
                            {/* A television cannot use React Native's <Modal>: its
                              view controller never receives a press from a remote
                              (see @kroma/ui lib/overlay-host). */}
                            <OverlayHost>
                              <TvRouterGuard />
                              {/* Above the router so notices survive a screen
                                change; they never take focus. */}
                              <Toaster position="top-right" inset={TOAST_INSET} />
                            </OverlayHost>
                          </HandoffBeaconProvider>
                        </CastReceiverProvider>
                      </WatchedProvider>
                    </MyListProvider>
                  </RecommendProvider>
                </ContinueProvider>
              </LocaleProvider>
            </AuthProvider>
          </TvClientProvider>
        </ConnectionProvider>
      </TvNavProvider>
      <BrandIntro videoSrc={introVideoSrc} />
    </EnvProvider>
  );
}

const SCREENS: TvScreens = {
  connect: TvConnect,
  profiles: TvProfiles,
  addProfile: TvAddProfile,
  quick: TvQuickConnect,
  deviceSettings: TvDeviceSettings,
  about: TvAbout,
  pin: TvPin,
  profileMenu: TvProfileMenu,
  settingsGroup: TvSettingsGroup,
  home: TvHome,
  grid: TvGrid,
  genres: TvGenres,
  genre: TvGenreGrid,
  search: TvSearch,
  person: TvPerson,
  movie: TvMovieDetail,
  show: TvShowDetail,
  player: TvPlayer,
  report: TvReport,
};

function TvRouterGuard() {
  const nav = useNav();
  const { deepLink, movies, shows, clearDeepLink } = useConnection();
  const { user } = useAuth();

  useEffect(() => {
    const target = resolveRedirect(GUARD, { signedIn: Boolean(user) }, nav.route.name);
    if (target) nav.replace(target);
  }, [user, nav]);

  // Siri search, only once signed in: there is no catalogue before that.
  useEffect(() => {
    if (!user) return;
    return onSearchRequest(() => nav.reset('search'));
  }, [user, nav]);

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
