// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from './mount';

const HOST = '[data-kroma-devtool="i18n"]';

let stop = () => {};

function hosts(): number {
  return document.querySelectorAll(HOST).length;
}

afterEach(async () => {
  stop();
  await Promise.resolve();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('putting the tools on the page', () => {
  it('waits a task before taking a React root, so the shell claims the document first', () => {
    vi.useFakeTimers();

    stop = mount();

    expect(hosts()).toBe(1);
    expect(document.querySelector(HOST)?.childElementCount).toBe(0);
  });

  it('replaces the one already running rather than stacking a second', async () => {
    vi.useFakeTimers();
    const first = mount();

    stop = mount();
    await Promise.resolve();

    expect(hosts()).toBe(1);

    first();
  });

  it('takes its element back when disposed', async () => {
    vi.useFakeTimers();
    stop = mount();

    stop();
    await Promise.resolve();

    expect(hosts()).toBe(0);
  });
});
