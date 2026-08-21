import type { Artifact, Run } from './github.ts';
import { classify, TARGET_IDS, TARGETS, type TargetId } from './targets.ts';

export interface CanaryFile {
  target: TargetId;
  label: string;
  contains: readonly string[];
  bytes: number;
  url: string;
}

export interface CanaryBuild {
  version: string | null;
  commit: { sha: string; short: string; title: string };
  run: { id: number; url: string; finishedAt: string };
  expiresAt: string | null;
  files: CanaryFile[];
}

export interface Canary {
  generatedAt: string;
  /** Newest first. Every entry still has its artifacts; an expired build is not listed. */
  builds: CanaryBuild[];
}

export const LIMIT = { default: 20, max: 50 } as const;

/** `?limit=`, clamped: the ceiling is what keeps one document from costing fifty calls. */
export function readLimit(raw: string | null): number {
  const asked = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(asked)) return LIMIT.default;
  return Math.min(Math.max(asked, 1), LIMIT.max);
}

/**
 * One run reduced to what it can hand over, or null when nothing of it survives.
 *
 * A run whose artifacts have all expired is dropped rather than listed empty: a
 * version a reader cannot install is not a build on offer.
 */
export function toBuild(
  run: Run,
  artifacts: readonly Artifact[],
  version: string | null,
  origin: string,
): CanaryBuild | null {
  const files: CanaryFile[] = [];
  for (const artifact of artifacts) {
    const target = classify(artifact.name);
    if (!target) continue;
    files.push({
      target,
      label: TARGETS[target].label,
      contains: TARGETS[target].contains,
      bytes: artifact.size_in_bytes,
      url: `${origin}/dl/${run.id}/${target}`,
    });
  }
  if (files.length === 0) return null;
  files.sort((a, b) => a.target.localeCompare(b.target));

  return {
    version,
    commit: { sha: run.head_sha, short: run.head_sha.slice(0, 7), title: run.display_title },
    run: { id: run.id, url: run.html_url, finishedAt: run.updated_at },
    expiresAt: artifacts.find((a) => a.expires_at)?.expires_at ?? null,
    files,
  };
}

export function artifactFor(
  artifacts: readonly Artifact[],
  target: TargetId,
): Artifact | undefined {
  return artifacts.find((a) => a.name === TARGETS[target].artifact);
}

// Compared against the list, not `in TARGETS`: `in` walks the prototype chain,
// so `/dl/constructor` would pass the guard and index the table with a function.
export const isTargetId = (value: string): value is TargetId =>
  (TARGET_IDS as readonly string[]).includes(value);

export function readRunId(raw: string): number | null {
  if (!/^\d{1,19}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
