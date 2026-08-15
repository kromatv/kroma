// @vitest-environment jsdom
//
// The ratchet, and the proof that turning it changed nothing visible.
//
// Every story view in the kit is rendered through react-native-web and counted.
// `budget.json` records what each view is allowed to cost and fails when a
// number moves in either direction - up because the DOM grew, down because a win
// is worth committing rather than left as slack. `paint/<story>.txt` records what
// each view LOOKS like, leaf by leaf (see paint.ts): a reduction that only
// removes redundant elements leaves those files byte-identical, so the commit
// itself shows fewer nodes and an unmoved design.
//
// Run `bun run kit:dom` for the worklist, `bun run kit:dom --write` to move both
// after a reduction.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { type Budget, budgetOf, drift, keyOf, serialize } from './budget';
import { digest, report, tree } from './report';
import { accessText, byStory, paintDrift, paintText } from './snapshot';
import { found, measureKit, mount, viewsOf } from './views';

// Resolved from the runner's root (the repo), which is the one path the test
// can be sure of: `import.meta.url` here is a Vite module id, not a file.
const AUDIT = resolve(process.cwd(), 'packages/ui/audit');
const BUDGET = join(AUDIT, 'budget.json');
const PAINT = join(AUDIT, 'paint');
const ACCESS = join(AUDIT, 'a11y');
const OUT = resolve(process.cwd(), 'packages/ui/.dom');

const only = (process.env.KROMA_DOM_ONLY ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const mode = process.env.KROMA_DOM ?? '';

afterEach(cleanup);

function readBudget(): Budget {
  return existsSync(BUDGET) ? (JSON.parse(readFileSync(BUDGET, 'utf8')) as Budget) : {};
}

function fileIn(dir: string, id: string): string {
  return join(dir, `${id}.txt`);
}

function readSnapshot(dir: string, id: string): string {
  const file = fileIn(dir, id);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function prune(dir: string, keep: ReadonlySet<string>): void {
  for (const name of readdirSync(dir)) {
    if (!keep.has(name)) rmSync(join(dir, name));
  }
}

function write(path: string, body: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, path), body);
}

function trees(): string {
  const out: string[] = [];
  for (const [file, story] of found()) {
    const named = `${story.name} ${story.id}`;
    if (only.length > 0 && !only.some((needle) => named.includes(needle))) continue;
    for (const [view] of viewsOf(story)) {
      out.push(`\n### ${story.name} / ${view}  (${file})\n`, tree(mount(story, view)));
      cleanup();
    }
  }
  return out.join('\n');
}

it('the kit costs no more DOM than it is budgeted, and looks exactly as it did', () => {
  const measured = measureKit(only);
  expect(measured.length).toBeGreaterThan(0);
  const stories = byStory(measured);

  if (mode === 'report') {
    write('report.md', report(measured));
    write('digest.txt', digest(measured));
    if (process.env.KROMA_DOM_TREE) write('tree.txt', trees());
  }

  if (mode === 'write') {
    const next = { ...(only.length > 0 ? readBudget() : {}), ...budgetOf(measured) };
    writeFileSync(BUDGET, serialize(next));
    mkdirSync(PAINT, { recursive: true });
    mkdirSync(ACCESS, { recursive: true });
    if (only.length === 0) {
      const keep = new Set([...stories.keys()].map((id) => `${id}.txt`));
      prune(PAINT, keep);
      prune(ACCESS, keep);
    }
    for (const [id, entries] of stories) {
      writeFileSync(fileIn(PAINT, id), paintText(entries));
      writeFileSync(fileIn(ACCESS, id), accessText(entries));
    }
    return;
  }

  const budget = readBudget();
  const measuredKeys = new Set(measured.map(keyOf));
  const scoped =
    only.length === 0
      ? budget
      : Object.fromEntries(Object.entries(budget).filter(([key]) => measuredKeys.has(key)));
  const moved = drift(measured, scoped).map((verdict) => verdict.line);
  const repainted = [...stories].flatMap(([id, entries]) =>
    paintDrift(id, readSnapshot(PAINT, id), paintText(entries)),
  );
  const reannounced = [...stories].flatMap(([id, entries]) =>
    paintDrift(id, readSnapshot(ACCESS, id), accessText(entries)),
  );
  expect([...moved, ...repainted, ...reannounced].join('\n')).toBe('');
}, 120_000);
