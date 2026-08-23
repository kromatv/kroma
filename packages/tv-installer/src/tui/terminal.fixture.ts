import { PassThrough } from 'node:stream';

const ESCAPE = '\x1b';
const ANSI = new RegExp(String.raw`${ESCAPE}\[[0-9;?]*[A-Za-z]`, 'g');
const ANSWER_MS = 250;

export const KEY = {
  up: `${ESCAPE}[A`,
  down: `${ESCAPE}[B`,
  space: ' ',
  enter: '\r',
  cancel: '\x03',
};

export interface Terminal {
  input: PassThrough;
  output: PassThrough;
  press(...keys: string[]): Promise<void>;
  settle(): Promise<void>;
  drawn(): string;
}

export function terminal(): Terminal {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

  return {
    input,
    output,
    async press(...keys) {
      for (const key of keys) {
        input.write(key);
        await settle();
      }
    },
    settle,
    drawn: () => chunks.join('').replaceAll(ANSI, ''),
  };
}

/** Fails rather than hangs when nothing answers. */
export async function within<TValue>(work: Promise<TValue>): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const impatience = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`nothing answered in ${ANSWER_MS}ms`)), ANSWER_MS);
  });
  try {
    return await Promise.race([work, impatience]);
  } finally {
    clearTimeout(timer);
  }
}
