import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { root } from '../../root';

const APPINFO = 'clients/webos/public/appinfo.json';
const FALLBACK = 'tv.kroma.webos';

const AppInfo = z.object({ id: z.string().min(1).max(128) });

export function webosAppId(): string {
  try {
    return AppInfo.parse(JSON.parse(readFileSync(join(root, APPINFO), 'utf8'))).id;
  } catch {
    return FALLBACK;
  }
}
