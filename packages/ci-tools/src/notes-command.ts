import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { summary } from './actions';
import { NOTES } from './canary-command';
import { commitsSince, lastStable } from './history';
import { nextVersion } from './next-version';
import { draftCanary, draftRelease } from './notes-model';
import {
  fallbackCanary,
  fallbackNote,
  hasReleasable,
  type Lang,
  shapeProblem,
} from './notes-draft';
import { root } from './root';

const Meta = z.object({ draft: z.boolean().optional() }).loose();

function isHandWritten(folder: string): boolean {
  const meta = join(folder, 'release.json');
  if (!existsSync(join(folder, 'en.md'))) return false;
  if (!existsSync(meta)) return true;
  try {
    return Meta.safeParse(JSON.parse(readFileSync(meta, 'utf8'))).data?.draft !== true;
  } catch {
    return true;
  }
}

function usable(note: string | undefined, lang: Lang): string | null {
  if (!note) return null;
  const problem = shapeProblem(note, lang);
  if (problem) console.warn(`::warning::drafted ${lang}.md rejected: ${problem}`);
  return problem ? null : `${note.trimEnd()}\n`;
}

async function release(version: string | undefined, to: string, force: boolean): Promise<void> {
  const last = lastStable(to, version);
  const commits = commitsSince(last ? `v${last}` : null, to);
  const target = version ?? (last ? nextVersion(last, commits) : null);
  if (!target) throw new Error(`nothing releasable since v${last}`);
  const folder = join(root, 'releases', target);
  if (isHandWritten(folder) && !force) {
    throw new Error(`releases/${target} is hand-written; pass --force to replace it`);
  }
  const drafted = await draftRelease(target, commits);
  mkdirSync(folder, { recursive: true });
  for (const lang of ['en', 'fr'] as const) {
    const note = usable(drafted?.[lang], lang) ?? fallbackNote(commits, lang);
    writeFileSync(join(folder, `${lang}.md`), note);
  }
  writeFileSync(join(folder, 'release.json'), `${JSON.stringify({ draft: true }, null, 2)}\n`);
  summary(`Drafted releases/${target} (${drafted ? 'written by the model' : 'subjects only'}).`);
}

async function canary(to: string, since: string | undefined, out: string): Promise<void> {
  const commits = commitsSince(since ?? `${to}~1`, to);
  const drafted = hasReleasable(commits) ? await draftCanary(commits) : null;
  const notes = (drafted ?? fallbackCanary(commits)).trimEnd();
  writeFileSync(out, `${NOTES}\n\n## In the newest build\n\n${notes}\n`);
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
