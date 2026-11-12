import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const INSTALLED_AT = ['/usr/bin/openssl', '/opt/homebrew/bin/openssl', '/usr/local/bin/openssl'];

/**
 * The openssl to spawn, resolved once. An absolute path is preferred over a
 * PATH lookup so that nothing earlier on PATH can stand in for it.
 */
export const OPENSSL = INSTALLED_AT.find((path) => existsSync(path)) ?? onPath() ?? 'openssl';

function onPath(): string | null {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, 'openssl');
    if (directory !== '' && existsSync(candidate)) return candidate;
  }
  return null;
}
