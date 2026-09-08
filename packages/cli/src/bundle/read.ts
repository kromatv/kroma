import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Manifest, MODULE_SCHEMA_VERSION, speaksCurrentSchema } from '@kromatv/registry';
import { byCodeUnit } from '../sort';
import type { Artifact, Entry } from './catalog';
import { tarRead, toTar } from './tar';

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

const ICON_MAX = 64 * 1024;

function iconDataUri(tar: Uint8Array): string | undefined {
  const svg = tarRead(tar, 'icon.svg');
  if (svg && svg.length <= ICON_MAX) {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  const png = tarRead(tar, 'icon.png');
  if (png && png.length <= ICON_MAX) {
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  }
  return undefined;
}

/** Opens and describes one `.kmod`; `null` (with a warning) for a file that is not one. */
export function readBundle(path: string): Bundle | null {
  const file = path.split('/').pop() ?? path;
  const bytes = readFileSync(path);
  const tar = toTar(bytes);
  const manifestBytes = tarRead(tar, 'module.json');
  if (!manifestBytes) {
    console.warn(`  ! ${file}: no module.json inside, skipped`);
    return null;
  }
  const read = Manifest.safeParse(JSON.parse(new TextDecoder().decode(manifestBytes)));
  if (!read.success) {
    console.warn(`  ! ${file}: module.json is not a manifest, skipped (${read.error.message})`);
    return null;
  }
  const manifest = read.data;
  if (!speaksCurrentSchema(manifest)) {
    console.warn(
      `  ! ${file}: built for manifest schema v${manifest.schemaVersion ?? 0}, and this SDK speaks v${MODULE_SCHEMA_VERSION}; skipped`,
    );
    return null;
  }
  const stem = file.slice(0, -'.kmod'.length);
  const target =
    stem === manifest.id ? null : stem.slice(manifest.id.length).replace(/^-/, '') || null;
  return {
    manifest,
    target,
    file,
    path,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    contentHash: createHash('sha256').update(tar).digest('hex'),
    icon: iconDataUri(tar),
  };
}

/** Every `.kmod` in `dir`, opened and described, sorted by filename so a catalog
 *  built from the same bundles comes out byte-identical anywhere. */
export function readBundles(dir: string): Bundle[] {
  if (!existsSync(dir)) {
    throw new Error(`no packed modules at ${dir}; run \`kroma build\` first`);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.kmod'))
    .sort(byCodeUnit)
    .flatMap((f) => readBundle(join(dir, f)) ?? []);
}

/** Groups bundles into one catalog entry per module id, each artifact's URL
 *  resolved against `baseFor(bundle)`. */
export function toEntries(bundles: readonly Bundle[], baseFor: (b: Bundle) => string): Entry[] {
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
