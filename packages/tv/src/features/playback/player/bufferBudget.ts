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

/** The buffer bounds to hand expo-video's `bufferOptions`, or null where the
 * platform is left to decide for itself. */
export function nativeBufferBudget(): NativeBufferBudget | null {
  if (Platform.OS !== 'android') return null;
  return {
    preferredForwardBufferDuration: FORWARD_BUFFER_SEC,
    maxBufferBytes: MAX_BUFFER_BYTES,
  };
}
