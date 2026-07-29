// Unmount whatever a test rendered, after every test.
//
// @testing-library installs this itself when the runner exposes globals; this
// project does not use them, so without a setup file it is simply never
// installed - and nothing says so. Every `render` / `renderHook` in a file stays
// mounted for the whole file, with its effects running.
//
// That is not only untidy. A hook whose effect is keyed on a value the test
// builds inline re-runs on each of its own re-renders, so it spins for as long
// as it stays mounted - and it inflates the call counts of every LATER test in
// the file, which is where it actually gets noticed: an assertion about "called
// twice" failing with 26,000, in a test that has nothing to do with the one that
// leaked. Intervals and animation loops behave the same way, quietly.

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `__DEV__` is a React Native global that Metro's transform defines. Anything
// reaching `expo-modules-core` under this runner - a mobile module that imports
// `expo-device`, and so every test that transitively imports one - hits a bare
// reference to it and dies at IMPORT time, before a single test runs.
//
// `false`, because the one thing it guards is a warning about
// `process.env.EXPO_OS` not being inlined by `babel-preset-expo` - which the
// runner does not use, and which no test wants to hear about.
(globalThis as { __DEV__?: boolean }).__DEV__ ??= false;

afterEach(() => {
  cleanup();
});
