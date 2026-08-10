import { tvShellLegacyConfig } from '@kroma/bundler/shell';
import { target } from './tv.target.ts';

// LEGACY tier (Chromium 53-94, i.e. Tizen 6.0-7.0): built after the modern tier;
// emits dist/legacy/ and rewrites dist/index.html into the runtime engine gate.
// Exported straight through, never re-wrapped in this shell's own `defineConfig`:
// that pulls in a second physical vite copy whose `UserConfig` identity TS rejects.
export default tvShellLegacyConfig(import.meta.url, target);
