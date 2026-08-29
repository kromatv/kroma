import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ask, type Channel, openChannel, refresh } from './host';

const sent: Array<{ event: string; data: { at: number } }> = [];
const heard = new Map<string, (answer: unknown) => void>();

const channel: Channel = {
  send: (event, data) => sent.push({ event, data: data as { at: number } }),
  on: (event, run) => heard.set(event, run),
};

function answer(event: string, data: object): void {
  heard.get(event)?.(data);
}

beforeEach(() => {
  sent.length = 0;
  heard.clear();
  vi.useFakeTimers();
  openChannel(channel);
});

afterEach(() => {
  vi.useRealTimers();
  openChannel(null);
});

describe('asking the dev server', () => {
  it('sends the question and answers with what comes back', async () => {
    const asked = ask('kroma:i18n:editors', {});

    answer('kroma:i18n:editors', { at: sent[0]?.data.at, editors: [{ id: 'zed', name: 'Zed' }] });

    expect(await asked).toMatchObject({ editors: [{ id: 'zed', name: 'Zed' }] });
  });

  it('carries the question through', () => {
    void ask('kroma:i18n:where', { url: '/src/who.tsx', line: 59 });

    expect(sent[0]).toMatchObject({
      event: 'kroma:i18n:where',
      data: { url: '/src/who.tsx', line: 59 },
    });
  });

  it('tells two questions apart', async () => {
    const first = ask('kroma:i18n:where', { url: '/a' });
    const second = ask('kroma:i18n:where', { url: '/b' });

    answer('kroma:i18n:where', { at: sent[1]?.data.at, line: 2 });
    answer('kroma:i18n:where', { at: sent[0]?.data.at, line: 1 });

    expect(await first).toMatchObject({ line: 1 });
    expect(await second).toMatchObject({ line: 2 });
  });

  it('ignores an answer to a question it is no longer waiting on', async () => {
    const asked = ask('kroma:i18n:open', { file: '/a' });
    const at = sent[0]?.data.at;

    answer('kroma:i18n:open', { at, opened: true });
    answer('kroma:i18n:open', { at, opened: false });

    expect(await asked).toMatchObject({ opened: true });
  });

  it('gives up rather than waiting forever on a server that never answers', async () => {
    const asked = ask('kroma:i18n:open', { file: '/a' });

    vi.runAllTimers();

    expect(await asked).toBeNull();
  });

  it('answers nothing where there is no dev server behind the page', async () => {
    openChannel(null);

    expect(await ask('kroma:i18n:editors', {})).toBeNull();
    expect(sent).toHaveLength(0);
  });
});

describe('asking for a fresh render', () => {
  it('asks the dev server, which is the only thing that can give one', () => {
    refresh();

    expect(sent.map(({ event }) => event)).toEqual(['kroma:i18n:refresh']);
  });

  it('asks nothing where there is no dev server to ask', () => {
    openChannel(null);

    refresh();

    expect(sent).toEqual([]);
  });
});

describe('a question already answered', () => {
  it('has nothing left for its own timeout to answer', async () => {
    const asked = ask('kroma:i18n:editors', {});
    const at = sent[0]?.data.at ?? 0;
    answer('kroma:i18n:editors', { at, editors: [] });
    await asked;

    vi.advanceTimersByTime(60_000);

    await expect(asked).resolves.toMatchObject({ editors: [] });
  });
});
