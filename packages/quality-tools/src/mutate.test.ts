import { describe, expect, it } from 'vitest';
import { mutationRuns, mutatorArguments } from './mutate';

const TRACKED = [
  'modules/tv.kroma.torrents/server/Cargo.toml',
  'modules/tv.kroma.torrents/server/src/dtos.rs',
  'modules/tv.kroma.torrents/server/src/tests.rs',
  'modules/tv.kroma.torrents/ui/src/page.tsx',
  'packages/core/src/hevc.fixtures.ts',
  'packages/core/src/hevc.test.ts',
  'packages/core/src/hevc.ts',
  'server/Cargo.toml',
  'server/crates/kroma-domain/Cargo.toml',
  'server/crates/kroma-domain/src/reports.rs',
];

describe('mutationRuns', () => {
  it('mutates a TypeScript package under its own vitest run, with room for a busy machine', () => {
    expect(mutationRuns('./packages/core/', TRACKED)).toEqual([
      {
        language: 'typescript',
        files: ['packages/core/src/hevc.ts'],
        testCommand: 'node_modules/.bin/vitest run --bail=1 packages/core',
        timeoutFactor: 30,
      },
    ]);
  });

  it('mutates a crate under cargo test, with room for the compile', () => {
    expect(mutationRuns('server/crates/kroma-domain', TRACKED)).toEqual([
      {
        language: 'rust',
        files: ['server/crates/kroma-domain/src/reports.rs'],
        testCommand: 'cargo test --manifest-path server/crates/kroma-domain/Cargo.toml',
        timeoutFactor: 300,
      },
    ]);
  });

  it('gives a module one run per language, and its crate the manifest below it', () => {
    const runs = mutationRuns('modules/tv.kroma.torrents', TRACKED);

    expect(runs.map((run) => run.language)).toEqual(['typescript', 'rust']);
    expect(runs.map((run) => run.files)).toEqual([
      ['modules/tv.kroma.torrents/ui/src/page.tsx'],
      ['modules/tv.kroma.torrents/server/src/dtos.rs'],
    ]);
    expect(runs[1]?.testCommand).toBe(
      'cargo test --manifest-path modules/tv.kroma.torrents/server/Cargo.toml',
    );
  });

  it('takes the manifest nearest the path when several sit under it', () => {
    const [run] = mutationRuns('server', TRACKED);

    expect(run?.testCommand).toBe('cargo test --manifest-path server/Cargo.toml');
  });

  it('refuses a path with nothing to mutate', () => {
    expect(() => mutationRuns('packages/ui', TRACKED)).toThrow(/no measured source file/);
  });

  it('refuses Rust sources with no manifest at or under the path', () => {
    expect(() => mutationRuns('server/crates/kroma-domain/src', TRACKED)).toThrow(
      /no Cargo.toml under/,
    );
  });

  it('refuses a path that could not go into a shell command as it is', () => {
    expect(() => mutationRuns('packages/core; rm -rf .', TRACKED)).toThrow(
      /not a package directory/,
    );
    expect(() => mutationRuns('', TRACKED)).toThrow(/not a package directory/);
  });
});

describe('mutatorArguments', () => {
  it('puts the options first, the caller options after them, and the files last', () => {
    const [run] = mutationRuns('packages/core', TRACKED);
    if (run === undefined) {
      throw new Error('expected a run');
    }

    expect(mutatorArguments(run, '--use-existing-coverage', ['--mutate-all'])).toEqual([
      '--use-existing-coverage',
      '--timeout-factor',
      '30',
      '--test-command',
      'node_modules/.bin/vitest run --bail=1 packages/core',
      '--mutate-all',
      'packages/core/src/hevc.ts',
    ]);
  });
});
