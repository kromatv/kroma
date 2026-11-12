import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { root } from '../shared/root';
import type { LogLine } from '../shared/run';
import type { Television } from '../shared/television';
import { matchesWildcard, matchingPaths } from './matching-paths';
import { type Channel, fetchAsset, releaseAssets } from './release';

export type Source = 'local' | 'stable' | 'canary' | 'build';

export interface PackageKind {
  globs: readonly string[];
  pattern: string;
  runArtifact: string;
  preferred?: RegExp;
}

export interface ArtifactRequest {
  tv: Television;
  given?: string;
  source?: Source;
  log: LogLine;
}

export interface ArtifactSource {
  id: string;
  kind: PackageKind;
  build?: (log: LogLine) => Promise<string>;
}

const DOWNLOADS = join(homedir(), '.kroma', 'downloads');

export interface Candidate {
  path: string;
  mtimeMs: number;
}

/** Newest first, with the build `preferred` matches ahead of every other one. */
export function rankArtifacts(candidates: readonly Candidate[], preferred?: RegExp): string[] {
  const rank = (path: string) => Number(preferred?.test(basename(path)) ?? false);
  return [...candidates]
    .sort((a, b) => {
      const byKind = rank(b.path) - rank(a.path);
      if (byKind !== 0) return byKind;
      const byAge = b.mtimeMs - a.mtimeMs;
      return byAge !== 0 ? byAge : basename(b.path).localeCompare(basename(a.path));
    })
    .map((candidate) => candidate.path);
}

export function localArtifact(kind: PackageKind): string | null {
  const candidates = kind.globs
    .flatMap((pattern) => matchingPaths(root, pattern))
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }));
  return rankArtifacts(candidates, kind.preferred)[0] ?? null;
}

export function availableSources(kind: PackageKind, buildable: boolean): Source[] {
  const sources: Source[] = [];
  if (localArtifact(kind)) sources.push('local');
  sources.push('stable', 'canary');
  if (buildable) sources.push('build');
  return sources;
}

export async function resolveArtifact(
  from: ArtifactSource,
  { given, source, log }: ArtifactRequest,
): Promise<string> {
  if (given) return given;
  if (source === 'build' && from.build) return from.build(log);
  if (source === 'stable' || source === 'canary') return fromRelease(from, source, log);

  const local = localArtifact(from.kind);
  if (local) {
    const relative = local.replace(`${root}/`, '');
    log(`package: ${relative}`);
    return local;
  }
  return fromRelease(from, 'stable', log);
}

async function fromRelease(from: ArtifactSource, channel: Channel, log: LogLine): Promise<string> {
  const { pattern, preferred, runArtifact } = from.kind;
  const assets = (await releaseAssets(channel)).filter((asset) =>
    matchesWildcard(asset.name, pattern),
  );
  const [newest] = rankArtifacts(
    assets.map((asset) => ({ path: asset.name, mtimeMs: asset.updatedMs })),
    preferred,
  );
  const asset = assets.find((candidate) => candidate.name === newest);
  if (!asset) {
    throw new Error(
      `the ${channel} release carries no ${pattern}: gh run download -n ${runArtifact} takes one from a build`,
    );
  }

  log(`package: ${asset.name}, from the ${channel} release`);
  return fetchAsset(asset, join(DOWNLOADS, channel, from.id), log);
}
