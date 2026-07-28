// Which build this is: the commit it came from, when it was compiled, which
// repository it belongs to.
//
// Only the BUILD can know any of it - there is no git and no filesystem on a
// phone or a television - so it is collected once, in Node, and carried into the
// bundle. The two bundlers this repo uses take it by different roads, which is
// why this file knows about neither:
//
//   Metro / Expo   an `app.config.js` puts it in `extra.buildInfo`, and the app
//                  reads it back out of `Constants.expoConfig`.
//   Vite           a `define` bakes it in as `__KROMA_BUILD__` (the TV shells,
//                  the kit site). The web client wraps the same idea in a
//                  virtual module instead; see clients/web/build-info.ts.
//
// Every git field degrades to `null` rather than throwing, because a build from
// a source tarball (or a CI checkout with no `.git`) still has to produce an
// app. The consumer decides what to hide.
//
// This file is REQUIRED BY AN EXPO app.config.js, which Node loads as CommonJS.
// It stays erasable-syntax-only (no enums, no namespaces, no parameter
// properties) so Node's own type stripping can load it: Expo's TypeScript path
// is unavailable here (TS 7 ships no `transpileModule`, and Node 26 rejects the
// `transform` fallback), and plain stripping is what remains. `export`/`import`
// are fine - the resolver handles the interop - but new syntax is not.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Which build this is. Every git-derived field is nullable: a build made
 * outside a checkout still ships, it just has less to say. */
export interface BuildInfo {
  /** This client's version (its package.json, or the product version). */
  version: string;
  /** Short commit hash, or null when built outside a git checkout. */
  commit: string | null;
  /** Full commit hash. */
  commitFull: string | null;
  /** Git branch at build time. */
  branch: string | null;
  /** Whether the working tree had uncommitted changes when this was built. */
  dirty: boolean;
  /** ISO timestamp of the build (or of the dev-server start). */
  buildDate: string;
  /** Browsable https URL of the origin remote. */
  repository: string | null;
}

/** Run a git command in `cwd`, or answer null if git is missing / this is not a
 * checkout. stderr is swallowed so a tarball build stays quiet. */
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
 * A git remote in any of its spellings, as a URL a browser can open.
 *
 *   git@github.com:owner/repo.git      -> https://github.com/owner/repo
 *   ssh://git@github.com/owner/repo    -> https://github.com/owner/repo
 *   https://token@github.com/owner/repo -> https://github.com/owner/repo
 *
 * Any embedded credential is dropped: this string is shown on a settings screen
 * and handed to the system browser.
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
 * The version the PRODUCT ships under, which the TV clients report rather than
 * their own package version: CI stamps `KROMA_VERSION`, and otherwise it is read
 * from the repo's single source of truth (server/Cargo.toml), so a local build
 * reports the real version too. `null` when neither is readable, leaving the
 * caller's own package version to stand.
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
 * app.config.js, pass `__dirname`).
 *
 * `overrides.version` wins over the package's own when given - the TV clients
 * report the product version (see `productVersion`) - and a nullish value is
 * ignored so the caller can pass one through unconditionally.
 */
export function collectBuildInfo(
  projectRoot: string,
  overrides?: { version?: string | null },
): BuildInfo {
  // Read and parsed rather than `require`d: this module is ESM (see the note in
  // its package.json), and there is no `require` in an ES module.
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
    version?: string;
  };
  return {
    version: overrides?.version ?? pkg.version ?? '0.0.0',
    commit: git('rev-parse --short HEAD', projectRoot),
    commitFull: git('rev-parse HEAD', projectRoot),
    branch: git('rev-parse --abbrev-ref HEAD', projectRoot),
    dirty: Boolean(git('status --porcelain', projectRoot)),
    buildDate: new Date().toISOString(),
    repository: browsableRemote(git('config --get remote.origin.url', projectRoot)),
  };
}
