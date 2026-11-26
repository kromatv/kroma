import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { tabIn } from './tab';

class FakePage extends EventEmitter {
  closed = false;

  constructor(readonly id: number) {
    super();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function fakeContext(): { pages: FakePage[]; newPage(): Promise<FakePage> } {
  const pages: FakePage[] = [];
  return {
    pages,
    newPage() {
      const page = new FakePage(pages.length);
      pages.push(page);
      return Promise.resolve(page);
    },
  };
}

function never(): Promise<number> {
  return new Promise<number>(() => undefined);
}

describe('a tab the sweep reads its screens in', () => {
  it('reads each screen in the same page while it answers', async () => {
    const context = fakeContext();
    const tab = await tabIn(context);

    const ids = [
      await tab((page) => Promise.resolve(page.id)),
      await tab((page) => Promise.resolve(page.id)),
    ];

    expect(ids).toEqual([0, 0]);
  });

  it('says the page crashed, and reads the next screen in a new one', async () => {
    const context = fakeContext();
    const tab = await tabIn(context);

    const crashed = tab((page) => {
      page.emit('crash');
      return never();
    });

    await expect(crashed).rejects.toThrow('the page crashed');
    expect(await tab((page) => Promise.resolve(page.id))).toBe(1);
    expect(context.pages[0]?.closed).toBe(true);
  });

  it('gives up on a page that stops answering, and reads the next screen in a new one', async () => {
    const context = fakeContext();
    const tab = await tabIn(context, 10);

    const stuck = tab(() => never());

    await expect(stuck).rejects.toThrow('the page did not answer in 0.01 s');
    expect(await tab((page) => Promise.resolve(page.id))).toBe(1);
  });

  it('keeps the page a read failed on by itself', async () => {
    const context = fakeContext();
    const tab = await tabIn(context);

    const failed = tab(() => Promise.reject(new Error('no such route')));

    await expect(failed).rejects.toThrow('no such route');
    expect(await tab((page) => Promise.resolve(page.id))).toBe(0);
  });
});
