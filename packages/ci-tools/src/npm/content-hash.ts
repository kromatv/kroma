import { createHash } from 'node:crypto';
import { z } from 'zod';

export type PackageFiles = ReadonlyMap<string, Uint8Array>;

export type PublishDecision = { publish: boolean; reason: string };

const PackageObject = z.record(z.string(), z.unknown());

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => Number(a > b) - Number(a < b))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

/** `package.json` with `version` dropped and every key sorted, so two builds of
 *  one source stamped with different versions serialise identically. */
export function normalisePackageJson(bytes: Uint8Array): Uint8Array {
  const parsed = PackageObject.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
  if (!parsed.success) throw new Error('package.json is not an object');
  const { version: _version, ...rest } = parsed.data;
  return new TextEncoder().encode(JSON.stringify(sortKeys(rest)));
}

function stampedVersion(files: PackageFiles): string | undefined {
  const raw = files.get('package.json');
  if (!raw) return undefined;
  const { version } = JSON.parse(new TextDecoder().decode(raw)) as { version?: unknown };
  return typeof version === 'string' && version ? version : undefined;
}

function maskVersion(bytes: Uint8Array, version: string | undefined): Uint8Array {
  if (!version) return bytes;
  const text = Buffer.from(bytes).toString('latin1');
  return Buffer.from(text.replaceAll(version, '\0version\0'), 'latin1');
}

/** sha256 over every file's path and bytes in sorted path order. The package's
 *  own version is masked wherever it is stamped (manifests, vendored crates),
 *  and `package.json` is normalised, so a rebuild at another version hashes alike. */
export function contentHash(files: PackageFiles): string {
  const version = stampedVersion(files);
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    const raw = files.get(path) as Uint8Array;
    const bytes = maskVersion(path === 'package.json' ? normalisePackageJson(raw) : raw, version);
    hash.update(`${path}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

/** Whether to publish: a canary only when its content differs from the
 *  published one, any other tag always. */
export function decide(input: {
  tag: string;
  local: PackageFiles;
  published: PackageFiles | null;
}): PublishDecision {
  if (input.tag !== 'canary') return { publish: true, reason: `tag ${input.tag} always publishes` };
  if (!input.published) return { publish: true, reason: 'no canary is published yet' };
  const local = contentHash(input.local);
  const published = contentHash(input.published);
  if (local === published) {
    return {
      publish: false,
      reason: `unchanged, skip: content hash ${local} matches the published canary`,
    };
  }
  return {
    publish: true,
    reason: `changed: content hash ${local} differs from the published canary ${published}`,
  };
}
