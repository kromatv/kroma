// Metro has no `define`, so the identity travels in Expo's `extra`. The Vite
// half of the pair is buildInfo.web.ts.

import Constants from 'expo-constants';
import type { BuildInfo } from './buildInfo.types';

const extra = Constants.expoConfig?.extra?.buildInfo as Partial<BuildInfo> | undefined;

export const BUILD: BuildInfo = {
  version: extra?.version ?? Constants.expoConfig?.version ?? '',
  commit: extra?.commit ?? null,
  commitFull: extra?.commitFull ?? null,
  branch: extra?.branch ?? null,
  dirty: extra?.dirty ?? false,
  buildDate: extra?.buildDate ?? null,
  repository: extra?.repository ?? null,
};
