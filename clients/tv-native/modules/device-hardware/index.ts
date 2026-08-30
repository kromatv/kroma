// JS face of the set's own CPU, memory and decoder limits, which a Hermes shell
// has no Web API to read. Optional so a build without the native module yields
// null rather than throwing.

import type { DecoderFrameLimits, FrameSize } from '@kroma/core';
import { type NativeModule, requireOptionalNativeModule } from 'expo';

declare class DeviceHardwareNativeModule extends NativeModule {
  cpuCores(): number;
  memoryBytes(): number;
  freeMemoryBytes(): number | null;
  decoderFrameLimits(): Record<string, FrameSize>;
}

const native = requireOptionalNativeModule<DeviceHardwareNativeModule>('DeviceHardware');

// Android names a decoder by MIME type; an item carries ffprobe's codec name.
// A type missing here is one no catalogue entry is ever tagged with.
const CODEC_OF_MIME: Record<string, string> = {
  'video/avc': 'h264',
  'video/hevc': 'hevc',
  'video/av01': 'av1',
  'video/x-vnd.on2.vp9': 'vp9',
  'video/x-vnd.on2.vp8': 'vp8',
  'video/mpeg2': 'mpeg2video',
  'video/mp4v-es': 'mpeg4',
};

export function cpuCores(): number | null {
  return native ? native.cpuCores() : null;
}

export function memoryBytes(): number | null {
  return native ? native.memoryBytes() : null;
}

export function freeMemoryBytes(): number | null {
  return native ? native.freeMemoryBytes() : null;
}

/** The largest frame each of this device's hardware decoders accepts, under the
 * codec names an item carries. Null where the platform declares none, which
 * gates nothing. */
export function decoderFrameLimits(): DecoderFrameLimits | null {
  const byMime = native?.decoderFrameLimits();
  if (!byMime) return null;
  const limits: Record<string, FrameSize> = {};
  for (const [mime, size] of Object.entries(byMime)) {
    const codec = CODEC_OF_MIME[mime.toLowerCase()];
    if (codec) limits[codec] = size;
  }
  return Object.keys(limits).length > 0 ? limits : null;
}
