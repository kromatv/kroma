import { tvShellConfig } from '@kroma/bundler/shell';
import { target } from './tv.target';

// The shared TV-shell pipeline, parameterized by ./tv.target.ts. Do not wrap it
// in this shell's own `defineConfig`: that pulls in a second physical copy of
// vite, and TS then rejects the two mismatched `UserConfig` identities.
export default tvShellConfig(import.meta.url, target);
