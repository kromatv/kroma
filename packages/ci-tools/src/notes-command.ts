import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setOutput, summary } from './actions';
import { NOTES } from './canary-command';
import { commitOf, commitsSince, heading } from './history';
import { draftCanary, draftRelease } from './notes-model';
import {
  fallbackCanary,
  fallbackNote,
  hasReleasable,
  type Lang,
  shapeProblem,
} from './notes-draft';
import { isHandWritten } from './release-folder';
import { root } from './root';

/** The marker the canary body ends with, naming the commit it was written for. */
export const CANARY_MARKER = 'kroma-canary-commit';

function usable(note: string | undefined, lang: Lang): string | null {
  if (!note) return null;
  const problem = shapeProblem(note, lang);
  if (problem) console.warn(`::warning::drafted ${lang}.md rejected: ${problem}`);
  return problem ? null : `${note.trimEnd()}\n`;
}

async function release(version: string | undefined, to: string, force: boolean): Promise<void> {
  const { last, commits, version: next } = heading(to, version);
  const target = version ?? (next !== last ? next : null);
  if (!target) throw new Error(`nothing releasable since v${last}`);
  if (isHandWritten(target) && !force) {
    throw new Error(`releases/${target} is hand-written; pass --force to replace it`);
  }
  const drafted = await draftRelease(target, commits);
  const folder = join(root, 'releases', target);
  mkdirSync(folder, { recursive: true });
  const sources: string[] = [];
  for (const lang of ['en', 'fr'] as const) {
    const written = usable(drafted?.[lang], lang);
    writeFileSync(join(folder, `${lang}.md`), written ?? fallbackNote(commits, lang));
    sources.push(`${lang}.md ${written ? 'by the model' : 'from the subjects'}`);
  }
  writeFileSync(join(folder, 'release.json'), `${JSON.stringify({ draft: true }, null, 2)}\n`);
  setOutput('version', target);
  summary(`Drafted releases/${target}: ${sources.join(', ')}.`);
}

async function canary(to: string, since: string | undefined, out: string): Promise<void> {
  const commits = commitsSince(since ?? `${to}~1`, to);
  const drafted = hasReleasable(commits) ? await draftCanary(commits) : null;
  const notes = (drafted ?? fallbackCanary(commits)).trimEnd();
  const sha = commitOf(to);
  writeFileSync(
    out,
    `${NOTES}\n\n## In the newest build\n\n${notes}\n\n<!-- ${CANARY_MARKER}: ${sha} -->\n`,
  );
  console.log(notes);
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      to: { type: 'string', default: 'HEAD' },
      canary: { type: 'string' },
      since: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  });
  if (values.canary) return canary(values.to, values.since, values.canary);
  return release(values.version, values.to, values.force);
}
