import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { z } from 'zod';
import { licenseTexts, type Notice } from './notices.ts';

const Metadata = z.object({
  packages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      version: z.string(),
      license: z.string().nullable(),
      repository: z.string().nullable(),
      manifest_path: z.string(),
      source: z.string().nullable(),
    }),
  ),
  resolve: z.object({
    root: z.string().nullable(),
    nodes: z.array(
      z.object({
        id: z.string(),
        deps: z.array(
          z.object({
            pkg: z.string(),
            dep_kinds: z.array(z.object({ kind: z.string().nullable() })),
          }),
        ),
      }),
    ),
  }),
});

/** `cargo metadata --format-version 1`, the fields the notices read. */
export type Metadata = z.infer<typeof Metadata>;
type Package = Metadata['packages'][number];

/**
 * The crates a program links: those its root reaches through normal
 * dependencies, never only a build or dev one, less the workspace's own.
 */
export function linkedCrates(metadata: Metadata): Package[] {
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const root = metadata.resolve.root;
  const seen = new Set<string>(root ? [root] : []);
  const queue = root ? [root] : [];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const dep of nodes.get(id)?.deps ?? []) {
      const normal = dep.dep_kinds.some((kind) => kind.kind === null);
      if (normal && !seen.has(dep.pkg)) {
        seen.add(dep.pkg);
        queue.push(dep.pkg);
      }
    }
  }
  return metadata.packages.filter((pkg) => seen.has(pkg.id) && pkg.source !== null);
}

/**
 * The notices of the crates `manifestPath` links when built for `targets`
 * (every target when empty), read with `cargo metadata`.
 */
export function cargoNotices(manifestPath: string, targets: readonly string[] = []): Notice[] {
  const json = execFileSync(
    'cargo',
    [
      'metadata',
      '--format-version',
      '1',
      '--locked',
      '--manifest-path',
      manifestPath,
      ...targets.flatMap((target) => ['--filter-platform', target]),
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return linkedCrates(Metadata.parse(JSON.parse(json))).map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    source: pkg.repository,
    texts: licenseTexts(dirname(pkg.manifest_path)),
  }));
}
