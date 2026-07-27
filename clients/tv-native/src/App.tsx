// The native TV app: the SAME @kroma/tv experience the Tizen, webOS, Android TV
// and desktop shells mount, compiled by React Native instead of rendered in a
// WebView.
//
// A shell is deliberately thin. Everything above this file is shared: the
// screens, the design system, the focus engine, the API client. What a shell
// owns is the platform's boot sequence (fonts, splash, keep-awake) and the
// stage the app is laid out on.

import {
  setBuildInfo,
  setLauncherBackend,
  setSearchShell,
  setServerBrowse,
  setVoiceSearchBackend,
  TvApp,
} from '@kroma/tv';
import { KIT_FONTS } from '@kroma/ui/fonts';
import { registerFrost, TvStage } from '@kroma/ui/kit';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { LogBox, Platform } from 'react-native';

LogBox.ignoreAllLogs(true);

import { useEffect, useState } from 'react';
import { browseForServers } from '../modules/server-discovery';
import { startLauncherLinks } from './lib/launcher-links';
import { nativeLauncher } from './lib/native-launcher';
import { nativeSearchShell } from './lib/native-search';
import { startSiriSearch } from './lib/siri-search';
import { hydrateSessionStorage } from './lib/storage';
import { nativeVoiceSearch } from './lib/voice-search';

// Which build this is. The browser shells get it from a Vite `define`; Metro has
// no such thing, so the identity travels in Expo's `extra` (see app.config.js)
// and the shell hands it over here - at module scope, before the first render,
// like the backends below.
setBuildInfo(Constants.expoConfig?.extra?.buildInfo ?? {});
// Speaking a search is the one capability the shared app cannot implement for
// itself: the microphone belongs to the platform (see the module). Registered at
// module scope, before the first render, exactly like the image backend.
setVoiceSearchBackend(nativeVoiceSearch);
// And on Apple TV the keyboard belongs to the platform too, because that is the
// only keyboard the Siri Remote will dictate into (see the module).
setSearchShell(nativeSearchShell);
// The television's own home screen, which on Android TV an app may publish rows
// onto. Null on Apple TV, where there is no such list (see the module).
setLauncherBackend(nativeLauncher);
// Hearing the server announce itself on the LAN. Only a native shell can browse
// DNS-SD, and it is the one route that finds a server on a port nothing would
// have thought to scan - or behind a reverse proxy on 443 (see the module).
setServerBrowse(browseForServers);
// The platform's backdrop blur, which frosts the kit's glass surfaces (episode
// cards, glass buttons). tvOS composites UIVisualEffectView on the GPU, so the
// shell hands it over; the kit itself stays free of the dependency (see Frost).
registerFrost(BlurView);

export function App() {
  // A TV must never sleep mid-film, and unlike a phone there is no user
  // interaction to keep it awake.
  useKeepAwake();
  // The stored session has to be in memory BEFORE the app renders: it seeds
  // React state during the first render, so a session that arrives later is a
  // profile picker the user has already been shown.
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    void hydrateSessionStorage().finally(() => setSessionReady(true));
  }, []);
  // Siri is the Apple TV's voice input (the remote's microphone is the system's
  // and no app may open it): a request spoken to it lands on the search screen.
  useEffect(startSiriSearch, []);
  // A row KROMA published to the Android TV home, selected: the launcher opens
  // the app on `kroma://item/<id>` and the detail screen follows.
  useEffect(startLauncherLinks, []);
  // Render on FAILURE as well as on success. A missing font is a cosmetic
  // problem; blocking on it renders nothing at all, and on a television that is
  // indistinguishable from a frozen app, with no way to find out why.
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS);
  if (!sessionReady) return null;
  if (!fontsLoaded && !fontError) return null;
  // No <StatusBar>: a TV has none. tvOS does not even ship the native module
  // behind it, so asking to hide a status bar throws ("undefined is not a
  // function" out of NativeStatusBarManagerIOS) rather than being a no-op.
  return (
    <TvStage>
      {/* One binary per platform, so the label is the OS: this app is the
          Android TV client too, and reporting "AppleTV" there was wrong in the
          admin dashboard and the About screen alike. */}
      <TvApp platform={Platform.OS === 'ios' ? 'AppleTV' : 'AndroidTV'} />
    </TvStage>
  );
}
