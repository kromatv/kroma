import { cleanPath, type Language, languageOf, sourceFiles, underPaths } from './sources';

export interface MutationRun {
  language: Language;
  files: string[];
  testCommand: string;
  timeoutFactor: number;
}

type CoverageFlag = '--use-existing-coverage' | '--no-coverage';

const PACKAGE_PATH = /^[\w@.-]+(?:\/[\w@.-]+)*$/;

const VITEST_TIMEOUT_FACTOR = 30;
const CARGO_TIMEOUT_FACTOR = 300;

const isManifest = (file: string) => file === 'Cargo.toml' || file.endsWith('/Cargo.toml');

function manifestUnder(target: string, tracked: readonly string[]): string {
  const [nearest] = underPaths(tracked.filter(isManifest), [target]).sort(
    (a, b) => a.length - b.length,
  );
  if (nearest === undefined) {
    throw new Error(`no Cargo.toml under ${target}: name the crate's own directory`);
  }
  return nearest;
}

/**
 * One mutator run per language found under a package directory, each with the
 * test command and the timeout factor that language needs here. The factors
 * are far above mutator's 10: a busy vitest run otherwise times out, and a
 * Rust mutant that is still compiling would count as killed.
 */
export function mutationRuns(path: string, tracked: readonly string[]): MutationRun[] {
  const target = cleanPath(path);
  if (!PACKAGE_PATH.test(target)) {
    throw new Error(`'${path}' is not a package directory`);
  }
  const files = underPaths(sourceFiles(tracked), [target]);
  const ofLanguage = (language: Language) => files.filter((file) => languageOf(file) === language);
  const runs: MutationRun[] = [];
  const scripts = ofLanguage('typescript');
  if (scripts.length > 0) {
    const testCommand = `node_modules/.bin/vitest run --bail=1 ${target}`;
    runs.push({
      language: 'typescript',
      files: scripts,
      testCommand,
      timeoutFactor: VITEST_TIMEOUT_FACTOR,
    });
  }
  const rust = ofLanguage('rust');
  if (rust.length > 0) {
    const testCommand = `cargo test --manifest-path ${manifestUnder(target, tracked)}`;
    runs.push({ language: 'rust', files: rust, testCommand, timeoutFactor: CARGO_TIMEOUT_FACTOR });
  }
  if (runs.length === 0) {
    throw new Error(`no measured source file under ${target}`);
  }
  return runs;
}

/** mutator's argument list for one run. `extra` comes last among the options, so a caller's flag wins. */
export function mutatorArguments(
  run: MutationRun,
  coverage: CoverageFlag,
  extra: readonly string[],
): string[] {
  return [
    coverage,
    '--timeout-factor',
    String(run.timeoutFactor),
    '--test-command',
    run.testCommand,
    ...extra,
    ...run.files,
  ];
}
