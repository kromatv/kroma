import { readFileSync } from 'node:fs';
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

/** Uploads a packed `.kmod` to the server, which unpacks and installs it. */
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
