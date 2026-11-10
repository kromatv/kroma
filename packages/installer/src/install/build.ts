import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../shared/root';

export function buildable(shell: string): boolean {
  return existsSync(join(root, shell, 'package.json'));
}
