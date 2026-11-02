import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Manifest, MODULE_SCHEMA_VERSION, speaksCurrentSchema } from '@kromatv/registry';
import { byCodeUnit } from '../sort';
import type { Artifact, Entry } from './catalog';
import { bundleName } from './pack';
import { tarRead, toTar } from './tar';

/** One packed bundle on disk, before it is placed in a catalog. */
export interface Bundle {
  manifest: Manifest;
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

/** Opens and describes one `.kmod`; `null` (with a warning) for a file that is
 *  not one, and for a bundle not named `<id>.kmod` after the module it holds. */
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
  if (file !== bundleName(manifest.id)) {
    console.warn(
      `  ! ${file}: holds ${manifest.id}, which packs as ${bundleName(manifest.id)}; skipped`,
    );
    return null;
  }
  return {
    manifest,
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

/** One catalog entry per module, sorted by id, its one artifact's URL resolved
 *  against `baseFor(bundle)`. Two bundles of one module are refused. */
export function toEntries(bundles: readonly Bundle[], baseFor: (b: Bundle) => string): Entry[] {
  const entries = new Map<string, Entry>();
  for (const b of bundles) {
    const id = b.manifest.id;
    const twin = entries.get(id);
    if (twin) throw new Error(`${twin.file} and ${b.file} both hold ${id}`);
    const base = baseFor(b).replace(/\/$/, '');
    const artifact: Artifact = {
      file: b.file,
      url: base ? `${base}/${b.file}` : b.file,
      size: b.size,
      sha256: b.sha256,
      contentHash: b.contentHash,
    };
    entries.set(id, {
      ...b.manifest,
      icon: b.icon,
      artifacts: [artifact],
      file: artifact.file,
      url: artifact.url,
      size: artifact.size,
      sha256: artifact.sha256,
    });
  }
  return [...entries.values()].sort((a, b) => byCodeUnit(a.id, b.id));
}
