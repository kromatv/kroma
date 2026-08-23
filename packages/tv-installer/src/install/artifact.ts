import { existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { root } from '../root';
import { type LogLine, run } from '../run';
import type { Television } from '../television';

export type Source = 'local' | 'stable' | 'canary' | 'build';

export interface PackageKind {
  extension: string;
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
const DOWNLOAD_TIMEOUT_MS = 600_000;

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
  const candidates: Candidate[] = [];
  for (const pattern of kind.globs) {
    for (const path of new Bun.Glob(pattern).scanSync({ cwd: root, absolute: true })) {
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  return rankArtifacts(candidates, kind.preferred)[0] ?? null;
}

export function availableSources(kind: PackageKind, buildable: boolean): Source[] {
  const sources: Source[] = [];
  if (localArtifact(kind)) sources.push('local');
  if (Bun.which('gh')) sources.push('stable', 'canary');
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

async function fromRelease(from: ArtifactSource, source: Source, log: LogLine): Promise<string> {
  const { extension, pattern, runArtifact } = from.kind;
  if (!Bun.which('gh')) {
    throw new Error(
      `no ${extension} here and no gh to fetch one: gh run download -n ${runArtifact}`,
    );
  }

  const dir = join(DOWNLOADS, source, from.id);
  await mkdir(dir, { recursive: true });
  log(`pulling the ${source} ${extension} with gh`);

  const tag = source === 'canary' ? ['canary'] : [];
  const { code } = await run(
    ['gh', 'release', 'download', ...tag, '--pattern', pattern, '--dir', dir, '--clobber'],
    { log, cwd: root, timeoutMs: DOWNLOAD_TIMEOUT_MS },
  );
  const downloaded = existsSync(dir) ? newest(dir, from.kind) : null;
  if (code !== 0 || !downloaded) {
    throw new Error(`the ${source} release carries no ${pattern}`);
  }
  return downloaded;
}

function newest(dir: string, kind: PackageKind): string | null {
  const candidates = [
    ...new Bun.Glob(`*${kind.extension}`).scanSync({ cwd: dir, absolute: true }),
  ].map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }));
  return rankArtifacts(candidates, kind.preferred)[0] ?? null;
}
