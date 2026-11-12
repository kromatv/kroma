// What the platform player may hold while it plays.
//
// Media3's allocator takes its 64 KB segments from the JAVA heap, and its
// default ceiling is 2200 of them (about 137 MiB) against a growth limit that
// is 48 MB on the smaller Android TV boxes. Only the 50 second forward buffer
// bounds it, so a direct-played file reaches the limit long before the buffer
// is full and the loader dies with an OutOfMemoryError. AVFoundation buffers
// outside any such limit, so Apple keeps its own defaults.

import { Platform } from 'react-native';

const MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const FORWARD_BUFFER_SEC = 20;

export interface NativeBufferBudget {
  preferredForwardBufferDuration: number;
  maxBufferBytes: number;
}

const PLAYERS = {
  ios: { plane: 'AVPlayer', device: 'Apple TV' },
  android: { plane: 'media3', device: 'Android TV' },
  tizen: { plane: 'capi-media-player', device: 'Samsung TV' },
  webos: { plane: 'uMediaServer', device: 'LG TV' },
} as const;

type NativePlayerOs = keyof typeof PLAYERS;

type NativePlayer = (typeof PLAYERS)[NativePlayerOs];

function isNativePlayerOs(os: string): os is NativePlayerOs {
  return Object.hasOwn(PLAYERS, os);
}

/** The OS whose platform player plays natively: AVPlayer on `ios`, Media3 on
 * `android`, capi-media-player on `tizen`, uMediaServer on `webos`. */
export function nativePlayerOs(): NativePlayerOs {
  const os: string = Platform.OS;
  return isNativePlayerOs(os) ? os : 'android';
}

/** The platform player's name, as the stats panel and the logs spell it. */
export function nativePlayerPlane(): NativePlayer['plane'] {
  return PLAYERS[nativePlayerOs()].plane;
}

/** The buffer bounds to hand expo-video's `bufferOptions`, or null where the
 * platform is left to decide for itself. */
export function nativeBufferBudget(): NativeBufferBudget | null {
  if (Platform.OS !== 'android') return null;
  return {
    preferredForwardBufferDuration: FORWARD_BUFFER_SEC,
    maxBufferBytes: MAX_BUFFER_BYTES,
  };
}

/** The device a native build runs on, as the player names it to the server. */
export function nativePlayerDevice(): NativePlayer['device'] {
  return PLAYERS[nativePlayerOs()].device;
}
