// Which build the NATIVE kit app is — the Metro half of the pair.
//
// Metro has no `define`, so the identity travels in Expo's `extra` (collected by
// app.config.js) and comes back out of `Constants.expoConfig`. The Vite half
// reads a `define` instead; see buildInfo.web.ts, which the browser bundler
// takes in place of this file.

import Constants from 'expo-constants';
import type { BuildInfo } from './buildInfo.types';

const extra = Constants.expoConfig?.extra?.buildInfo as Partial<BuildInfo> | undefined;

export const BUILD: BuildInfo = {
  // `expo.version` is the fallback because it is in every manifest, including
  // one written before this config existed.
  version: extra?.version ?? Constants.expoConfig?.version ?? '',
  commit: extra?.commit ?? null,
  branch: extra?.branch ?? null,
  dirty: extra?.dirty ?? false,
  buildDate: extra?.buildDate ?? null,
  repository: extra?.repository ?? null,
};
