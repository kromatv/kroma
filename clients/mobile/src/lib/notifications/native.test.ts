// The guard that keeps a missing native module from taking the app down.
//
// `expo-notifications` calls `requireNativeModule()` at module scope, which
// THROWS when the module is not in the running binary - and that happens to any
// build made before the dependency was added (an installed dev client, a
// colleague's simulator, last week's TestFlight). Imported eagerly from the root
// layout, that throw is a dead app on launch rather than a disabled toggle.
//
// The runner is one of those environments: there is no native module here, so
// these tests exercise the absent branch for real rather than by mocking it. The
// present branch is the bare return value of a `require` that succeeded, and
// cannot be simulated in node - `vi.mock` does not intercept the CommonJS
// `require` this module must use (a dynamic `import()` compiles to a split-bundle
// fetch under Metro and fails on every dev build, which is the whole reason it
// is a `require`).

import { describe, expect, it } from 'vitest';

describe('reaching expo-notifications where it is not', () => {
  it('imports without throwing', async () => {
    // The claim the root layout depends on. If this module threw on import, the
    // app would be dead before any of it rendered.
    await expect(import('./native')).resolves.toBeDefined();
  });

  it('answers null, which every caller reads as "push is unavailable here"', async () => {
    const { push } = await import('./native');
    expect(push()).toBeNull();
  });

  it('gives the same answer every time, without retrying the require', async () => {
    // The require either works for the process's lifetime or never will, so it
    // is resolved once at import time and callers pay nothing per call.
    const { push } = await import('./native');
    expect(push()).toBe(push());
  });
});
