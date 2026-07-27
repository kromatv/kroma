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
// CommonJS, not TypeScript: an Expo `app.config.js` requires it directly, and
// each client's `tsc --noEmit` runs with the React Native lib set, where
// `node:child_process` does not exist. The types live in index.d.ts.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** @typedef {object} BuildInfo
 *  @property {string} version           This client's version, from its package.json.
 *  @property {string|null} commit       Short commit hash, or null outside a checkout.
 *  @property {string|null} commitFull   Full commit hash.
 *  @property {string|null} branch       Branch at build time.
 *  @property {boolean} dirty            Whether the tree had uncommitted changes.
 *  @property {string} buildDate         ISO timestamp of the build.
 *  @property {string|null} repository   Browsable https URL of the origin remote.
 */

/** Run a git command in `cwd`, or answer null if git is missing / this is not a
 * checkout. stderr is swallowed so a tarball build stays quiet. */
function git(cmd, cwd) {
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
function browsableRemote(remote) {
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
 *
 * @param {string} repoRoot
 * @returns {string|null}
 */
function productVersion(repoRoot) {
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
 * @param {string} projectRoot
 * @param {{version?: string|null}} [overrides] `version` wins over the package's
 *   own when given - the TV clients report the product version (see
 *   `productVersion`), and a nullish value is ignored so the caller can pass one
 *   through unconditionally.
 * @returns {BuildInfo}
 */
function collectBuildInfo(projectRoot, overrides) {
  const pkg = require(path.join(projectRoot, 'package.json'));
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

module.exports = { browsableRemote, collectBuildInfo, productVersion };
