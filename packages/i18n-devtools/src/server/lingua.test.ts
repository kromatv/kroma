// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setEngine } from '../engine/engine';
import { testChannel, testEngine } from '../testing';
import { openChannel } from './host';
import { linguaLink, openInLingua, useLingua } from './lingua';

const LINGUA = { url: 'https://lingua.kroma.tv', project: 'kromatv/kroma' };

function serving(writable: boolean) {
  const server = testChannel();
  openChannel(server.channel);
  setEngine(testEngine({ writable }));
  return server;
}

afterEach(() => {
  vi.useRealTimers();
  setEngine(null);
  openChannel(null);
  vi.restoreAllMocks();
});

describe('the Lingua page of a message', () => {
  it('names the project, the rendered locale and the key', () => {
    expect(linguaLink(LINGUA, { scope: null, locale: 'fr', key: 'admin.aiAddProvider' })).toBe(
      'https://lingua.kroma.tv/go/kromatv/kroma/fr/admin.aiAddProvider',
    );
  });

  it('escapes what a path segment cannot carry', () => {
    expect(linguaLink(LINGUA, { scope: null, locale: 'pt-BR', key: 'a/b c' })).toBe(
      'https://lingua.kroma.tv/go/kromatv/kroma/pt-BR/a%2Fb%20c',
    );
  });

  it('is none for a module message', () => {
    expect(linguaLink(LINGUA, { scope: 'tv.kroma.torrents', locale: 'fr', key: 'title' })).toBeNull();
  });

  it('is none where the repository has no Lingua', () => {
    expect(linguaLink(null, { scope: null, locale: 'fr', key: 'nav.home' })).toBeNull();
  });

  it('opens in a new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openInLingua(LINGUA, { scope: null, locale: 'fr', key: 'nav.home' });

    expect(open).toHaveBeenCalledWith(
      'https://lingua.kroma.tv/go/kromatv/kroma/fr/nav.home',
      '_blank',
      'noopener',
    );
  });

  it('opens nothing where there is no page', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openInLingua(null, { scope: null, locale: 'fr', key: 'nav.home' });

    expect(open).not.toHaveBeenCalled();
  });
});

describe('where the repository translates', () => {
  it('is what the dev server answers', async () => {
    const server = serving(true);
    const { result } = renderHook(() => useLingua(true));

    await act(async () => {
      server.answer('kroma:i18n:lingua', { lingua: LINGUA });
      await Promise.resolve();
    });

    expect(result.current).toEqual(LINGUA);
  });

  it('is not asked of a dev server that does not know the catalogs', () => {
    const server = serving(false);

    const { result } = renderHook(() => useLingua(true));

    expect([result.current, server.sent]).toEqual([null, []]);
  });

  it('is not asked while nothing on the page is inspected', () => {
    const server = serving(true);

    renderHook(() => useLingua(false));

    expect(server.sent).toEqual([]);
  });

  it('is asked once however often inspecting starts again', () => {
    const server = serving(true);
    const { rerender } = renderHook(({ inspected }) => useLingua(inspected), {
      initialProps: { inspected: true },
    });

    rerender({ inspected: false });
    rerender({ inspected: true });

    expect(server.sent).toHaveLength(1);
  });

  it('is asked again once a dev server did not answer in time', async () => {
    vi.useFakeTimers();
    const server = serving(true);
    const { rerender } = renderHook(({ inspected }) => useLingua(inspected), {
      initialProps: { inspected: true },
    });
    await act(() => vi.advanceTimersByTimeAsync(3000));

    rerender({ inspected: false });
    rerender({ inspected: true });

    expect(server.sent).toHaveLength(2);
  });
});
