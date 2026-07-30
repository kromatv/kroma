import { configureRemote, OverlayHost, Toaster } from '@kroma/ui/kit';
import { useEffect } from 'react';
import { BrandIntro } from '#tv/app/BrandIntro';
import { CompatBanner } from '#tv/app/CompatBanner';
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
// How the player is loaded is a PLATFORM decision, not an app one: the browser
// targets code-split it, the native ones cannot (and must not - see the module).
import { TvPlayer } from '#tv/features/playback/playerChunk';
import { TvReport } from '#tv/features/reports/TvReport';

export interface TvAppProps {
  /** Platform label shown in diagnostics, e.g. "Tizen" / "webOS". */
  platform?: string;
  /** Override input-capability detection (pointer / physical keyboard) when the
   * platform label alone is wrong e.g. a Steam Deck is 'Desktop' but gamepad-driven. */
  capabilities?: TvEnvOverrides;
  /** Shell-bundled override for the brand-intro film. TVs keep the default 4K60
   * HEVC film (hardware plane, panel upscale); the Tauri desktop shell passes a
   * 1080p grade because its transparent window (the native mpv plane sits
   * behind the webview) costs <video> the compositor fast path, so 4K frames
   * are decoded and downscaled the slow way. */
  introVideoSrc?: string;
}

// One remote, one navigator. Wired at module scope so it is in place before the
// first screen renders, on every shell: the tvOS/Android event emitter and the
// browser TVs' key events both end in the same four directions.
configureRemote();

/** The top bar's own gutter (64) horizontally, and below its 144px band. */
const TOAST_INSET = { x: 64, y: 132 } as const;

export function TvApp({ platform = 'TV', capabilities, introVideoSrc }: Readonly<TvAppProps>) {
  const { connection, client, activeServerUrl, setActiveServer, setSignedIn } =
    useCatalogue(platform);

  return (
    <EnvProvider platform={platform} overrides={capabilities}>
      <TvNavProvider screens={SCREENS} chrome={BROWSE_CHROME}>
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
                        {/* Above the router, not inside the player: a TV must be
                            castable from its home screen, which is where a phone
                            reaches for it. */}
                        <CastReceiverProvider client={client}>
                          {/* Every dialog in the app renders HERE rather than
                              where it was written: a television cannot use
                              React Native's <Modal>, whose own view controller
                              never receives a press from a remote (see
                              @kroma/ui's lib/overlay-host). Wrapping the router
                              is what puts a dialog over a whole screen without
                              being clipped by the list or bar that opened it. */}
                          <OverlayHost>
                            <TvRouterGuard />
                            {/* Notices ("iPhone connected") land under the top
                                bar, aligned with its right gutter and clear of
                                it. Above the router so they survive a screen
                                change, and they never take focus. */}
                            <Toaster placement="top-right" inset={TOAST_INSET} />
                          </OverlayHost>
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

/** Route → component registry. Each screen reads its own data from hooks. */
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

/** Drives the route from connection + session, then renders the routed screen. */
function TvRouterGuard() {
  const nav = useNav();
  const { deepLink, movies, shows, clearDeepLink } = useConnection();
  const { user } = useAuth();

  useEffect(() => {
    const target = resolveRedirect(GUARD, { signedIn: Boolean(user) }, nav.route.name);
    if (target) nav.replace(target);
  }, [user, nav]);

  // A search asked for from outside the app (Siri on Apple TV). Only once signed
  // in: there is no catalogue to search before that, and the guard would bounce
  // the screen straight back anyway. The query itself is read by the search
  // screen as it mounts.
  useEffect(() => {
    if (!user) return;
    return onSearchRequest(() => nav.reset('search'));
  }, [user, nav]);

  // Apply a pending Smart-Hub deep link once signed in and its target is loaded.
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
