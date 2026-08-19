#!/usr/bin/env bun

// `modules install <id>`: upload a packed `.kmod` to a running server.
//
//   bun run modules install tv.kroma.vpn
//   bun run modules install tv.kroma.vpn --server http://192.168.1.20:4040
//
// The upload path, not the registry one, and deliberately: a server refuses to
// install an artifact over http, so a local registry can be browsed but never
// installed from. Uploading hands over the bytes directly, which is the sanctioned
// way to get a local build onto a dev server and needs no gate loosened.
//
// Auth: KROMA_TOKEN, or --token. Any account with `settings.manage`.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_SERVER = 'http://localhost:4040';

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
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

/** The bundle for `id` in `dir`: a universal one if the module ships it, else
 *  this machine's build, so `install` matches what `pack` built here rather than
 *  a cross-compiled sibling. */
export function bundleFor(
  files: string[],
  id: string,
  triple = hostTriplePart(),
): string | undefined {
  const mine = files.filter((f) => f === `${id}.kmod` || f.startsWith(`${id}-`));
  if (mine.length === 0) return undefined;
  return mine.find((f) => f === `${id}.kmod`) ?? mine.find((f) => f.includes(triple)) ?? mine[0];
}

export async function main(args: string[]): Promise<void> {
  const id = args.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('usage: bun run modules install <module-id> [--server URL] [--token T]');
    process.exit(2);
  }

  const { root } = await import('./root');
  const dir = join(root, 'dist/modules');
  const file = existsSync(dir) ? bundleFor(readdirSync(dir), id) : undefined;
  if (!file) {
    console.error(`no packed bundle for '${id}' in ${dir}; run \`bun run modules:pack\` first`);
    process.exit(1);
  }

  const server = (flag('server') ?? process.env.KROMA_SERVER ?? DEFAULT_SERVER).replace(/\/$/, '');
  const token = flag('token') ?? process.env.KROMA_TOKEN;
  if (!token) {
    console.error('no token: set KROMA_TOKEN, or pass --token (needs settings.manage)');
    process.exit(1);
  }

  const bytes = readFileSync(join(dir, file));
  const res = await fetch(`${server}/api/admin/store/install`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
    body: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`install failed (${res.status}): ${body}`);
    process.exit(1);
  }
  console.log(`installed ${file} -> ${server}`);
  console.log(`  ${body}`);
}
