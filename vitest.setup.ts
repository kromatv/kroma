// Unmount whatever a test rendered, after every test.
//
// @testing-library installs this itself when the runner exposes globals; this
// project does not, so without this every `render`/`renderHook` in a file
// stays mounted for the whole file, with its effects still running - quietly
// inflating the call counts of later, unrelated tests in the same file.

import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// `waitFor` defaults to giving up after 1000ms, which is a wall-clock budget on
// a machine whose speed the test cannot see. Under `test:coverage` the istanbul
// transform slows every render, and a CI runner is slower again: a settings-row
// test that takes ~200ms here took 1069ms there and failed on the 69ms, which
// failed the whole Sonar scan and with it the coverage upload. Raising the
// ceiling costs a passing test nothing, because `waitFor` polls and returns the
// moment its condition holds; it only buys a loaded machine room to finish.
configure({ asyncUtilTimeout: 5000 });

// `__DEV__` is a React Native global that Metro's transform defines. Anything
// reaching `expo-modules-core` under this runner hits a bare reference to it
// and dies at import time, before a single test runs. `false` because the one
// thing it guards is a warning this runner doesn't need to hear.
(globalThis as { __DEV__?: boolean }).__DEV__ ??= false;

// Node 26 defines `localStorage` and `sessionStorage` globals of its own, and
// they are unavailable without `--localstorage-file`: reading one warns and
// answers `undefined`. In vitest's jsdom environment `window IS globalThis`, so
// Node's accessors already hold both names and jsdom never installs its own
// Storage over them. A test then reads `undefined` and the first
// `localStorage.clear()` throws before it has run a line.
//
// Both slots are `configurable`, so a working store goes in. In memory and per
// worker, which is what a test wants anyway; a runtime that already has a usable
// one (CI's Node 22) keeps it.
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  } as Storage;
}

// Only where a DOM is expected. The `node` environment is where the native
// tests run, and one of them asserts a device with no store at all: handing it
// one would make it pass for the wrong reason.
const hasDom = typeof document !== 'undefined';

for (const name of hasDom ? (['localStorage', 'sessionStorage'] as const) : []) {
  let usable = false;
  try {
    usable = Boolean((globalThis as Record<string, unknown>)[name]);
  } catch {
    usable = false;
  }
  if (usable) continue;
  try {
    Object.defineProperty(globalThis, name, {
      value: memoryStorage(),
      configurable: true,
      writable: true,
    });
  } catch {
    // A runtime that refuses the redefinition keeps whatever it had.
  }
}

afterEach(() => {
  cleanup();
});
