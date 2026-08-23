import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { root } from '../../root';

const APP_JSON = 'clients/tv-native/app.json';
const FALLBACK = 'tv.kroma.tv';

const ExpoConfig = z.object({
  expo: z.object({ android: z.object({ package: z.string().min(1).max(128) }) }),
});

export function androidAppId(): string {
  try {
    const json = readFileSync(join(root, APP_JSON), 'utf8');
    return ExpoConfig.parse(JSON.parse(json)).expo.android.package;
  } catch {
    return FALLBACK;
  }
}
