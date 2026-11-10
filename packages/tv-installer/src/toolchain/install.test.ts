import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { download } from './install';

const lines: string[] = [];
const log = (line: string) => lines.push(line);

const folder = mkdtempSync(join(tmpdir(), 'kroma-download-'));
const dest = join(folder, 'tools.zip');

const body = (count: number) =>
  (async function* stream() {
    for (let index = 0; index < count; index++) yield new Uint8Array(10);
  })();

const sha256 = (bytes: number) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');

const asked: unknown[] = [];
const answering = (response: unknown) =>
  vi.stubGlobal('fetch', async (_url: string, init: unknown) => {
    asked.push(init);
    return response;
  });

afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('download', () => {
  beforeEach(() => {
    asked.length = 0;
    lines.length = 0;
    rmSync(dest, { force: true });
  });

  it('writes every chunk the server sent', async () => {
    answering({ ok: true, body: body(3), headers: new Headers({ 'content-length': '30' }) });

    await download('https://dl.google.com/platform-tools.zip', dest, log);

    expect(readFileSync(dest)).toHaveLength(30);
  });

  it('reports how far the download has got, in tens', async () => {
    answering({ ok: true, body: body(10), headers: new Headers({ 'content-length': '100' }) });

    await download('https://dl.google.com/platform-tools.zip', dest, log);

    expect(lines).toEqual([
      '  10% of 0 MB',
      '  20% of 0 MB',
      '  30% of 0 MB',
      '  40% of 0 MB',
      '  50% of 0 MB',
      '  60% of 0 MB',
      '  70% of 0 MB',
      '  80% of 0 MB',
      '  90% of 0 MB',
      '  100% of 0 MB',
    ]);
  });

  it('says nothing about progress when the server named no length', async () => {
    answering({ ok: true, body: body(3), headers: new Headers() });

    await download('https://dl.google.com/platform-tools.zip', dest, log);

    expect(lines).toEqual([]);
  });

  it('refuses a URL the server would not serve', async () => {
    answering({ ok: false, status: 404, body: null, headers: new Headers() });

    await expect(download('https://dl.google.com/gone.zip', dest, log)).rejects.toThrow(
      'GET https://dl.google.com/gone.zip answered 404',
    );
  });

  it('refuses a redirect for a file nothing pins', async () => {
    answering({ ok: true, body: body(1), headers: new Headers() });

    await download('https://dl.google.com/platform-tools.zip', dest, log);

    expect(asked[0]).toEqual({ redirect: 'error' });
  });

  it('follows a redirect to a file whose size and digest are pinned', async () => {
    answering({ ok: true, body: body(3), headers: new Headers() });

    await download('https://github.com/kroma.wgt', dest, log, { sha256: sha256(30), size: 30 });

    expect(asked[0]).toEqual({ redirect: 'follow' });
    expect(readFileSync(dest)).toHaveLength(30);
  });

  it('measures a pinned download against the size its release lists', async () => {
    answering({ ok: true, body: body(10), headers: new Headers() });

    await download('https://github.com/kroma.wgt', dest, log, { sha256: sha256(100), size: 100 });

    expect(lines.at(-1)).toBe('  100% of 0 MB');
  });

  it.each([
    {
      served: 'bytes that do not hash to the pinned digest',
      chunks: 3,
      sha256: sha256(31),
      refusal: 'did not serve the file its release lists',
    },
    {
      served: 'a file shorter than its release lists',
      chunks: 2,
      sha256: sha256(20),
      refusal: 'did not serve the file its release lists',
    },
    {
      served: 'a file that runs past the size its release lists',
      chunks: 5,
      sha256: sha256(30),
      refusal: 'serves more than it lists',
    },
  ])('deletes and refuses $served', async ({ chunks, sha256: pinned, refusal }) => {
    answering({ ok: true, body: body(chunks), headers: new Headers() });

    const fetched = download('https://github.com/kroma.wgt', dest, log, {
      sha256: pinned,
      size: 30,
    });

    await expect(fetched).rejects.toThrow(refusal);
    expect(existsSync(dest)).toBe(false);
  });
});
