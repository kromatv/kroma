// The React Compiler as one vite plugin, so every place that needs the kit
// auto-memoised spells it the same way.
//
// plugin-react v6 dropped its built-in Babel pass, so the compiler runs as a
// separate preset rather than through `react({ babel })`, which silently does
// nothing. The shells compose this themselves (see ./shell.ts); this exists for
// the callers outside the shells, notably the kit's audit, which has to measure
// re-renders under the same compiler the shells ship.

import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';

/** Auto-memoisation, on the same terms the web client and the TV shells get. */
export function reactCompiler() {
  return babel({ presets: [reactCompilerPreset()] });
}
