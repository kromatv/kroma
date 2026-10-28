import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { z } from 'zod';
import { licenseTexts, type Notice } from './notices.ts';

const Manifest = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  license: z.union([z.string(), z.object({ type: z.string() })]).optional(),
  repository: z.union([z.string(), z.object({ url: z.string() })]).optional(),
  homepage: z.string().optional(),
});

const NODE_MODULES = '/node_modules/';

function named(dir: string): boolean {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return false;
  try {
    return Manifest.safeParse(JSON.parse(readFileSync(file, 'utf8'))).success;
  } catch {
    return false;
  }
}

/**
 * The installed package a bundled module belongs to: the nearest folder above
 * it whose package.json names a package, inside node_modules. Null for this
 * repository's own source and for virtual modules.
 */
export function packageRoot(moduleId: string, isPackage = named): string | null {
  const file = (moduleId.split('?')[0] ?? '').replaceAll('\\', '/');
  if (file.startsWith('\0') || !file.includes(NODE_MODULES)) return null;
  let dir = posix.dirname(file);
  while (dir.includes(NODE_MODULES)) {
    if (isPackage(dir)) return dir;
    dir = posix.dirname(dir);
  }
  return null;
}

function notice(root: string): Notice {
  const manifest = Manifest.parse(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
  const license = manifest.license;
  const repository = manifest.repository;
  return {
    name: manifest.name,
    version: manifest.version,
    license: typeof license === 'object' ? license.type : (license ?? null),
    source:
      (typeof repository === 'object' ? repository.url : repository) ?? manifest.homepage ?? null,
    texts: licenseTexts(root),
  };
}

/** The notices of every installed package the given bundled modules come from. */
export function npmNotices(moduleIds: Iterable<string>): Notice[] {
  const roots = new Set<string>();
  for (const id of moduleIds) {
    const root = packageRoot(id);
    if (root) roots.add(root);
  }
  return [...roots].map(notice);
}
