// The DOM worklist, written to packages/ui/.dom for `bun run kit:dom` to print.
//
// Not a gate. The absolute rules live in audit.test.tsx; this is the structure
// worklist, and structure is the one measurement that still carries real faults
// across the kit, so it is read and worked down rather than failed on. It is
// inert unless the CLI asks for it, so `bun run test` never pays for it.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { afterEach, it } from 'vitest';
import { digest, report, tree } from './report';
import { found, measureKit, mount, viewsOf } from './views';

const OUT = resolve(process.cwd(), 'packages/ui/.dom');

const only = (process.env.KROMA_DOM_ONLY ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const wanted = Boolean(process.env.KROMA_DOM);

afterEach(cleanup);

it.skipIf(!wanted)(
  'measures the kit and writes the worklist',
  () => {
    const measured = measureKit(only);

    if (existsSync(OUT)) rmSync(OUT, { recursive: true });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'report.md'), report(measured));
    writeFileSync(join(OUT, 'digest.txt'), digest(measured));

    if (!process.env.KROMA_DOM_TREE && only.length === 0) return;

    const trees: string[] = [];
    for (const [, story] of found()) {
      if (only.length > 0 && !only.some((name) => `${story.name} ${story.id}`.includes(name))) {
        continue;
      }
      for (const [view] of viewsOf(story)) {
        try {
          trees.push(`${story.id}/${view}\n${tree(mount(story, view))}`);
        } catch {
          // A view that no longer renders is already named in the report.
        }
        cleanup();
      }
    }
    writeFileSync(join(OUT, 'tree.txt'), trees.join('\n\n'));
  },
  300_000,
);
