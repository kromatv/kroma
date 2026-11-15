import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changedFiles } from './changed-files';
import type { Event } from './event';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock('bun', () => ({ $: vi.fn() }));

const repo = () => ({ slug: 'kromatv/kroma', token: 'token' });
const push: Event = { kind: 'push', before: 'a'.repeat(40), after: 'b'.repeat(40) };
const pullRequest: Event = {
  kind: 'pull_request',
  number: 12,
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
};

const answers = (...replies: (Response | Error)[]) => {
  const fetch = vi.fn(async () => {
    const reply = replies.shift();
    if (reply === undefined) throw new Error('no more replies');
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

const compare = (...files: string[]) =>
  Response.json({ files: files.map((filename) => ({ filename })) });

const warnings = () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () =>
    log.mock.calls.map(([line]) => String(line)).filter((l) => l.startsWith('::warning'));
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('changedFiles', () => {
  it('lists the files a push changed', async () => {
    const fetch = answers(compare('server/src/main.rs'));

    const files = await changedFiles(push, repo, 'origin/main');

    expect(files).toEqual(['server/src/main.rs']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks again when GitHub answers 500, and lists what the next answer holds', async () => {
    const fetch = answers(new Response('', { status: 500 }), compare('docs/ci.md'));

    const files = await changedFiles(push, repo, 'origin/main');

    expect(files).toEqual(['docs/ci.md']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it('asks again when the request never reaches GitHub', async () => {
    const fetch = answers(new Error('socket hang up'), compare('bun.lock'));

    const files = await changedFiles(push, repo, 'origin/main');

    expect(files).toEqual(['bun.lock']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('opens every lane, with a warning, when GitHub keeps failing', async () => {
    const warned = warnings();
    const fetch = answers(
      new Response('', { status: 500 }),
      new Response('', { status: 502 }),
      new Response('', { status: 429 }),
      new Response('', { status: 500 }),
    );

    const files = await changedFiles(push, repo, 'origin/main');

    expect(files).toBe('all');
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(warned()).toEqual([expect.stringContaining('answered 500')]);
  });

  it('opens every lane without asking twice when GitHub refuses the request', async () => {
    const warned = warnings();
    const fetch = answers(new Response('', { status: 404 }));

    const files = await changedFiles(pullRequest, repo, 'origin/main');

    expect(files).toBe('all');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warned()).toEqual([expect.stringContaining('answered 404')]);
  });
});
