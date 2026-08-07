import { join } from 'node:path';

/** Absolute path to the repository root, from `packages/module-tools/src/`. */
export const root = join(import.meta.dir, '../../..');
