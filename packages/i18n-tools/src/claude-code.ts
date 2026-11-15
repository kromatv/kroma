import { spawn } from 'node:child_process';
import { z } from 'zod';
import { Answer, SYSTEM, task } from './translate-prompt.ts';
import type { Translator } from './translate.ts';

const TIMEOUT_MS = 10 * 60 * 1000;

// What `claude --print --output-format json` writes: one result object. With
// `--json-schema` the answer is in `structured_output`, already validated.
const Result = z.looseObject({
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: Answer.optional(),
});

// The CLI validates the schema itself and knows no dialect by URL, so the
// `$schema` pointer zod writes has to go.
function answerSchema(): object {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(Answer);
  return schema;
}

function run(args: readonly string[], prompt: string): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      fail(
        error.code === 'ENOENT'
          ? new Error('the `claude` command is not on this PATH: install Claude Code and sign in')
          : error,
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) done(out);
      else fail(new Error(`claude exited with ${code}: ${(err || out).trim().slice(0, 400)}`));
    });
    child.stdin.end(prompt);
  });
}

/**
 * A translator that asks Claude Code, headless, on whatever the `claude`
 * command is signed in with: a subscription login needs no API key. It runs
 * with no tools and none of the project's settings, so it only ever answers
 * the batch it is handed. An answer that is an error, or that does not fit the
 * schema, throws, so a batch is never half written.
 */
export function claudeCodeTranslator(model?: string): Translator {
  const args = [
    '--print',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(answerSchema()),
    '--system-prompt',
    SYSTEM,
    '--tools',
    '',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    ...(model === undefined ? [] : ['--model', model]),
  ];
  return async (request) => {
    const result = Result.parse(JSON.parse(await run(args, task(request))));
    if (result.is_error || !result.structured_output) {
      const said = result.result?.slice(0, 400) ?? 'no answer';
      throw new Error(`Claude Code did not translate this batch: ${said}`);
    }
    return Object.fromEntries(
      result.structured_output.translations.map(({ key, text }) => [key, text]),
    );
  };
}
