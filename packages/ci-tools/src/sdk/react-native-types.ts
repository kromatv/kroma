import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

/** Where the preset points `react-native` and its deep paths: the entry the
 *  package names, inside the copied tree. */
export const REACT_NATIVE_PATHS = {
  'react-native': ['./types/react-native/types/index.d.ts'],
  'react-native/*': ['./types/react-native/*'],
} as const;

function declarationFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...declarationFiles(path));
    } else if (entry.name.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Copies every declaration file of the React Native the kit is typed against
 * (the tvOS fork, resolved from the kit's own tree) under `outDir`, keeping the
 * package's layout so `types/index.d.ts` still reaches `../Libraries/**`. A
 * module then types against the kit without installing React Native, which
 * with its toolchain is most of a 250 MB `node_modules`.
 */
export function stageReactNativeTypes(uiDir: string, outDir: string): number {
  const require = createRequire(join(uiDir, 'package.json'));
  const from = dirname(require.resolve('react-native/package.json'));
  const entry = join(from, 'types', 'index.d.ts');
  if (!existsSync(entry)) throw new Error(`${from}: no types/index.d.ts to ship`);
  const files = declarationFiles(from);
  for (const file of files) {
    const to = join(outDir, relative(from, file));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(file, to);
  }
  return files.length;
}
