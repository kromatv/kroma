import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../shared/root';

/** The client every native television app is built from: the Samsung `.tpk` and the LG `.ipk`. */
export const TV_NATIVE = 'clients/tv-native';

export function buildable(shell: string): boolean {
  return existsSync(join(root, shell, 'package.json'));
}
