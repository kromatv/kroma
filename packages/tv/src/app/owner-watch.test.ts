import { fakeClient } from '@kromatv/client/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askServerOwner, type ServerOwner, watchServerOwner } from './owner-watch';
import { EMPTY_SERVER, OWNED_SERVER, unreachable } from './providers/server-owner.fixture';

const EVERY_MS = 1000;

const noop = () => undefined;
const silent = (opts?: { signal?: AbortSignal }) =>
  new Promise<typeof EMPTY_SERVER>((_resolve, reject) => {
    opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

function watching(ask: () => Promise<ServerOwner>) {
  const answers: ServerOwner[] = [];
  const watch = watchServerOwner({
    ask,
    onAnswer: (owner) => answers.push(owner),
    everyMs: EVERY_MS,
  });
  return { answers, watch };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('askServerOwner', () => {
  it('reads a server with no account as missing its owner', async () => {
    const client = fakeClient({ accounts: { config: () => Promise.resolve(EMPTY_SERVER) } });

    const owner = await askServerOwner(client);

    expect(owner).toBe('missing');
  });

  it('reads a server with an account as owned', async () => {
    const client = fakeClient({ accounts: { config: () => Promise.resolve(OWNED_SERVER) } });

    const owner = await askServerOwner(client);

    expect(owner).toBe('present');
  });

  it('never reads a server that cannot be reached as an empty server', async () => {
    const client = fakeClient({ accounts: { config: unreachable } });

    const owner = await askServerOwner(client);

    expect(owner).toBe('unknown');
  });

  it('gives up on a server that stays silent, and cuts the request short', async () => {
    const client = fakeClient({ accounts: { config: silent } });

    const owner = askServerOwner(client);
    await vi.advanceTimersByTimeAsync(4000);

    await expect(owner).resolves.toBe('unknown');
  });
});

describe('watchServerOwner', () => {
  it('asks at once, then at every interval while the server has no account', async () => {
    const { answers, watch } = watching(() => Promise.resolve('missing'));

    await vi.advanceTimersByTimeAsync(2 * EVERY_MS);
    watch.stop();

    expect(answers).toEqual(['missing', 'missing', 'missing']);
  });

  it('stops asking once the server reports an account', async () => {
    const ask = vi
      .fn<() => Promise<ServerOwner>>()
      .mockResolvedValueOnce('missing')
      .mockResolvedValue('present');
    const { answers } = watching(ask);

    await vi.advanceTimersByTimeAsync(5 * EVERY_MS);

    expect(answers).toEqual(['missing', 'present']);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('keeps asking a server that does not answer', async () => {
    const ask = vi
      .fn<() => Promise<ServerOwner>>()
      .mockResolvedValueOnce('unknown')
      .mockResolvedValue('missing');
    const { answers, watch } = watching(ask);

    await vi.advanceTimersByTimeAsync(EVERY_MS);
    watch.stop();

    expect(answers).toEqual(['unknown', 'missing']);
  });

  it('asks now when it is told to, without waiting for the interval', async () => {
    const ask = vi.fn<() => Promise<ServerOwner>>().mockResolvedValue('missing');
    const { watch } = watching(ask);
    await vi.advanceTimersByTimeAsync(0);

    watch.recheck();
    await vi.advanceTimersByTimeAsync(0);
    watch.stop();

    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('does not ask a second time while an answer is on its way', () => {
    const ask = vi.fn(() => new Promise<ServerOwner>(noop));
    const { watch } = watching(ask);

    watch.recheck();
    watch.recheck();

    expect(ask).toHaveBeenCalledOnce();
  });

  it('reports nothing once it is stopped, even when an answer was on its way', async () => {
    const { answers, watch } = watching(() => Promise.resolve('missing'));

    watch.stop();
    await vi.advanceTimersByTimeAsync(3 * EVERY_MS);

    expect(answers).toEqual([]);
  });
});
