import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

type Exports = Record<string, unknown>;

interface Bundled {
  name: string;
  dir: string;
  exports: Exports;
}

const SCOPE = '@kromatv/';

export function declarations(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((at) => {
    const path = join(dir, at.name);
    if (at.isDirectory()) return declarations(path);
    return at.name.endsWith('.d.ts') ? [path] : [];
  });
}

export function bundledPackages(packagesRoot: string, dependencies: Record<string, string>) {
  return Object.keys(dependencies)
    .filter((name) => name.startsWith(SCOPE))
    .map((name): Bundled => {
      const dir = name.slice(SCOPE.length);
      const manifest = JSON.parse(readFileSync(join(packagesRoot, dir, 'package.json'), 'utf8'));
      return { name, dir, exports: manifest.exports ?? {} };
    });
}

const isSource = (target: unknown): target is string =>
  typeof target === 'string' && /\.tsx?$/.test(target);

export function workspacePaths(bundled: Bundled[]): Record<string, string[]> {
  return Object.fromEntries(
    bundled.flatMap(({ name, dir, exports }) =>
      Object.entries(exports)
        .filter(([, target]) => isSource(target))
        .map(([key, target]) => [`${name}${key.slice(1)}`, [`../${dir}/${target as string}`]]),
    ),
  );
}

function target(pkg: Bundled, subpath: string): string | undefined {
  const key = `.${subpath}`;
  const exact = pkg.exports[key];
  if (isSource(exact)) return exact;
  for (const [pattern, to] of Object.entries(pkg.exports)) {
    const star = pattern.indexOf('*');
    if (star < 0 || !isSource(to)) continue;
    const head = pattern.slice(0, star);
    const tail = pattern.slice(star + 1);
    if (key.startsWith(head) && key.endsWith(tail) && key.length >= pattern.length - 1) {
      return to.replaceAll('*', key.slice(head.length, key.length - tail.length));
    }
  }
  return undefined;
}

const SPECIFIER = /(['"])@kromatv\/([\w-]+)((?:\/[^'"]*)?)\1/g;

export function internalizeWorkspaceSpecifiers(distDir: string, bundled: Bundled[]): void {
  const byDir = new Map(bundled.map((pkg) => [pkg.dir, pkg]));
  for (const file of declarations(distDir)) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(SPECIFIER, (whole, quote, dir, subpath) => {
      const pkg = byDir.get(dir);
      const to = pkg && target(pkg, subpath);
      if (!pkg || !to) return whole;
      const inside = join(distDir, pkg.dir, to.replace(/\.tsx?$/, ''));
      const path = relative(dirname(file), inside);
      const specifier = path.startsWith('.') ? path : `./${path}`;
      return `${quote}${specifier}${quote}`;
    });
    if (after !== before) writeFileSync(file, after);
  }
}

export function workspaceSpecifiersIn(distDir: string): string[] {
  return declarations(distDir).filter((file) =>
    new RegExp(String.raw`(?:from|import)\s*\(?\s*['"]${SCOPE}`).test(readFileSync(file, 'utf8')),
  );
}
