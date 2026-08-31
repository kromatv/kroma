import { describe, expect, it } from 'vitest';
import { changedFiles, type Exec } from './git';

describe('the files a range changed', () => {
  it('asks git for names only, over the range it was handed', () => {
    const seen: Array<[string, string[]]> = [];
    const exec: Exec = (cmd, args) => {
      seen.push([cmd, args]);
      return '';
    };

    changedFiles('v0.1.38..HEAD', exec);

    expect(seen).toEqual([['git', ['diff', '--name-only', 'v0.1.38..HEAD']]]);
  });

  it('reads one repo-relative path per line', () => {
    const exec: Exec = () => 'server/src/main.rs\npackages/ui/src/index.ts\n';

    expect(changedFiles('HEAD~1..HEAD', exec)).toEqual([
      'server/src/main.rs',
      'packages/ui/src/index.ts',
    ]);
  });

  it('drops the blank line git leaves at the end rather than reporting it', () => {
    const exec: Exec = () => '\nserver/Cargo.toml\n  \n';

    expect(changedFiles('HEAD~1..HEAD', exec)).toEqual(['server/Cargo.toml']);
  });

  it('reads a range that changed nothing as no files', () => {
    const exec: Exec = () => '';

    expect(changedFiles('HEAD..HEAD', exec)).toEqual([]);
  });
});
