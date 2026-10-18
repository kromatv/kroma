import type { DeviceStore } from '@kromatv/ui/device-store';
// The native TV app: the SAME @kromatv/tv experience the Tizen, webOS, Android TV
// and desktop shells mount, compiled by React Native instead of rendered in a
// WebView.
//
// A shell is deliberately thin. Everything above this file is shared: the
// screens, the design system, the focus engine, the API client. What a shell
// owns is the platform's boot sequence (fonts, splash, keep-awake) and the
// stage the app is laid out on.

import { createDeepLinks, createSearchRequests, type DeviceNameSource, TvApp } from '@kromatv/tv';
import { expoImageBackend } from '@kromatv/ui/expo-image';
import { KIT_FONTS } from '@kromatv/ui/fonts';
import { configureKit, KitProvider, TvStage } from '@kromatv/ui/kit';
import { BlurView } from 'expo-blur';
import * as Device from 'expo-device';
import { useFonts } from 'expo-font';
import { useKeepAwake } from 'expo-keep-awake';
import { LogBox, Platform } from 'react-native';

LogBox.ignoreAllLogs(true);

import { lanBeacon } from '@kromatv/lan-beacon';
import { useEffect, useState } from 'react';
import { decoderFrameLimits } from '../modules/device-hardware';
import { browseForServers } from '../modules/server-discovery';
import { startLauncherLinks } from './lib/launcher-links';
import { nativeLauncher } from './lib/native-launcher';
import { nativeSearchShell } from './lib/native-search';
import { startSiriSearch } from './lib/siri-search';
import { hydrateSessionStorage } from './lib/storage';
import { nativeVoiceSearch } from './lib/voice-search';

// What the set is called, when the platform will say. On Android TV this is the
// name typed in setup. On tvOS it is `UIDevice.current.name`, which since
// tvOS 16 answers with the MODEL unless the app carries Apple's
// user-assigned-device-name entitlement - so "Apple TV", not "Salon", until
// that entitlement is granted. Either way it beats the platform label, and the
// port drops an empty answer for us. No `subscribe`: this one is already there
// when the app starts, unlike the buses the browser shells have to ask.
const DEVICE_NAME: DeviceNameSource = { get: () => Device.deviceName };
// How large a picture this set's decoders take, which decides whether a title
// direct-plays at all. Every other client guesses from the codec alone, and a
// television that stops at 1080p answers a 4K file with a slideshow.
// The television's own home screen, which on Android TV an app may publish rows
// onto. Null on Apple TV, where there is no such list (see the module).
// Hearing the server announce itself on the LAN. Only a native shell can browse
// DNS-SD, and it is the one route that finds a server on a port nothing would
// have thought to scan - or behind a reverse proxy on 443 (see the module).
// The decoder that draws artwork, and the platform's backdrop blur, which
// frosts the kit's glass surfaces (episode cards, glass buttons). tvOS
// composites UIVisualEffectView on the GPU, so the shell hands it over; the kit
// itself stays free of the dependency (see Frost). The form factor is TvApp's
// to state, and it does.
//
// Android is handed no blur TARGET, which expo-blur 57 would need to blur a
// real backdrop there: pointed at the TV stage it sampled the wrong region
// (the canvas is drawn through a scale the blur cannot see) and outside it,
// nothing at all, at 21fps. What it draws instead is the tint, which is what
// the design falls back to anyway.
const NATIVE_KIT = configureKit({ image: expoImageBackend, frost: BlurView });

export function App() {
  const [frameLimits] = useState(decoderFrameLimits);
  const [deepLinks] = useState(createDeepLinks);
  const [searchRequests] = useState(createSearchRequests);
  // A TV must never sleep mid-film, and unlike a phone there is no user
  // interaction to keep it awake.
  useKeepAwake();
  // The stored session has to be in memory BEFORE the app renders: it seeds
  // React state during the first render, so a session that arrives later is a
  // profile picker the user has already been shown.
  const [deviceStore, setDeviceStore] = useState<DeviceStore | null>(null);
  useEffect(() => {
    let alive = true;
    void hydrateSessionStorage().then((store) => {
      if (alive) setDeviceStore(store);
    });
    return () => {
      alive = false;
    };
  }, []);
  // Siri is the Apple TV's voice input (the remote's microphone is the system's
  // and no app may open it): a request spoken to it lands on the search screen.
  useEffect(() => startSiriSearch(searchRequests.requestSearch), [searchRequests]);
  // A row KROMA published to the Android TV home, selected: the launcher opens
  // the app on `kroma://item/<id>` and the detail screen follows.
  useEffect(() => startLauncherLinks(deepLinks.requestDeepLink), [deepLinks]);
  // Render on FAILURE as well as on success. A missing font is a cosmetic
  // problem; blocking on it renders nothing at all, and on a television that is
  // indistinguishable from a frozen app, with no way to find out why.
  const [fontsLoaded, fontError] = useFonts(KIT_FONTS);
  if (!deviceStore) return null;
  if (!fontsLoaded && !fontError) return null;
  // No <StatusBar>: a TV has none. tvOS does not even ship the native module
  // behind it, so asking to hide a status bar throws ("undefined is not a
  // function" out of NativeStatusBarManagerIOS) rather than being a no-op.
  return (
    <KitProvider config={{ ...NATIVE_KIT, deviceStore }}>
      <TvStage>
        {/* One binary per platform, so the label is the OS: this app is the
          Android TV client too, and reporting "AppleTV" there was wrong in the
          admin dashboard and the About screen alike. */}
        <TvApp
          decoderFrameLimits={frameLimits ?? undefined}
          deepLinks={deepLinks}
          searchRequests={searchRequests}
          voiceSearch={nativeVoiceSearch}
          searchShell={nativeSearchShell}
          launcher={nativeLauncher}
          serverBrowse={browseForServers}
          platform={Platform.OS === 'ios' ? 'AppleTV' : 'AndroidTV'}
          // This television announces itself on its own link, so a phone in the
          // room can sign it in without the server having to place the two by
          // their addresses. Null on a shell without the native module.
          lan={lanBeacon ?? undefined}
          deviceName={DEVICE_NAME}
        />
      </TvStage>
    </KitProvider>
  );
}
