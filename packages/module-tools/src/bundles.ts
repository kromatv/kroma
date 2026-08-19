// Reading packed `.kmod` bundles back: the manifest, the icon and the content
// hash all live inside the zstd tar, so both the local `registry` command and the
// `release` pipeline recover them from the bundles themselves rather than from
// the working tree. What ships is what gets described.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Manifest, MODULE_SCHEMA_VERSION, speaksCurrentSchema } from '@kroma/registry';
import type { Artifact, Entry } from './catalog';
import { byCodeUnit } from './sort';

/** One packed bundle on disk, before it is placed in a catalog. */
export interface Bundle {
  manifest: Manifest;
  target: string | null;
  file: string;
  path: string;
  size: number;
  sha256: string;
  contentHash: string;
  icon?: string;
}

// Dispatched by magic bytes, like the server's installer: zstd today, gzip/raw
// also accepted.
function toTar(buf: Buffer): Uint8Array {
  // A view, not a copy: Bun's decompressors want an ArrayBuffer-backed array.
  const bytes = new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
  if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
    return Bun.zstdDecompressSync(bytes);
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return Bun.gunzipSync(bytes);
  }
  return bytes;
}

// ustar headers are 512-byte blocks: name at 0..100 (NUL-padded), size as
// octal at 124..136.
function tarRead(tar: Uint8Array, wanted: string): Uint8Array | null {
  const field = (start: number, len: number) =>
    new TextDecoder().decode(tar.subarray(start, start + len)).split('\0')[0] ?? '';
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = field(off, 100);
    if (!name) break; // two empty blocks terminate the archive
    const size = Number.parseInt(field(off + 124, 12).trim() || '0', 8);
    if (name === wanted || name === `./${wanted}`) {
      return tar.subarray(off + 512, off + 512 + size);
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

// svg preferred, then png; capped so one oversized icon can't bloat the
// whole catalog.
function iconDataUri(tar: Uint8Array): string | undefined {
  const MAX = 64 * 1024;
  const svg = tarRead(tar, 'icon.svg');
  if (svg && svg.length <= MAX) {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  const png = tarRead(tar, 'icon.png');
  if (png && png.length <= MAX) {
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  }
  return undefined;
}

/** Every `.kmod` in `dir`, opened and described. Sorted by filename so a catalog
 *  built from the same set of bundles comes out byte-identical anywhere. */
export function readBundles(dir: string): Bundle[] {
  if (!existsSync(dir)) {
    throw new Error(`no packed modules at ${dir}; run \`bun run modules:pack\` first`);
  }
  const out: Bundle[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.kmod'))
    .sort(byCodeUnit)) {
    const path = join(dir, file);
    const bytes = readFileSync(path);
    const tar = toTar(bytes);
    const manifestBytes = tarRead(tar, 'module.json');
    if (!manifestBytes) {
      console.warn(`  ! ${file}: no module.json inside, skipped`);
      continue;
    }
    const read = Manifest.safeParse(JSON.parse(new TextDecoder().decode(manifestBytes)));
    if (!read.success) {
      console.warn(`  ! ${file}: module.json is not a manifest, skipped (${read.error.message})`);
      continue;
    }
    const manifest = read.data;
    // Refused here as well as at install: a registry that lists a bundle no
    // current server will unpack is worse than one that never offered it.
    if (!speaksCurrentSchema(manifest)) {
      console.warn(
        `  ! ${file}: built for manifest schema v${manifest.schemaVersion ?? 0}, and this SDK speaks v${MODULE_SCHEMA_VERSION}; skipped`,
      );
      continue;
    }
    // Bundles are named `<id>.kmod` or `<id>-<target>.kmod`; recover the target
    // from the filename using the id just read out of the bundle.
    const stem = file.slice(0, -'.kmod'.length);
    const target =
      stem === manifest.id ? null : stem.slice(manifest.id.length).replace(/^-/, '') || null;
    out.push({
      manifest,
      target,
      file,
      path,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentHash: createHash('sha256').update(tar).digest('hex'),
      icon: iconDataUri(tar),
    });
  }
  return out;
}

/** Group bundles into one catalog entry per module id, resolving each artifact's
 *  URL against `baseFor(bundle)` - which differs per module once modules release
 *  on their own tags. */
export function toEntries(bundles: Bundle[], baseFor: (b: Bundle) => string): Entry[] {
  const entries = new Map<string, Entry>();
  for (const b of bundles) {
    const base = baseFor(b).replace(/\/$/, '');
    const artifact: Artifact = {
      target: b.target,
      file: b.file,
      url: base ? `${base}/${b.file}` : b.file,
      size: b.size,
      sha256: b.sha256,
      contentHash: b.contentHash,
    };
    const existing = entries.get(b.manifest.id);
    if (existing) {
      existing.artifacts.push(artifact);
      existing.icon ??= b.icon;
      continue;
    }
    entries.set(b.manifest.id, {
      ...b.manifest,
      icon: b.icon,
      artifacts: [artifact],
      file: artifact.file,
      url: artifact.url,
      size: artifact.size,
      sha256: artifact.sha256,
    });
  }
  const out = [...entries.values()].sort((a, b) => byCodeUnit(a.id, b.id));
  for (const m of out) {
    m.artifacts.sort((a, b) => byCodeUnit(a.target ?? '', b.target ?? ''));
    // The schema-1 mirror must follow the sort, not the arrival order, or the
    // flat url/sha256 pair names a different target run to run.
    const first = m.artifacts[0];
    if (first) {
      m.file = first.file;
      m.url = first.url;
      m.size = first.size;
      m.sha256 = first.sha256;
    }
  }
  return out;
}
