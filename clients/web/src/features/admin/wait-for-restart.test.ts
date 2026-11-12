import { describe, expect, it, vi } from 'vitest';
import { waitForRestart } from './wait-for-restart';

function answers(...replies: (string | Error)[]) {
  const read = vi.fn<() => Promise<string | undefined>>();
  for (const reply of replies) {
    if (reply instanceof Error) read.mockRejectedValueOnce(reply);
    else read.mockResolvedValueOnce(reply);
  }
  return read;
}

describe('waiting for the server to come back', () => {
  it('resolves as soon as a new process answers', async () => {
    const read = answers('new-boot');

    await waitForRestart(read, 'old-boot', { intervalMs: 0 });

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps asking while the old process still answers', async () => {
    const read = answers('old-boot', 'old-boot', 'new-boot');

    await waitForRestart(read, 'old-boot', { intervalMs: 0 });

    expect(read).toHaveBeenCalledTimes(3);
  });

  it('takes a server that cannot be reached for one still down', async () => {
    const read = answers(
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      'new-boot',
    );

    await waitForRestart(read, 'old-boot', { intervalMs: 0 });

    expect(read).toHaveBeenCalledTimes(3);
  });

  it('stops asking once the wait is abandoned', async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => {
      controller.abort(new Error('closed'));
      return 'old-boot';
    });

    const waiting = waitForRestart(read, 'old-boot', {
      intervalMs: 60_000,
      signal: controller.signal,
    });

    await expect(waiting).rejects.toThrow('closed');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
