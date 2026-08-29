// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSession, writeSession } from './session';

const KEY = 'kroma:i18n-devtools';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('the dev-tools session', () => {
  it('starts closed, with the panel where it has never been moved', () => {
    expect(readSession()).toEqual({ open: false, editor: null, x: null, y: null });
  });

  it('remembers a choice across a reload, which is what a hot reload is', () => {
    writeSession({ open: true, editor: 'zed', x: 40 });

    expect(readSession()).toMatchObject({ open: true, editor: 'zed', x: 40 });
  });

  it('merges a patch over what is stored rather than replacing it', () => {
    writeSession({ open: true, editor: 'zed' });
    writeSession({ x: 40, y: 60 });

    expect(readSession()).toMatchObject({ open: true, editor: 'zed', x: 40, y: 60 });
  });

  it('falls back to closed when the stored blob is not what it claims', () => {
    sessionStorage.setItem(KEY, '{"open":"yes"}');

    expect(readSession().open).toBe(false);
  });

  it('falls back to closed when the stored blob is not JSON at all', () => {
    sessionStorage.setItem(KEY, 'not json');

    expect(readSession().open).toBe(false);
  });

  it('ignores a blob too large to be its own', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ open: true, locale: 'x'.repeat(600) }));

    expect(readSession().open).toBe(false);
  });

  it('reads as closed where the platform has no session storage', () => {
    vi.stubGlobal('sessionStorage', undefined);

    expect(readSession()).toEqual({ open: false, editor: null, x: null, y: null });
  });

  it('still answers a patch where there is no session storage to keep it in', () => {
    vi.stubGlobal('sessionStorage', undefined);

    expect(writeSession({ open: true, editor: 'zed' })).toMatchObject({
      open: true,
      editor: 'zed',
    });
  });
});
