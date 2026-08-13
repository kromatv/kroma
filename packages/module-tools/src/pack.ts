#!/usr/bin/env bun

// Pack modules into installable `.kmod` files. A `.kmod` is a zstd-compressed tar
// of a module's native binary (`module`, the out-of-process runtime entrypoint)
// + `module.json` + `icon.<ext>` + its frontend remote (`fe/`, when it ships one).
// Install one from Admin -> Modules, or POST it to /api/admin/store/install; the
// core unpacks it under <data>/modules/<id>/ and the supervisor spawns it.
//
//   bun run modules:pack               # pack every module that has a [[bin]]
//   bun run modules:pack <module-dir>  # pack just one
//
// Output: dist/modules/<id>.kmod  (host target; CI packs one per platform)

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { root } from './root';
import { byCodeUnit } from './sort';

const outDir = join(root, 'dist/modules');
const modulesRoot = join(root, 'modules');

/** Shared build dir for every module workspace, so the dep graph they have in
 * common is compiled once instead of once per module. */
export const KMOD_TARGET_DIR = join(root, 'target/kmod');

const binName = /\[\[bin\]\][\s\S]*?name\s*=\s*"([^"]+)"/;
const kmodFeatures = /\[package\.metadata\.kmod\][\s\S]*?features\s*=\s*\[([^\]]*)\]/;

/** Every module (any dir with a module.json). Modules with a `[[bin]]` pack a
 * native sidecar; those without pack as a "library" module (manifest + FE only,
 * no spawned process, e.g. the release-name parser, whose code is co-linked). */
export function packableModules(): string[] {
  return readdirSync(modulesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(modulesRoot, e.name))
    .filter((dir) => existsSync(join(dir, 'module.json')));
}

/**
 * A module's `[[bin]]` name and any cargo features the `.kmod` build should
 * enable, from its server Cargo.toml. Features are declared as
 * `[package.metadata.kmod] features = ["rqbit"]` so the build stays declarative
 * (e.g. torrents bundles the embedded librqbit engine).
 */
export function crateAndBin(moduleDir: string): {
  bin: string | null;
  features: string[];
} {
  const cargoPath = join(moduleDir, 'server/Cargo.toml');
  // A module may have no server crate at all (pure FE); then it's library-only.
  const cargo = existsSync(cargoPath) ? readFileSync(cargoPath, 'utf8') : '';
  // A `[[bin]]` means a native sidecar; its absence => a library module (no binary).
  const bin = binName.exec(cargo)?.[1] ?? null;
  const featBlock = kmodFeatures.exec(cargo)?.[1] ?? '';
  const features = [...featBlock.matchAll(/"([^"]+)"/g)].flatMap((m) => m[1] ?? []);
  return { bin, features };
}

/**
 * The `cargo build` arguments for a module's sidecar, and where cargo will put
 * the binary. Shared with the `plan` command: CI builds with the plan
 * and packs with `KMOD_SKIP_BUILD=1`, so the two must agree on both.
 *
 * Bare feature names, and no `-p`: a module is its own single-package workspace,
 * so `pkg/feat` would resolve against a DEPENDENCY named `pkg`.
 */
export function cargoBuild(
  bin: string,
  features: string[],
  target: string | null,
): { args: string[]; binPath: string } {
  const args = ['build', '--profile', 'release-kmod', '--bin', bin];
  if (features.length) args.push('--features', features.join(','));
  if (target) args.push('--target', target);
  // cargo nests the artifact under target/<triple>/ when --target is given.
  const outRoot = target
    ? join(KMOD_TARGET_DIR, target, 'release-kmod')
    : join(KMOD_TARGET_DIR, 'release-kmod');
  return { args, binPath: join(outRoot, bin) };
}

// 1) Build the module's native binary, with any declared features. Uses the
//    `release-kmod` profile (release + panic=abort): a sidecar aborts on panic
//    and the supervisor respawns it, which drops the unwinding tables for ~11%
//    smaller binaries at no speed cost (opt-level stays 3). Library modules (no
//    [[bin]]) skip this: their code is co-linked, not spawned.
// Optional cross-target (KMOD_TARGET, e.g. x86_64-unknown-linux-musl). A .kmod
// carries a NATIVE binary, so the platform must match the server; when set, the
// bundle is suffixed with the triple (see the output name below). Unset = host.
// KMOD_SKIP_BUILD: the sidecar binaries were already cross-compiled out of band
// (CI builds them inside the musl cross-toolchain image the Synology build uses,
// which is proven to link candle / librqbit; this script then just stages +
// packs them). Skips the `cargo build` and reads the prebuilt artifact.
// The build runs in the MODULE's own workspace (each module is one now) against
// the shared KMOD_TARGET_DIR, so the `plan` command and this path leave
// their artifacts in the same place and either can produce what the other packs.
async function buildModuleBinary(
  moduleDir: string,
  bin: string,
  features: string[],
  target: string | null,
  skipBuild: boolean,
): Promise<string> {
  const { args, binPath } = cargoBuild(bin, features, target);
  if (!skipBuild) {
    await $`cargo ${args}`
      .cwd(join(moduleDir, 'server'))
      .env({ ...process.env, CARGO_TARGET_DIR: KMOD_TARGET_DIR });
  }
  if (!existsSync(binPath)) {
    throw new Error(
      skipBuild
        ? `KMOD_SKIP_BUILD set but no prebuilt binary at ${binPath} (build it first)`
        : `built no binary at ${binPath}`,
    );
  }
  return binPath;
}

// 2) Build the frontend remote if the module ships one.
async function buildFrontend(uiDir: string): Promise<void> {
  if (existsSync(uiDir) && existsSync(join(uiDir, 'vite.config.ts'))) {
    console.log('  - vite build (frontend remote)');
    await $`bun run build`.cwd(uiDir).nothrow();
  }
}

// 3) Stage the bundle (manifest + native binary + icons; the FE remote is added
//    by the caller once it knows the build produced a `dist/`).
function stageBundle(
  moduleDir: string,
  binPath: string | null,
): { staging: string; entries: string[] } {
  const staging = join(moduleDir, '.bundle');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const entries: string[] = [];
  copyFileSync(join(moduleDir, 'module.json'), join(staging, 'module.json'));
  entries.push('module.json');
  if (binPath) {
    copyFileSync(binPath, join(staging, 'module'));
    entries.push('module');
  }
  for (const icon of ['icon.svg', 'icon.png']) {
    if (existsSync(join(moduleDir, icon))) {
      copyFileSync(join(moduleDir, icon), join(staging, icon));
      entries.push(icon);
    }
  }
  return { staging, entries };
}

// Deterministic ustar writer. A universal (no-binary) bundle is packed by
// EVERY CI matrix leg under the same filename, and the release pipeline merges
// those directories twice (catalog job, then deploy) with last-write-wins,
// so the catalog's published sha256 only stays true if every leg's copy is
// byte-identical. Host `tar` cannot promise that (bsdtar vs GNU tar, mtimes,
// uids); this writer can: fixed epoch, uid/gid 0, sorted entries.
const TAR_BLOCK = 512;

function tarOctal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tarHeader(name: string, size: number, mode: number, dir: boolean): Uint8Array {
  if (name.length > 100) {
    throw new Error(`tar entry name too long for a ustar header: ${name}`);
  }
  const buf = new Uint8Array(TAR_BLOCK);
  const put = (s: string, off: number) => buf.set(new TextEncoder().encode(s), off);
  put(name, 0);
  put(tarOctal(mode, 8), 100);
  put(tarOctal(0, 8), 108); // uid
  put(tarOctal(0, 8), 116); // gid
  put(tarOctal(dir ? 0 : size, 12), 124);
  put(tarOctal(0, 12), 136); // mtime: fixed epoch, see above
  put('        ', 148); // checksum is computed over spaces
  put(dir ? '5' : '0', 156);
  put('ustar\0', 257);
  put('00', 263);
  let sum = 0;
  for (const b of buf) sum += b;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return buf;
}

function tarEntryList(
  staging: string,
  entries: string[],
): { name: string; dir: boolean; mode: number }[] {
  const out: { name: string; dir: boolean; mode: number }[] = [];
  const walk = (rel: string) => {
    if (statSync(join(staging, rel)).isDirectory()) {
      out.push({ name: `${rel}/`, dir: true, mode: 0o755 });
      for (const child of readdirSync(join(staging, rel)).sort(byCodeUnit)) {
        walk(`${rel}/${child}`);
      }
    } else {
      // The runtime entrypoint must stay executable; the supervisor re-chmods
      // it on install anyway, but the tar should already be right.
      out.push({ name: rel, dir: false, mode: rel === 'module' ? 0o755 : 0o644 });
    }
  };
  for (const entry of [...entries].sort(byCodeUnit)) {
    walk(entry);
  }
  return out;
}

function deterministicTar(staging: string, entries: string[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of tarEntryList(staging, entries)) {
    if (e.dir) {
      parts.push(tarHeader(e.name, 0, e.mode, true));
      continue;
    }
    const data = readFileSync(join(staging, e.name));
    parts.push(tarHeader(e.name, data.length, e.mode, false), data);
    const pad = data.length % TAR_BLOCK;
    if (pad) parts.push(new Uint8Array(TAR_BLOCK - pad));
  }
  parts.push(new Uint8Array(TAR_BLOCK * 2));
  const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return buf;
}

function describeBuild(bin: string | null, features: string[]): string {
  if (!bin) return 'library (no binary)';
  const extras = features.length ? ` [+${features.join(',')}]` : '';
  return `bin ${bin}${extras}`;
}

/** The cargo half. Every module workspace shares one CARGO_TARGET_DIR so they
 *  can reuse compiled dependencies, and cargo takes an exclusive lock on it, so
 *  these cannot overlap: running them concurrently would only queue on the lock. */
async function buildOne(moduleDir: string): Promise<{ id: string; binPath: string | null }> {
  const { id } = JSON.parse(readFileSync(join(moduleDir, 'module.json'), 'utf8')) as { id: string };
  const { bin, features } = crateAndBin(moduleDir);
  console.log(`\nbuilding ${id} (${describeBuild(bin, features)})`);
  const target = process.env.KMOD_TARGET?.trim() || null;
  const skipBuild = process.env.KMOD_SKIP_BUILD === '1';
  const binPath = bin ? await buildModuleBinary(moduleDir, bin, features, target, skipBuild) : null;
  return { id, binPath };
}

/** The bundle half: frontend build, tar, compress. None of it touches the cargo
 *  lock, so every module can do this at once. */
async function packOne(moduleDir: string, id: string, binPath: string | null): Promise<string> {
  const { bin } = crateAndBin(moduleDir);
  const target = process.env.KMOD_TARGET?.trim() || null;

  const uiDir = join(moduleDir, 'ui');
  await buildFrontend(uiDir);

  const { staging, entries } = stageBundle(moduleDir, binPath);
  const feDist = join(uiDir, 'dist');
  if (existsSync(feDist)) {
    await $`cp -R ${feDist} ${join(staging, 'fe')}`;
    entries.push('fe');
  }

  // 4) tar + zstd it into a .kmod (zstd is ~20-25% smaller than gzip for these
  //    native binaries; the supervisor decompresses it with pure-Rust ruzstd).
  //    Sidecar bundles are suffixed with the build target so a consumer can tell
  //    which platform they run on; library modules (no binary) stay unsuffixed.
  mkdirSync(outDir, { recursive: true });
  const suffix = bin && target ? `-${target}` : '';
  const kmod = join(outDir, `${id}${suffix}.kmod`);
  // The tar is deterministic, so an unchanged module hashes to what is already
  // on disk and skips the (slow, level-19) recompression entirely.
  const tar = deterministicTar(staging, entries);
  const stamp = `${kmod}.tarsha`;
  const tarSha = Bun.SHA256.hash(tar, 'hex');
  if (existsSync(kmod) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === tarSha) {
    rmSync(staging, { recursive: true, force: true });
    console.log(`  unchanged: ${kmod}`);
    return kmod;
  }
  const bytes = Bun.zstdCompressSync(tar, { level: 19 });
  writeFileSync(kmod, bytes);
  writeFileSync(stamp, `${tarSha}\n`);
  // A SHA-256 sidecar file so a release/registry consumer can verify integrity.
  writeFileSync(`${kmod}.sha256`, `${Bun.SHA256.hash(bytes, 'hex')}  ${id}${suffix}.kmod\n`);
  rmSync(staging, { recursive: true, force: true });
  console.log(`  packed: ${kmod}`);
  return kmod;
}

/** `modules pack [dir]`: every packable module, or just the one given. */
export async function main(args: string[]): Promise<void> {
  const arg = args[0];
  const dirs = arg ? [join(root, arg)] : packableModules();
  if (dirs.length === 0) {
    throw new Error('no packable modules (none have a [[bin]] yet)');
  }
  // Cargo first, one at a time (shared target dir = one lock), then every
  // bundle concurrently: on a 12-core box that tail is essentially free.
  const built: { dir: string; id: string; binPath: string | null }[] = [];
  for (const dir of dirs) {
    built.push({ dir, ...(await buildOne(dir)) });
  }
  const packed = await Promise.all(built.map((b) => packOne(b.dir, b.id, b.binPath)));
  console.log(`\n${packed.length} module(s) -> ${outDir}`);
  console.log('install from Admin -> Modules, or POST to /api/admin/store/install.');
}
