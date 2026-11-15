import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kromaI18nDevtools } from './index.ts';

const CATALOG_ASKS = [
  'kroma:i18n:message',
  'kroma:i18n:edit',
  'kroma:i18n:status',
  'kroma:i18n:confirm',
];

type Handler = (ask: unknown, client: { send: (event: string, data: unknown) => void }) => void;

function serving(plugin: Plugin) {
  const handlers = new Map<string, Handler>();
  const said: Array<{ event: string; data: unknown }> = [];
  const warned: string[] = [];
  const server = {
    environments: {
      client: { hot: { on: (event: string, run: Handler) => handlers.set(event, run) } },
    },
    config: { logger: { warn: (line: string) => warned.push(line) } },
    watcher: { on: () => {} },
  };
  (plugin.configureServer as (server: unknown) => void).call({} as never, server);
  const ask = (event: string, data: object) =>
    handlers.get(event)?.(data, {
      send: (name, answer) => said.push({ event: name, data: answer }),
    });
  return { handlers, said, warned, ask };
}

afterEach(() => {
  vi.doUnmock('./answer.ts');
  vi.resetModules();
});

describe('what the page may ask of the catalogs', () => {
  it('answers a KROMA app through what reads the workspace', async () => {
    vi.doMock('./answer.ts', () => ({
      answer: (event: string, ask: { at: number }) => ({ at: ask.at, heard: event }),
    }));
    const at = serving(kromaI18nDevtools({ adapter: 'kroma' }));

    at.ask('kroma:i18n:status', { at: 9, locale: 'en' });

    await vi.waitFor(() => expect(at.said).toHaveLength(1));
    expect(at.said[0]).toEqual({
      event: 'kroma:i18n:status',
      data: { at: 9, heard: 'kroma:i18n:status' },
    });
  });

  it('stays silent where there is nothing to answer under', async () => {
    const answer = vi.fn(() => null);
    vi.doMock('./answer.ts', () => ({ answer }));
    const at = serving(kromaI18nDevtools({ adapter: 'kroma' }));

    at.ask('kroma:i18n:edit', {});

    await vi.waitFor(() => expect(answer).toHaveBeenCalled());
    expect(at.said).toEqual([]);
  });

  it('warns instead of failing where the workspace cannot be read', async () => {
    vi.doMock('./answer.ts', () => ({
      answer: () => {
        throw new Error('no i18n.json');
      },
    }));
    const at = serving(kromaI18nDevtools({ adapter: 'kroma' }));

    at.ask('kroma:i18n:message', { at: 1 });

    await vi.waitFor(() => expect(at.warned).toHaveLength(1));
    expect(at.warned[0]).toContain('cannot reach the catalogs: Error: no i18n.json');
  });

  it('offers an app that speaks another engine none of it', () => {
    const at = serving(kromaI18nDevtools({ adapter: 'paraglide' }));

    expect(CATALOG_ASKS.filter((event) => at.handlers.has(event))).toEqual([]);
  });

  it('offers a KROMA app the editor, the status and the confirm', () => {
    const at = serving(kromaI18nDevtools({ adapter: 'kroma' }));

    expect(CATALOG_ASKS.filter((event) => at.handlers.has(event))).toEqual(CATALOG_ASKS);
  });
});
