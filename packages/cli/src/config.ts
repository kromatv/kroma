import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const Config = z.object({
  defaultServer: z.string().optional(),
  servers: z
    .record(z.string(), z.object({ token: z.string(), user: z.string().optional() }))
    .default({}),
});
export type Config = z.infer<typeof Config>;

/** `~/.config/kroma/cli.json`, or wherever `KROMA_CLI_CONFIG` points. */
export function configPath(): string {
  const env = process.env.KROMA_CLI_CONFIG?.trim();
  if (env) return env;
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config');
  return join(base, 'kroma', 'cli.json');
}

export function readConfig(path = configPath()): Config {
  if (!existsSync(path)) return { servers: {} };
  try {
    return Config.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return { servers: {} };
  }
}

export function writeConfig(config: Config, path = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** A server URL with the trailing slash gone, so it keys the config the same
 *  way however it was typed. */
export function normalizeServer(url: string): string {
  const withScheme =
    url.startsWith('http://') || url.startsWith('https://') ? url : `http://${url}`;
  let end = withScheme.length;
  while (end > 0 && withScheme[end - 1] === '/') end -= 1;
  return withScheme.slice(0, end);
}
