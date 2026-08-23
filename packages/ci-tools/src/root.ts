import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the repository root, from `packages/ci-tools/src/`. */
export const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
