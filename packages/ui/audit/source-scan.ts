// What both source scanners stand on: which files to read, and how to reach the
// React Compiler.
//
// Nothing here names a directory, a workspace or a product. A scanner that knew
// the shape of one repo could only ever audit that repo, and the two rules these
// scanners carry - what a list allocates, what an animation costs - are not
// KROMA's. The caller supplies the trees and says where the compiler lives.

import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** Files a scan reads. */
interface SourceOptions {
  /** Defaults to TypeScript and TSX. */
  ext?: readonly string[];
  /** What never ships, so is never worth auditing. Defaults to tests, stories,
   *  demos and fixtures, matched as `.<word>.` in the filename. */
  skip?: RegExp;
}

const DEFAULT_EXT = ['.ts', '.tsx'] as const;
const DEFAULT_SKIP = /\.(test|spec|story|stories|demo|fixtures)\./;

/** Every shipped source file under `dir`, depth first. */
function* sourceFiles(dir: string, options: SourceOptions = {}): Generator<string> {
  const ext = options.ext ?? DEFAULT_EXT;
  const skip = options.skip ?? DEFAULT_SKIP;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(at, options);
    else if (ext.some((end) => entry.name.endsWith(end)) && !skip.test(entry.name)) yield at;
  }
}

interface BabelCore {
  transformAsync(src: string, options: object): Promise<{ code?: string } | null>;
}

/** A babel that can run the React Compiler, and the preset that lets it read
 *  TypeScript. Hand this to a scanner rather than letting it find its own. */
interface Babel {
  core: BabelCore;
  compiler: string;
  presetTs: string;
  /** Babel options for reading TS and TSX with no project config in the way. */
  parse(filename: string, plugins: unknown[]): object;
}

class NoCompiler extends Error {
  constructor(tried: readonly string[]) {
    super(
      `babel-plugin-react-compiler is not resolvable from any of: ${tried.join(', ')}. ` +
        'Pass `resolveFrom` a path inside the package that depends on it.',
    );
    this.name = 'NoCompiler';
  }
}

/**
 * Reach the React Compiler, and `@babel/core` through the compiler's own tree so
 * the two can never disagree on a version.
 *
 * `resolveFrom` is tried in order: each is any path inside a package that
 * depends on `babel-plugin-react-compiler`. A repo that hoists it can pass its
 * own root; one that declares it in a single workspace names that workspace.
 */
function babelAt(resolveFrom: readonly string[]): Babel {
  for (const from of resolveFrom) {
    let compiler: string;
    try {
      compiler = createRequire(from).resolve('babel-plugin-react-compiler');
    } catch {
      continue;
    }
    const own = createRequire(compiler);
    const presetTs = own.resolve('@babel/preset-typescript');
    const core = own('@babel/core') as BabelCore;
    return {
      core,
      compiler,
      presetTs,
      parse: (filename, plugins) => ({
        presets: [[presetTs, { isTSX: true, allExtensions: true }]],
        configFile: false,
        babelrc: false,
        filename,
        plugins,
      }),
    };
  }
  throw new NoCompiler(resolveFrom);
}

export type { Babel, BabelCore, SourceOptions };
export { babelAt, NoCompiler, sourceFiles };
