import { describe, expect, it } from 'vitest';
import {
  areaOf,
  cleanPath,
  isTestFile,
  isTestSupport,
  languageOf,
  sourceFiles,
  underPaths,
} from './sources';

describe('languageOf', () => {
  it('names the language the tools will read a file as', () => {
    expect(languageOf('server/src/main.rs')).toBe('rust');
    expect(languageOf('packages/ui/src/kit.tsx')).toBe('typescript');
    expect(languageOf('packages/lint-rules/src/index.mjs')).toBe('typescript');
    expect(languageOf('apps/kit/metro.config.cjs')).toBe('typescript');
  });

  it('has no language for what the tools do not measure', () => {
    expect(languageOf('README.md')).toBeUndefined();
    expect(languageOf('clients/tv-build/store-art.py')).toBeUndefined();
    expect(languageOf('packages/core/src/locales/en/common.json')).toBeUndefined();
  });
});

describe('isTestFile', () => {
  it('knows a test, a benchmark and a fixture by name', () => {
    expect(isTestFile('packages/core/src/hevc.test.ts')).toBe(true);
    expect(isTestFile('packages/core/src/hevc.native.test.ts')).toBe(true);
    expect(isTestFile('packages/ui/src/button.a11y.test.tsx')).toBe(true);
    expect(isTestFile('packages/lint-rules/src/cli.test.mjs')).toBe(true);
    expect(isTestFile('packages/spatial-nav/src/navigator.bench.ts')).toBe(true);
    expect(isTestFile('packages/core/src/direct/direct.fixture.ts')).toBe(true);
    expect(isTestFile('packages/ui/src/components/atoms/button/button.fixtures.tsx')).toBe(true);
  });

  it('knows the Rust spellings', () => {
    expect(isTestFile('server/src/api/it_playback.rs')).toBe(true);
    expect(isTestFile('server/crates/kroma-db/src/tests.rs')).toBe(true);
    expect(isTestFile('server/crates/kroma-db/src/media_tests.rs')).toBe(true);
    expect(isTestFile('server/crates/kroma-sandbox/tests/leaks.rs')).toBe(true);
    expect(isTestFile('tests/smoke.rs')).toBe(true);
  });

  it('leaves production code alone, even when its name mentions a test', () => {
    expect(isTestFile('packages/core/src/hevc.ts')).toBe(false);
    expect(isTestFile('packages/ci-tools/src/test.ts')).toBe(false);
    expect(isTestFile('server/crates/kroma-engine/src/latest.rs')).toBe(false);
    expect(isTestFile('server/crates/kroma-module-host/src/testing.rs')).toBe(false);
  });
});

describe('isTestSupport', () => {
  it('knows test support, demos and stories', () => {
    expect(isTestSupport('server/src/api/test_support.rs')).toBe(true);
    expect(isTestSupport('server/crates/kroma-testing/src/lib.rs')).toBe(true);
    expect(isTestSupport('packages/site-kit/src/testing/worker.ts')).toBe(true);
    expect(isTestSupport('packages/ui/src/components/atoms/button/button.demo.tsx')).toBe(true);
    expect(isTestSupport('packages/workbench/src/demos/list.tsx')).toBe(true);
    expect(isTestSupport('packages/workbench/src/stories/index.ts')).toBe(true);
  });

  it('is false for code that ships', () => {
    expect(isTestSupport('packages/core/src/hevc.ts')).toBe(false);
    expect(isTestSupport('server/crates/kroma-db/src/media.rs')).toBe(false);
  });
});

describe('sourceFiles', () => {
  it('keeps authored code and drops tests, fixtures, generated files and declarations', () => {
    const tracked = [
      '.github/scripts/label.ts',
      '.claude/skills/shots/run.ts',
      'README.md',
      'apps/www/src/routeTree.gen.ts',
      'packages/core/src/hevc.test.ts',
      'packages/core/src/hevc.ts',
      'packages/core/src/locales/messages.d.ts',
      'packages/ui/src/button.fixtures.tsx',
      'packages/ui/src/button.tsx',
      'server/src/api/it_auth.rs',
      'server/src/main.rs',
    ];

    expect(sourceFiles(tracked)).toEqual([
      'packages/core/src/hevc.ts',
      'packages/ui/src/button.tsx',
      'server/src/main.rs',
    ]);
  });

  it('keeps test support, which is measured and reported apart', () => {
    expect(sourceFiles(['server/src/api/test_support.rs'])).toEqual([
      'server/src/api/test_support.rs',
    ]);
  });
});

describe('cleanPath', () => {
  it('drops a leading ./ and any trailing slash', () => {
    expect(cleanPath('./packages/core//')).toBe('packages/core');
    expect(cleanPath('packages/core')).toBe('packages/core');
  });
});

describe('underPaths', () => {
  const files = ['packages/core/src/hevc.ts', 'packages/core-extra/src/a.ts', 'server/src/main.rs'];

  it('keeps every file when no path narrows the list', () => {
    expect(underPaths(files, [])).toEqual(files);
    expect(underPaths(files, ['.'])).toEqual(files);
  });

  it('keeps what is inside a directory, and not a sibling that shares its prefix', () => {
    expect(underPaths(files, ['./packages/core/'])).toEqual(['packages/core/src/hevc.ts']);
  });

  it('takes a file by its own path and several paths at once', () => {
    expect(underPaths(files, ['server/src/main.rs', 'packages/core-extra'])).toEqual([
      'packages/core-extra/src/a.ts',
      'server/src/main.rs',
    ]);
  });
});

describe('areaOf', () => {
  it('is the first two segments of a path', () => {
    expect(areaOf('clients/desktop/src-tauri/src/main.rs')).toBe('clients/desktop');
    expect(areaOf('server/crates/kroma-db/src/lib.rs')).toBe('server/crates');
    expect(areaOf('vitest.config.ts')).toBe('vitest.config.ts');
  });
});
