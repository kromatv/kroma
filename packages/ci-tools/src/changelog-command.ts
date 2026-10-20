import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setOutput } from './actions';
import { prependSection, renderSection } from './changelog';
import { commitsSince, lastStable } from './history';
import { nextVersion } from './next-version';
import { root } from './root';

const CHANGELOG = join(root, 'CHANGELOG.md');
const CARGO_TOML = join(root, 'server/Cargo.toml');
const PACKAGE_VERSION = /^(version\s*=\s*")[^"]+(")/m;

/** `server/Cargo.toml` with its package version set to `version`. */
export function stampCargo(toml: string, version: string): string {
  if (!PACKAGE_VERSION.test(toml)) throw new Error('server/Cargo.toml carries no version');
  return toml.replace(PACKAGE_VERSION, `$1${version}$2`);
}

export function main(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      to: { type: 'string', default: 'HEAD' },
      date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
      out: { type: 'string' },
      write: { type: 'boolean', default: false },
    },
  });
  const last = lastStable(values.to, values.version);
  const commits = commitsSince(last ? `v${last}` : null, values.to);
  const version = values.version ?? (last ? nextVersion(last, commits) : null);
  if (!version) throw new Error(`nothing releasable since v${last}`);
  const section = renderSection(version, values.date, commits);
  if (values.out) writeFileSync(values.out, `${section}\n`);
  if (values.write) {
    const current = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '';
    writeFileSync(CHANGELOG, prependSection(current, section));
    writeFileSync(CARGO_TOML, stampCargo(readFileSync(CARGO_TOML, 'utf8'), version));
  }
  setOutput('version', version);
  console.log(section);
}
