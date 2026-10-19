import { beforeEach, describe, expect, it } from 'vitest';
import { isImageReady, markImageReady, resetImageReady } from './image-ready';
import { createPrefetchQueue } from './prefetch-queue';

function deferredPrefetch() {
  const started: string[] = [];
  const finish = new Map<string, (ok: boolean) => void>();
  const prefetch = (uri: string) =>
    new Promise<boolean>((resolve) => {
      started.push(uri);
      finish.set(uri, resolve);
    });
  return { started, finish, prefetch };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createPrefetchQueue', () => {
  beforeEach(() => resetImageReady());

  it('starts no more fetches than its concurrency allows', () => {
    const { started, prefetch } = deferredPrefetch();
    const queue = createPrefetchQueue({ prefetch, concurrency: 2 });

    queue.want(['/a', '/b', '/c']);

    expect(started).toEqual(['/a', '/b']);
  });

  it('starts the next wanted image when one finishes and marks the finished one ready', async () => {
    const { started, finish, prefetch } = deferredPrefetch();
    const queue = createPrefetchQueue({ prefetch, concurrency: 1 });

    queue.want(['/a', '/b']);
    finish.get('/a')?.(true);
    await flush();

    expect(isImageReady('/a')).toBe(true);
    expect(started).toEqual(['/a', '/b']);
  });

  it('skips images that are already ready', () => {
    const { started, prefetch } = deferredPrefetch();
    const queue = createPrefetchQueue({ prefetch, concurrency: 2 });
    markImageReady('/a');

    queue.want(['/a', '/b']);

    expect(started).toEqual(['/b']);
  });

  it('drops images that stopped being wanted before they started', async () => {
    const { started, finish, prefetch } = deferredPrefetch();
    const queue = createPrefetchQueue({ prefetch, concurrency: 1 });

    queue.want(['/a', '/b', '/c']);
    queue.want(['/d']);
    finish.get('/a')?.(true);
    await flush();

    expect(started).toEqual(['/a', '/d']);
  });

  it('does not mark an image ready when its fetch fails', async () => {
    const { finish, prefetch } = deferredPrefetch();
    const queue = createPrefetchQueue({ prefetch, concurrency: 1 });

    queue.want(['/a']);
    finish.get('/a')?.(false);
    await flush();

    expect(isImageReady('/a')).toBe(false);
  });

  it('waits for the scheduler before it starts anything', () => {
    const { started, prefetch } = deferredPrefetch();
    const steps: (() => void)[] = [];
    const queue = createPrefetchQueue({
      prefetch,
      concurrency: 2,
      schedule: (run) => steps.push(run),
    });

    queue.want(['/a']);
    expect(started).toEqual([]);
    steps.shift()?.();

    expect(started).toEqual(['/a']);
  });
});
