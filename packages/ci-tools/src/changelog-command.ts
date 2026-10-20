import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setOutput } from './actions';
import { prependSection, renderSection } from './changelog';
import { heading } from './history';
import { root } from './root';

const CHANGELOG = join(root, 'CHANGELOG.md');

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
  const { last, commits, version: next } = heading(values.to, values.version);
  const version = values.version ?? (next !== last ? next : null);
  if (!version) throw new Error(`nothing releasable since v${last}`);
  const section = renderSection(version, values.date, commits);
  if (values.out) writeFileSync(values.out, `${section}\n`);
  if (values.write) {
    const current = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '';
    if (current.includes(`\n## ${version} (`))
      throw new Error(`CHANGELOG.md already has ${version}`);
    writeFileSync(CHANGELOG, prependSection(current, section));
  }
  setOutput('version', version);
  console.log(section);
}
