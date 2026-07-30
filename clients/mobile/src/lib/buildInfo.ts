// This build's identity, gathered by app.config.js (see
// clients/expo-build/build-info.js) and read back from the Expo manifest —
// nothing here runs git or touches the filesystem. Git-derived fields are
// nullable when the build was made outside a checkout.

import { commitLabel as coreCommitLabel, repoLabel as coreRepoLabel } from '@kroma/core';
import Constants from 'expo-constants';

export interface BuildInfo {
  version: string;
  commit: string | null;
  commitFull: string | null;
  branch: string | null;
  dirty: boolean;
  buildDate: string | null;
  repository: string | null;
}

const extra = Constants.expoConfig?.extra?.buildInfo as Partial<BuildInfo> | undefined;

export const buildInfo: BuildInfo = {
  // `expo.version` is the fallback because it is present even in a manifest
  // written before this config existed (an over-the-air update, an old build).
  version: extra?.version ?? Constants.expoConfig?.version ?? '',
  commit: extra?.commit ?? null,
  commitFull: extra?.commitFull ?? null,
  branch: extra?.branch ?? null,
  dirty: extra?.dirty ?? false,
  buildDate: extra?.buildDate ?? null,
  repository: extra?.repository ?? null,
};

/** Thin bindings of the shared formatters to this build's own record. */
export const commitLabel = (info: BuildInfo = buildInfo): string | null =>
  coreCommitLabel(info.commit, info.dirty);

export const repoLabel = (info: BuildInfo = buildInfo): string | null =>
  coreRepoLabel(info.repository);
