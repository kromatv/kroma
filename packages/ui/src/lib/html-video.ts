import { Platform } from 'react-native';

/** `engines` where the page plays through an HTML `<video>` element, none where it cannot. */
export function htmlVideoEngines<T>(engines: readonly T[]): T[] {
  return Platform.OS === 'web' ? [...engines] : [];
}
