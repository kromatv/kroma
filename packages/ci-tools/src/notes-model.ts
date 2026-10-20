import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Commit } from './commits';
import { CANARY_SYSTEM, type PullRequestBrief, releaseSystem, releaseTask } from './notes-prompt';
import { newestWritten } from './release-folder';
import { root } from './root';

const MODEL = 'claude-opus-5-5';
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

interface Call {
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
}

const RELEASE: Call = { effort: 'high', maxTokens: 32_000, timeoutMs: 20 * 60_000 };
const CANARY: Call = { effort: 'low', maxTokens: 4_000, timeoutMs: 5 * 60_000 };

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

const hasToken = (file: string | undefined) =>
  !!file && existsSync(file) && statSync(file).size > 0;

function client(): Anthropic | null {
  const env = process.env;
  const federated = env.ANTHROPIC_FEDERATION_RULE_ID && hasToken(env.ANTHROPIC_IDENTITY_TOKEN_FILE);
  return env.ANTHROPIC_API_KEY || federated ? new Anthropic() : null;
}

async function ask<T extends z.ZodType>(
  anthropic: Anthropic,
  call: Call,
  system: string,
  task: string,
  schema: T,
): Promise<z.infer<T> | null> {
  try {
    const response = await anthropic.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: call.maxTokens,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: call.effort, format: betaZodOutputFormat(schema) },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: task }],
      },
      { timeout: call.timeoutMs },
    );
    if (response.stop_reason !== 'end_turn') {
      console.warn(`::warning::the model stopped on ${response.stop_reason}; using the plain list`);
      return null;
    }
    return response.parsed_output ?? null;
  } catch (error) {
    if (!(error instanceof Anthropic.AnthropicError)) throw error;
    console.warn(`::warning::the model did not answer (${error.message}); using the plain list`);
    return null;
  }
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
