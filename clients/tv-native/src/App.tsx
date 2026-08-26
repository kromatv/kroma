// The native TV app: the SAME @kroma/tv experience the Tizen, webOS, Android TV
// and desktop shells mount, compiled by React Native instead of rendered in a
// WebView.
//
// A shell is deliberately thin. Everything above this file is shared: the
// screens, the design system, the focus engine, the API client. What a shell
// owns is the platform's boot sequence (fonts, splash, keep-awake) and the
// stage the app is laid out on.

import {
  type DeviceNameSource,
  setBuildInfo,
  setHardwareSource,
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
import * as Device from 'expo-device';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { LogBox, Platform } from 'react-native';

LogBox.ignoreAllLogs(true);

import { lanBeacon } from '@kroma/lan-beacon';
import { useEffect, useState } from 'react';
import { browseForServers } from '../modules/server-discovery';
import { startLauncherLinks } from './lib/launcher-links';
import { nativeHardware } from './lib/native-hardware';
import { nativeLauncher } from './lib/native-launcher';
import { nativeSearchShell } from './lib/native-search';
import { startSiriSearch } from './lib/siri-search';
import { hydrateSessionStorage } from './lib/storage';
import { installVlcPlane } from './lib/vlc-plane';
import { nativeVoiceSearch } from './lib/voice-search';

// Which build this is. The browser shells get it from a Vite `define`; Metro has
// no such thing, so the identity travels in Expo's `extra` (see app.config.ts)
// and the shell hands it over here - at module scope, before the first render,
// like the backends below.
setBuildInfo(Constants.expoConfig?.extra?.buildInfo ?? {});

// What the set is called, when the platform will say. On Android TV this is the
// name typed in setup. On tvOS it is `UIDevice.current.name`, which since
// tvOS 16 answers with the MODEL unless the app carries Apple's
// user-assigned-device-name entitlement - so "Apple TV", not "Salon", until
// that entitlement is granted. Either way it beats the platform label, and the
// port drops an empty answer for us. No `subscribe`: this one is already there
// when the app starts, unlike the buses the browser shells have to ask.
const DEVICE_NAME: DeviceNameSource = { get: () => Device.deviceName };
// Speaking a search is the one capability the shared app cannot implement for
// itself: the microphone belongs to the platform (see the module). Registered at
// module scope, before the first render, exactly like the image backend.
setVoiceSearchBackend(nativeVoiceSearch);
// Hermes exposes no `navigator.hardwareConcurrency` / `deviceMemory`, so the
// About screen's numbers come from the native module instead.
setHardwareSource(nativeHardware);
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
//
// Android is handed no blur TARGET, which expo-blur 57 would need to blur a
// real backdrop there: pointed at the TV stage it sampled the wrong region
// (the canvas is drawn through a scale the blur cannot see) and outside it,
// nothing at all, at 21fps. What it draws instead is the tint, which is what
// the design falls back to anyway.
registerFrost(BlurView);

// Android builds the libVLC plane; Apple has no module and registers nothing,
// which is what keeps that engine out of its picker.
installVlcPlane();

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
      <TvApp
        platform={Platform.OS === 'ios' ? 'AppleTV' : 'AndroidTV'}
        // This television announces itself on its own link, so a phone in the
        // room can sign it in without the server having to place the two by
        // their addresses. Null on a shell without the native module.
        lan={lanBeacon ?? undefined}
        deviceName={DEVICE_NAME}
      />
    </TvStage>
  );
}
