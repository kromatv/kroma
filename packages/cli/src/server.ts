import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { normalizeServer, readConfig } from './config';

export const DEFAULT_SERVER = 'http://localhost:4040';

export interface Server {
  url: string;
  token: string;
}

export interface ServerOptions {
  server?: string;
  token?: string;
}

/** The server a command talks to: the flag, else `KROMA_SERVER`, else the one
 *  `kroma login` was last run against, else localhost. The token follows the
 *  same order through `KROMA_TOKEN` and the login store. */
export function resolveServer(options: ServerOptions): Server {
  const config = readConfig();
  const url = normalizeServer(
    options.server || process.env.KROMA_SERVER || config.defaultServer || DEFAULT_SERVER,
  );
  const token = options.token || process.env.KROMA_TOKEN || config.servers[url]?.token;
  if (!token) {
    throw new Error(
      `no token for ${url}: run \`kroma login ${url}\`, or pass --token / set KROMA_TOKEN (an account with settings.manage)`,
    );
  }
  return { url, token };
}

/** How this machine's Rust triple reads in a bundle filename. Arch alone is not
 *  enough: an arm64 Mac would otherwise match an aarch64 LINUX build. */
export function hostTriplePart(
  arch: string = process.arch,
  platform: string = process.platform,
): string {
  const cpu = arch === 'arm64' ? 'aarch64' : 'x86_64';
  const os = platform === 'darwin' ? 'apple-darwin' : 'linux';
  return `${cpu}-${os === 'linux' ? 'unknown-linux' : os}`;
}

/** The bundle for `id` among `files`: a universal one if the module ships it,
 *  else the build for `triple`, else whatever there is. */
export function bundleFor(
  files: readonly string[],
  id: string,
  triple = hostTriplePart(),
): string | undefined {
  const mine = files.filter((f) => f === `${id}.kmod` || f.startsWith(`${id}-`));
  if (mine.length === 0) return undefined;
  return mine.find((f) => f === `${id}.kmod`) ?? mine.find((f) => f.includes(triple)) ?? mine[0];
}

const Platform = z.object({ target: z.string(), serverVersion: z.string() });
export type Platform = z.infer<typeof Platform>;

/** A server with no platform endpoint: absent as a route (404), or shadowed by
 *  a store route that takes another verb (405). Either way it cannot say. */
const UNANSWERED = [404, 405];

/** What the server runs on, so a bundle for another platform is refused here
 *  with a fix rather than by a sidecar that never starts. `null` on a server
 *  too old to say. */
export async function serverPlatform(server: Server): Promise<Platform | null> {
  const res = await fetch(`${server.url}/api/admin/store/platform`, {
    headers: { authorization: `Bearer ${server.token}` },
  });
  if (UNANSWERED.includes(res.status)) return null;
  if (!res.ok)
    throw new Error(`${server.url}: GET /api/admin/store/platform failed (${res.status})`);
  return Platform.parse(await res.json());
}

/** True when a bundle named `file` (built for `target`, or universal) runs on `platform`. */
export function bundleRunsOn(file: string, platform: Platform | null): boolean {
  if (!platform) return true;
  const stem = file.replace(/\.kmod$/, '');
  const dash = stem.indexOf('-');
  if (dash < 0) return true;
  return stem.slice(dash + 1) === platform.target;
}

/** Uploads a packed `.kmod` to the server, which unpacks, installs and spawns it. */
export async function uploadBundle(server: Server, path: string): Promise<string> {
  const bytes = readFileSync(path);
  const res = await fetch(`${server.url}/api/admin/store/install`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${server.token}`,
      'content-type': 'application/octet-stream',
    },
    body: new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`install failed (${res.status}): ${body}`);
  return body;
}
