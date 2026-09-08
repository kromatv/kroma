// The icon subset for the PUBLISHED package.
//
// `@kromatv/ui/bundler`'s pass does the same job for this repo's own builds, but
// it emits the absolute path each glyph resolved to, which is a path on the
// machine that ran it. Here the imports are bare specifiers into Tabler, so the
// module means the same thing wherever it is installed, and one default import
// per glyph is what lets a consumer's bundler drop the rest.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';

const BARREL_EXPORT = /export\s*\{([^}]*)\}\s*from\s*'\.\/icons\/([A-Za-z0-9]+)\.mjs'/g;
const EXPORTED_AS = /default as (Icon[A-Za-z0-9]+)/g;
const LITERAL = /['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g;

const SKIP = new Set(['node_modules', '__snapshots__']);
const IGNORED = ['.test.', '.story.', '.demo.', '.fixture', '.docs.'];

function exportName(slug: string): string {
  let out = 'Icon';
  for (const word of slug.split('-')) out += word.charAt(0).toUpperCase() + word.slice(1);
  return out;
}

/** Every glyph Tabler exports, mapped to the file whose DEFAULT export it is.
 *  Read from the barrel rather than a directory listing: dozens of Tabler's
 *  names are aliases with no file of their own. */
function available(pkgRoot: string, pkg: string): Map<string, string> {
  const entry = createRequire(join(pkgRoot, 'package.json')).resolve(pkg);
  const dir = entry.slice(0, entry.lastIndexOf(`${sep}dist${sep}`));
  const barrel = readFileSync(
    join(dir, 'dist', 'esm', `tabler-${pkg.slice('@tabler/'.length)}.mjs`),
    'utf8',
  );
  const out = new Map<string, string>();
  for (const [, names, file] of barrel.matchAll(BARREL_EXPORT)) {
    if (!names || !file) continue;
    for (const [, alias] of names.matchAll(EXPORTED_AS)) {
      if (alias) out.set(alias, `${pkg}/dist/esm/icons/${file}.mjs`);
    }
  }
  return out;
}

function walk(dir: string, onSource: (source: string) => void): void {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, onSource);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || IGNORED.some((mark) => name.includes(mark))) continue;
    onSource(readFileSync(path, 'utf8'));
  }
}

/** The glyph module the kit's own components need, and nothing else. A consumer
 *  naming a glyph the kit never draws gets the fallback. */
export function iconSubset(pkgRoot: string, pkg = '@tabler/icons-react'): string {
  const glyphs = available(pkgRoot, pkg);
  const used = new Set(['IconHelpCircle']);
  walk(join(pkgRoot, 'src'), (source) => {
    for (const [, slug] of source.matchAll(LITERAL)) {
      const name = exportName(slug as string);
      if (glyphs.has(name)) used.add(name);
    }
  });
  const names = [...used].sort();
  return [
    ...names.map((n) => `import ${n} from ${JSON.stringify(glyphs.get(n))};`),
    `export const EXPORTS = { ${names.join(', ')} };`,
    'export const FALLBACK = IconHelpCircle;',
    '',
  ].join('\n');
}
