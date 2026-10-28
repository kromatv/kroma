import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ask, type Call, client } from './claude';
import type { Commit } from './commits';
import { CANARY_SYSTEM, type PullRequestBrief, releaseSystem, releaseTask } from './notes-prompt';
import { newestWritten } from './release-folder';
import { root } from './root';

const MAX_BODY = 4000;
const MAX_FILES = 40;
const CATALOGS = 'packages/core/src/locales';

const PullRequest = z.object({
  title: z.string(),
  body: z.string().nullable(),
  files: z.array(z.object({ path: z.string() })).default([]),
});
const Drafted = z.object({
  en: z.string(),
  fr: z.string(),
  leftOut: z.array(z.string()),
  blockers: z.array(z.string()),
});
const Canary = z.object({ notes: z.string() });

/** The two notes, and what the writer says a reviewer should know. */
export type DraftedRelease = z.infer<typeof Drafted>;

const RELEASE: Call = {
  model: 'claude-opus-5-5',
  effort: 'high',
  maxTokens: 64_000,
  timeoutMs: 20 * 60_000,
};
const CANARY: Call = {
  model: 'claude-haiku-5-5',
  effort: 'low',
  maxTokens: 4_000,
  timeoutMs: 5 * 60_000,
};

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });

const read = (path: string) => readFileSync(join(root, path), 'utf8');

function subject(c: Commit): string {
  const scope = c.scope ? `(${c.scope})` : '';
  return `${c.type}${scope}${c.breaking ? '!' : ''}: ${c.text}`;
}

function brief(c: Commit): PullRequestBrief {
  if (!c.pr) return { subject: subject(c), pr: null };
  try {
    const raw = run('gh', ['pr', 'view', String(c.pr), '--json', 'title,body,files']);
    const pr = PullRequest.parse(JSON.parse(raw));
    return {
      subject: subject(c),
      pr: c.pr,
      title: pr.title,
      body: (pr.body ?? '').slice(0, MAX_BODY),
      files: pr.files.slice(0, MAX_FILES).map((f) => f.path),
    };
  } catch {
    console.warn(`::warning::PR #${c.pr} could not be read; the writer gets its subject alone`);
    return { subject: subject(c), pr: c.pr };
  }
}

function catalogs(lang: string) {
  const dir = join(CATALOGS, lang);
  return readdirSync(join(root, dir))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ lang, file, text: read(join(dir, file)) }));
}

function previousNotes() {
  const written = newestWritten();
  if (!written) return [];
  return ['en', 'fr'].map((lang) => ({ lang, text: read(`releases/${written}/${lang}.md`) }));
}

/** The English and French notes for `version`, or null when no model answered. */
export function draftRelease(version: string, commits: readonly Commit[]) {
  const anthropic = client();
  if (!anthropic) return Promise.resolve(null);
  const system = releaseSystem({
    skill: read('.claude/skills/release-notes/SKILL.md'),
    guide: read('docs/release-notes.md'),
    unslop: read('.claude/skills/unslop/SKILL.md'),
    previous: previousNotes(),
    catalogs: [...catalogs('en'), ...catalogs('fr')],
  });
  return ask(anthropic, RELEASE, system, releaseTask(version, commits.map(brief)), Drafted);
}

/**
 * Three to five lines on what a tester of this canary build should look at,
 * from the reviewed squash titles alone: the body is published unread, so no
 * PR body reaches it.
 */
export async function draftCanary(commits: readonly Commit[]): Promise<string | null> {
  const anthropic = client();
  if (!anthropic) return null;
  const answer = await ask(
    anthropic,
    CANARY,
    CANARY_SYSTEM,
    commits.map(subject).join('\n'),
    Canary,
  );
  return answer?.notes ?? null;
}
