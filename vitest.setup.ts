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

afterEach(() => {
  cleanup();
});
