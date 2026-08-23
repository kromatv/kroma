import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../../root';

const CONFIG = 'clients/tizen/public/config.xml';
const FALLBACK = 'KromaTV001.KROMA';

export function tizenAppId(): string {
  try {
    const config = readFileSync(join(root, CONFIG), 'utf8');
    return /<tizen:application[^>]*\sid="([^"]+)"/.exec(config)?.[1] ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}
