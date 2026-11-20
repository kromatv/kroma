export type Language = 'typescript' | 'rust';

const SCRIPT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

const NOT_AUTHORED = [/^\.(?:github|claude)\//, /\.d\.ts$/, /\.gen\.tsx?$/];

const TEST_FILE = [
  /\.(?:test|spec|bench)\.(?:ts|tsx|js|jsx|mjs|cjs)$/,
  /\.fixtures?\.tsx?$/,
  /(?:^|\/)(?:tests?|__tests__|fixtures?)\//,
  /(?:^|\/)it_[^/]*\.rs$/,
  /(?:^|\/)tests?\.rs$/,
  /_tests?\.rs$/,
];

const TEST_SUPPORT = [
  /test_support/,
  /\/testing\//,
  /kroma-testing/,
  /\/demos?\//,
  /\.demo\./,
  /\.stor(?:y|ies)\./,
  /\/stories\//,
];

const matches = (patterns: readonly RegExp[], path: string) =>
  patterns.some((pattern) => pattern.test(path));

export function languageOf(path: string): Language | undefined {
  if (path.endsWith('.rs')) {
    return 'rust';
  }
  return SCRIPT.test(path) ? 'typescript' : undefined;
}

/** A test, a benchmark or a fixture, by its name alone. The tools read these as production code, so they never see one. */
export const isTestFile = (path: string) => matches(TEST_FILE, path);

/** Code that ships in no build but is not a test file either: test support, demos and stories. Measured, then reported apart. */
export const isTestSupport = (path: string) => matches(TEST_SUPPORT, path);

/** The tracked files the tools measure: authored TypeScript, JavaScript and Rust, with tests and fixtures left out. */
export function sourceFiles(tracked: readonly string[]): string[] {
  return tracked.filter(
    (path) => languageOf(path) !== undefined && !matches(NOT_AUTHORED, path) && !isTestFile(path),
  );
}

/** A path as git spells it: no leading `./`, no trailing slash. */
export function cleanPath(path: string): string {
  let cleaned = path.startsWith('./') ? path.slice(2) : path;
  while (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/** `files` narrowed to the given files and directories. No path keeps them all. */
export function underPaths(files: readonly string[], paths: readonly string[]): string[] {
  const wanted = paths.map(cleanPath).filter((path) => path.length > 0 && path !== '.');
  if (wanted.length === 0) {
    return [...files];
  }
  return files.filter((file) =>
    wanted.some((path) => file === path || file.startsWith(`${path}/`)),
  );
}

/** The first two segments of a path, the grain the reports group by: `packages/core`, `server/crates`. */
export function areaOf(path: string): string {
  return path.split('/').slice(0, 2).join('/');
}

/**
 * The files a change is compared with for duplication: every source file in
 * a language the change touches, and the changed files themselves, since one
 * git does not track yet is in no source list.
 */
export function comparedSources(sources: readonly string[], changed: readonly string[]): string[] {
  const languages = new Set(changed.map(languageOf));
  return [...new Set([...sources, ...changed])].filter((file) => languages.has(languageOf(file)));
}
