// This build's own identity, as collected at bundle time.
//
// The values are gathered by app.config.js (see clients/expo-build/build-info.js)
// and travel into the app through the Expo manifest, so nothing here runs git or
// touches the filesystem - it only reads `extra.buildInfo` back out and gives it
// a type. Everything git-derived is nullable: a build made outside a checkout
// still ships, it just has less to say. The settings screen hides those rows.

import { commitLabel as coreCommitLabel, repoLabel as coreRepoLabel } from '@kroma/core';
import Constants from 'expo-constants';

export interface BuildInfo {
  /** This client's version, from its package.json (mirrors `expo.version`). */
  version: string;
  /** Short commit hash, or null when built outside a git checkout. */
  commit: string | null;
  /** Full commit hash. */
  commitFull: string | null;
  /** Git branch at build time. */
  branch: string | null;
  /** Whether the working tree had uncommitted changes when this was built. */
  dirty: boolean;
  /** ISO timestamp of the build (or of the dev server start, in development). */
  buildDate: string | null;
  /** Browsable https URL of the origin remote. */
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

/** This build's commit and repository, as they should be READ. Thin bindings of
 * the shared formatters to this shell's own record. */
export const commitLabel = (info: BuildInfo = buildInfo): string | null =>
  coreCommitLabel(info.commit, info.dirty);

export const repoLabel = (info: BuildInfo = buildInfo): string | null =>
  coreRepoLabel(info.repository);
