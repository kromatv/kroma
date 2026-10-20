import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Commit } from './commits';
import { newestWritten } from './release-folder';
import { root } from './root';

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 4000;

const PullRequest = z.object({ title: z.string(), body: z.string().nullable() });
const Drafted = z.object({ en: z.string(), fr: z.string() });
const Canary = z.object({ notes: z.string() });

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });

function pullRequest(pr: number): string {
  try {
    const raw = run('gh', ['pr', 'view', String(pr), '--json', 'title,body']);
    const { title, body } = PullRequest.parse(JSON.parse(raw));
    return `PR #${pr}: ${title}\n${(body ?? '').slice(0, MAX_BODY)}`;
  } catch {
    return `PR #${pr}: (not readable)`;
  }
}

function subject(c: Commit): string {
  const scope = c.scope ? `(${c.scope})` : '';
  return `${c.type}${scope}${c.breaking ? '!' : ''}: ${c.text}`;
}

function changes(commits: readonly Commit[]): string {
  return commits
    .map((c) => (c.pr ? `${subject(c)}\n${pullRequest(c.pr)}` : subject(c)))
    .join('\n\n---\n\n');
}

const read = (path: string) => readFileSync(join(root, path), 'utf8');

function previousNotes(): string[] {
  const written = newestWritten();
  return written ? [read(`releases/${written}/en.md`), read(`releases/${written}/fr.md`)] : [];
}

function client(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

async function ask<T extends z.ZodType>(
  anthropic: Anthropic,
  system: string,
  task: string,
  schema: T,
  maxTokens: number,
): Promise<z.infer<T> | null> {
  try {
    return await parse(anthropic, system, task, schema, maxTokens);
  } catch (error) {
    if (!(error instanceof Anthropic.AnthropicError)) throw error;
    console.warn(`::warning::the model did not answer (${error.message}); using the plain list`);
    return null;
  }
}

async function parse<T extends z.ZodType>(
  anthropic: Anthropic,
  system: string,
  task: string,
  schema: T,
  maxTokens: number,
): Promise<z.infer<T> | null> {
  const response = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: task }],
  });
  if (response.stop_reason !== 'end_turn') {
    console.warn(`::warning::the model stopped on ${response.stop_reason}; using the plain list`);
    return null;
  }
  return response.parsed_output ?? null;
}

/** The English and French notes for `version`, or null when no model answered. */
export function draftRelease(version: string, commits: readonly Commit[]) {
  const anthropic = client();
  if (!anthropic) return Promise.resolve(null);
  const system = [
    read('.claude/skills/release-notes/SKILL.md'),
    read('docs/release-notes.md'),
    'Previous notes, for the voice:',
    ...previousNotes(),
  ].join('\n\n====\n\n');
  const task = [
    `Write the release notes for KROMA ${version}: en.md and fr.md, following the rules above.`,
    'Leave out images. Write French from the intent, never as a translation of the English.',
    'Every line traces to a change below. Answer with the two files only.',
    '',
    changes(commits),
  ].join('\n');
  return ask(anthropic, system, task, Drafted, 16_000);
}

/**
 * Three to five lines on what a tester of this canary build should look at,
 * from the reviewed squash titles alone: the body is published unread, so no
 * PR body reaches it.
 */
export async function draftCanary(commits: readonly Commit[]): Promise<string | null> {
  const anthropic = client();
  if (!anthropic) return null;
  const system = [
    'You write the notes of a KROMA canary build: a rolling build of main that testers install.',
    'Three to five Markdown bullets, English, each naming what a tester can now try or check, in',
    "the reader's words. Leave out CI, tooling and refactors nobody can see. No links.",
  ].join(' ');
  const answer = await ask(anthropic, system, commits.map(subject).join('\n'), Canary, 8_000);
  return answer?.notes ?? null;
}
