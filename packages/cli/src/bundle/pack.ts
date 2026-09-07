import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Project } from '../project';
import { deterministicTar } from './tar';

export interface PackInput {
  project: Project;
  /** The built sidecar, or `null` for a library module. */
  binPath: string | null;
  /** The built frontend (`remoteEntry.js` + chunks), or `null` when there is none. */
  feDir: string | null;
  outDir: string;
  /** The cross-compile triple, which suffixes a sidecar bundle's name. */
  target: string | null;
}

/** `<id>.kmod`, or `<id>-<triple>.kmod` for a sidecar built for one platform. */
export function bundleName(id: string, hasBinary: boolean, target: string | null): string {
  return `${id}${hasBinary && target ? `-${target}` : ''}.kmod`;
}

function stage(input: PackInput): { staging: string; entries: string[] } {
  const { project, binPath, feDir } = input;
  const staging = join(project.dir, '.bundle');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const entries = ['module.json'];
  copyFileSync(join(project.dir, 'module.json'), join(staging, 'module.json'));
  if (binPath) {
    copyFileSync(binPath, join(staging, 'module'));
    entries.push('module');
  }
  for (const icon of ['icon.svg', 'icon.png']) {
    if (existsSync(join(project.dir, icon))) {
      copyFileSync(join(project.dir, icon), join(staging, icon));
      entries.push(icon);
    }
  }
  if (feDir && existsSync(feDir)) {
    cpSync(feDir, join(staging, 'fe'), { recursive: true });
    entries.push('fe');
  }
  return { staging, entries };
}

export interface Packed {
  path: string;
  file: string;
  /** False when the tar matched the last pack and the file was left as it was. */
  changed: boolean;
}

/**
 * Stages a module's bundle and writes `<out>/<file>.kmod` beside a `.sha256`
 * sidecar. The tar is deterministic, so an unchanged module hashes to what is
 * on disk already and skips the slow level-19 recompression.
 */
export function packBundle(input: PackInput): Packed {
  const { project, outDir, target, binPath } = input;
  const { staging, entries } = stage(input);
  mkdirSync(outDir, { recursive: true });
  const file = bundleName(project.manifest.id, binPath !== null, target);
  const kmod = join(outDir, file);
  const tar = deterministicTar(staging, entries);
  rmSync(staging, { recursive: true, force: true });
  const stamp = `${kmod}.tarsha`;
  const tarSha = Bun.SHA256.hash(tar, 'hex');
  if (existsSync(kmod) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === tarSha) {
    return { path: kmod, file, changed: false };
  }
  const bytes = Bun.zstdCompressSync(tar, { level: 19 });
  writeFileSync(kmod, bytes);
  writeFileSync(stamp, `${tarSha}\n`);
  writeFileSync(`${kmod}.sha256`, `${Bun.SHA256.hash(bytes, 'hex')}  ${file}\n`);
  return { path: kmod, file, changed: true };
}

/** A quick, uncompressed-ish bundle for the dev loop: the same tar, zstd at a
 *  level that costs milliseconds rather than seconds. */
export function packForDev(input: PackInput): Packed {
  const { project, outDir, target, binPath } = input;
  const { staging, entries } = stage(input);
  mkdirSync(outDir, { recursive: true });
  const file = bundleName(project.manifest.id, binPath !== null, target);
  const kmod = join(outDir, file);
  const tar = deterministicTar(staging, entries);
  rmSync(staging, { recursive: true, force: true });
  writeFileSync(kmod, Bun.zstdCompressSync(tar, { level: 1 }));
  return { path: kmod, file, changed: true };
}
