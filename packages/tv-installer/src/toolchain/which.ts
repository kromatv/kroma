import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Where PATH finds `binary`, as the shell would run it, or null. */
export function which(binary: string): string | null {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, binary);
    if (directory !== '' && runnable(candidate)) return candidate;
  }
  return null;
}

function runnable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
