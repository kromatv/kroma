import { Platform } from 'react-native';
import { z } from 'zod';

/** The hardware this app runs on, as a User-Agent would name it. */
export interface NativeDevice {
  model: string;
  os: string;
}

const UNKNOWN_TIZEN = { Model: 'Samsung TV', Release: '' };

const TizenConstants = z
  .object({
    Model: z.string().trim().min(1).catch(UNKNOWN_TIZEN.Model),
    Release: z.string().trim().catch(UNKNOWN_TIZEN.Release),
  })
  .catch(UNKNOWN_TIZEN);

/** The device a native shell runs on, or `null` in a browser, whose own User-Agent already names it. */
export function nativeDevice(): NativeDevice | null {
  if (Platform.OS === 'ios') {
    const { systemName, osVersion } = Platform.constants;
    return { model: Platform.isTV ? 'Apple TV' : 'Apple device', os: `${systemName} ${osVersion}` };
  }
  if (Platform.OS === 'android') {
    const { Model, Release, uiMode } = Platform.constants;
    return { model: Model, os: `Android${uiMode === 'tv' ? ' TV' : ''} ${Release}` };
  }
  const os: string = Platform.OS;
  if (os === 'tizen') return tizenDevice();
  return null;
}

function tizenDevice(): NativeDevice {
  const { Model, Release } = TizenConstants.parse(Platform.constants);
  return { model: Model, os: `Tizen ${Release}`.trim() };
}
