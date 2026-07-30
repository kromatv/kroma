// @vitest-environment jsdom
//
// The notice that explains why a LAN server is unreachable from the hosted
// shell. It is the only thing standing between a viewer and "the app is broken"
// - the two failing probes look exactly like "server not found" - so the rules
// about WHEN it appears are worth pinning down.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warnIfMixedContent } from './mixed-content';

const DISMISSED = 'kroma.tvweb.mixedContentDismissed';

// jsdom's `location` is read-only, so the protocol is swapped wholesale.
function servedOver(protocol: 'https:' | 'http:') {
  vi.stubGlobal('location', { ...globalThis.location, protocol });
}

// This runner has no `localStorage` at all (Node exposes it only behind
// --localstorage-file), so the store the module reads is supplied here. That
// also makes the denied-storage cases below straightforward to stage.
function storage(over: Partial<Storage> = {}) {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    ...over,
  });
  return map;
}

const notice = () => document.querySelector('[role="note"]');

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('warnIfMixedContent', () => {
  it('says nothing on an http origin, where plaintext is not blocked', () => {
    // A local `vite preview` is http, and a LAN server works fine from it.
    servedOver('http:');
    storage();
    warnIfMixedContent();
    expect(notice()).toBeNull();
  });

  it('explains the block on an https origin', () => {
    servedOver('https:');
    storage();
    warnIfMixedContent();
    const bar = notice();
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('home network');
  });

  it('stays away once dismissed', () => {
    servedOver('https:');
    storage().set(DISMISSED, '1');
    warnIfMixedContent();
    expect(notice()).toBeNull();
  });

  it('remembers the dismissal when the button is pressed', () => {
    servedOver('https:');
    const store = storage();
    warnIfMixedContent();
    document.querySelector('button')?.click();
    expect(notice()).toBeNull();
    expect(store.get(DISMISSED)).toBe('1');
  });

  // Private mode throws on read. Suppressing the notice would be the wrong way
  // to fail: the viewer would be left with a shell that finds no server and
  // says nothing about why.
  it('shows the notice when storage cannot be read', () => {
    servedOver('https:');
    storage({
      getItem: () => {
        throw new Error('denied');
      },
    });
    warnIfMixedContent();
    expect(notice()).not.toBeNull();
  });

  it('still dismisses when storage cannot be written', () => {
    servedOver('https:');
    storage({
      setItem: () => {
        throw new Error('denied');
      },
    });
    warnIfMixedContent();
    document.querySelector('button')?.click();
    // Gone from the page; it simply comes back on the next load.
    expect(notice()).toBeNull();
  });
});
