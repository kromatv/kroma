// Expo stamps the native package once; every consumer reads this same immutable value.
import { clientBuildFor, resolveBuildInfo } from '@kromatv/tv/build-info';
import Constants from 'expo-constants';

const info = resolveBuildInfo(Constants.expoConfig?.extra?.buildInfo ?? {});
export function buildInfo() {
  return info;
}
export const CLIENT_BUILD = clientBuildFor(info);
