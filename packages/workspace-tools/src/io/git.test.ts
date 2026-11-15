import { describe, expect, it } from 'vitest';
import { changedFiles, type Exec } from './git';

const empty: Exec = () => '';

const padded: Exec = () => '\nserver/Cargo.toml\n  \n';

const listing: Exec = () => 'server/src/main.rs\npackages/ui/src/index.ts\n';

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
    expect(changedFiles('HEAD~1..HEAD', listing)).toEqual([
      'server/src/main.rs',
      'packages/ui/src/index.ts',
    ]);
  });

  it('drops the blank line git leaves at the end rather than reporting it', () => {
    expect(changedFiles('HEAD~1..HEAD', padded)).toEqual(['server/Cargo.toml']);
  });

  it('reads a range that changed nothing as no files', () => {
    expect(changedFiles('HEAD..HEAD', empty)).toEqual([]);
  });
});
