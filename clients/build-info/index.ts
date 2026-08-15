// Build metadata (commit, date, repo) collected in Node and baked into the bundle,
// since a TV or phone has no git and no filesystem to read at runtime.
//
// Loaded by an Expo `app.config.ts` via Node's own type stripping, not Expo's
// TypeScript path. Keep this file erasable-syntax-only: no enums, no namespaces,
// no parameter properties.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Every git-derived field is nullable: a build made outside a checkout still
 * ships, it just has less to say. */
export interface BuildInfo {
  version: string;
  commit: string | null;
  commitFull: string | null;
  branch: string | null;
  dirty: boolean;
  buildDate: string;
  repository: string | null;
}

function git(cmd: string, cwd: string): string | null {
  try {
    const out = execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * A git remote in any of its spellings, as an https URL a browser can open. Any
 * embedded credential is dropped: this string is shown on a settings screen and
 * handed to the system browser.
 */
export function browsableRemote(remote: string | null | undefined): string | null {
  if (!remote) return null;
  const cleaned = remote.trim().replace(/\.git$/, '');
  // scp-style, which is what `git clone git@…` writes and has no scheme.
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(cleaned);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  const scheme = /^(?:ssh|git|https?):\/\/(?:[^@/]+@)?(.+)$/.exec(cleaned);
  if (scheme) return `https://${scheme[1]}`;
  return null;
}

/**
 * The version the PRODUCT ships under: `KROMA_VERSION` if CI stamped one,
 * otherwise the repo's single source of truth (server/Cargo.toml). `null` when
 * neither is readable, leaving the caller's own package version to stand.
 */
export function productVersion(repoRoot: string): string | null {
  if (process.env.KROMA_VERSION) return process.env.KROMA_VERSION;
  try {
    const toml = fs.readFileSync(path.join(repoRoot, 'server', 'Cargo.toml'), 'utf8');
    return /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Collect the metadata for the client rooted at `projectRoot` (from an
 * app.config.ts, pass `__dirname`). A nullish `overrides.version` is ignored, so
 * a caller can pass one through unconditionally.
 */
function packageVersion(projectRoot: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

// Up from a client to the repo: every client is two levels down (clients/web,
// apps/kit, modules/<id>/ui is three, and lands on the repo either way because
// `productVersion` simply fails to read a Cargo.toml that is not there).
function repoRootOf(projectRoot: string): string {
  return path.resolve(projectRoot, '..', '..');
}

export function collectBuildInfo(
  projectRoot: string,
  overrides?: { version?: string | null },
): BuildInfo {
  return {
    // The PRODUCT's version, not the manifest's: releases move
    // `server/Cargo.toml` and nothing else, so a client that stamped its own
    // package.json advertised a number that had not moved in thirty releases.
    version:
      overrides?.version ??
      productVersion(repoRootOf(projectRoot)) ??
      packageVersion(projectRoot) ??
      '0.0.0',
    commit: git('rev-parse --short HEAD', projectRoot),
    commitFull: git('rev-parse HEAD', projectRoot),
    branch: git('rev-parse --abbrev-ref HEAD', projectRoot),
    dirty: Boolean(git('status --porcelain', projectRoot)),
    buildDate: new Date().toISOString(),
    repository: browsableRemote(git('config --get remote.origin.url', projectRoot)),
  };
}
