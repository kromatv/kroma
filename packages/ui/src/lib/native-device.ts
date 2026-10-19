import { Platform } from 'react-native';

/** The hardware this app runs on, as a User-Agent would name it. */
export interface NativeDevice {
  model: string;
  os: string;
}

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
  return null;
}
