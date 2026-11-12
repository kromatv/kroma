import { Platform } from 'react-native';
import { z } from 'zod';

/** The hardware this app runs on, as a User-Agent would name it. */
export interface NativeDevice {
  model: string;
  os: string;
}

const TV_HOSTS: Readonly<Record<string, NativeDevice>> = {
  tizen: { model: 'Samsung TV', os: 'Tizen' },
  webos: { model: 'LG TV', os: 'webOS' },
};

const UNREPORTED = { Model: '', Release: '' };

const HostConstants = z
  .object({
    Model: z.string().trim().catch(UNREPORTED.Model),
    Release: z.string().trim().catch(UNREPORTED.Release),
  })
  .catch(UNREPORTED);

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
  const host = TV_HOSTS[Platform.OS];
  return host ? hostDevice(host) : null;
}

function hostDevice(host: NativeDevice): NativeDevice {
  const { Model, Release } = HostConstants.parse(Platform.constants);
  return { model: Model || host.model, os: `${host.os} ${Release}`.trim() };
}
