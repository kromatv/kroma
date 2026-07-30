// Unmount whatever a test rendered, after every test.
//
// @testing-library installs this itself when the runner exposes globals; this
// project does not, so without this every `render`/`renderHook` in a file
// stays mounted for the whole file, with its effects still running - quietly
// inflating the call counts of later, unrelated tests in the same file.

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `__DEV__` is a React Native global that Metro's transform defines. Anything
// reaching `expo-modules-core` under this runner hits a bare reference to it
// and dies at import time, before a single test runs. `false` because the one
// thing it guards is a warning this runner doesn't need to hear.
(globalThis as { __DEV__?: boolean }).__DEV__ ??= false;

afterEach(() => {
  cleanup();
});
