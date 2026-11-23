import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { perfCommand } from './perf';

let dir: string;
const asked: string[] = [];

function serverAnswering(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url);
      return new Response(body, { status });
    }),
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-perf-'));
  asked.length = 0;
  vi.stubEnv('KROMA_TOKEN', 'tok');
  vi.stubEnv('KROMA_SERVER', 'http://server.test:4040/');
  vi.stubEnv('KROMA_CLI_CONFIG', join(dir, 'none.json'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('perfCommand', () => {
  it('writes the export of the period it was asked for', async () => {
    serverAnswering(200, '{"type":"meta"}\n');
    const out = join(dir, 'perf.jsonl');

    const code = await perfCommand({ window: '7d', out });

    expect(code).toBe(0);
    expect(asked).toEqual([
      'http://server.test:4040/api/admin/performance/export?window=7d&format=jsonl',
    ]);
    expect(readFileSync(out, 'utf8')).toBe('{"type":"meta"}\n');
  });

  it('refuses a period the server does not keep', async () => {
    serverAnswering(200, '');

    await expect(perfCommand({ window: '2d' })).rejects.toThrow('--window takes one of');
  });

  it('says what the server answered when it refuses', async () => {
    serverAnswering(403, 'permission denied');

    await expect(perfCommand({ format: 'md', out: join(dir, 'x.md') })).rejects.toThrow(
      'export failed (403): permission denied',
    );
  });
});
