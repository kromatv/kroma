#!/usr/bin/env bun
// The kit's DOM audit, driven from one command.
//
//   bun run kit:dom                  the whole kit: what it costs, worst first
//   bun run kit:dom ListRow Field    those components, with their annotated trees
//   bun run kit:dom --write          move the baselines after a reduction
//   bun run kit:dom --help           the flags, in full
//
// A wrapper rather than a plain script because the rendering has to happen under
// the repo's own vitest config: it is the only place that knows `#ui/*`, the
// react-native -> react-native-web alias and the story plugins.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../../', import.meta.url).pathname;
const TEST = 'packages/ui/audit/dom-budget.test.tsx';
const OUT = join(ROOT, 'packages/ui/.dom');

const HELP = `kit:dom - what the kit costs the DOM, and the proof a reduction changed nothing.

  bun run kit:dom [component...] [flags]

A component is matched loosely against a story's name and its id, so \`listrow\`,
\`ListRow\` and \`list-row\` all reach the same one. Naming any component also
prints its annotated tree, which is what an iteration reads.

  --write     move budget.json, paint/ and a11y/ to what the kit measures now.
              Run it after a reduction and commit the result WITH the change:
              the diff is the evidence - fewer nodes, and not one paint line moved.
  --tree      the annotated tree, even for a whole-kit run.
  --smells    only the components carrying removable structure, worst first.
  --quiet     the totals alone, for a script reading this.
  --help      this.

In a tree, [paints] means the element draws or clips something, a layout list
(padding, width, flex-direction...) is what it contributes, and an empty [] is an
element that could go. The playbook is packages/ui/audit/README.md.`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('-')));
const only = args.filter((arg) => !arg.startsWith('-'));

const KNOWN = new Set(['--write', '--tree', '--smells', '--quiet', '--help', '-h']);
const unknown = [...flags].filter((flag) => !KNOWN.has(flag));

if (flags.has('--help') || flags.has('-h')) {
  console.log(HELP);
  process.exit(0);
}
if (unknown.length > 0) {
  console.error(`kit:dom: no such flag ${unknown.join(', ')}\n\n${HELP}`);
  process.exit(2);
}

const writing = flags.has('--write');
const quiet = flags.has('--quiet');
// Naming a component IS asking to look at it, so its tree comes with it.
const tree = flags.has('--tree') || (only.length > 0 && !writing);

// A story that prints a time must print the same one on every machine, or the
// paint snapshot records the developer's timezone.
const env = {
  ...process.env,
  TZ: 'UTC',
  LANG: 'en_US.UTF-8',
  KROMA_DOM: writing ? 'write' : 'report',
  KROMA_DOM_ONLY: only.join(','),
  ...(tree ? { KROMA_DOM_TREE: '1' } : {}),
};

// The runner by path, not by name: a bare command is looked up through PATH,
// which is one writable directory away from running something else entirely.
const VITEST = join(ROOT, 'node_modules', '.bin', 'vitest');

const run = spawnSync(VITEST, ['run', '--project', 'web', TEST, '--reporter=dot'], {
  cwd: ROOT,
  env,
  stdio: ['inherit', 'pipe', 'inherit'],
  encoding: 'utf8',
});

function read(name: string): string {
  const file = join(OUT, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

/** The `## Smells` section of the report, which is the worklist for one sitting. */
function smells(): string {
  const [, found = ''] = read('report.md').split('## Smells\n');
  return found.split('\n## ')[0]?.trim() ?? '';
}

function print(): void {
  if (quiet) {
    console.log(read('digest.txt').split('\n').slice(0, 3).join('\n'));
    return;
  }
  if (tree) console.log(read('tree.txt'));
  if (flags.has('--smells')) console.log(smells());
  console.log(read('digest.txt'));
  console.log('\nfull report: packages/ui/.dom/report.md');
  if (only.length === 0) {
    console.log('one component: bun run kit:dom <Name>   ·   every flag: --help');
  }
}

if (writing) console.log('Baselines rewritten. Commit them with the change they record.');
else print();

// The runner's own output is the failure message: which view moved, and how.
if (run.status !== 0) console.error(`\n${run.stdout ?? ''}`);

process.exit(run.status ?? 1);
