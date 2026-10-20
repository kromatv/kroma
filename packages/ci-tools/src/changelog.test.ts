import { describe, expect, it } from 'vitest';
import { prependSection, renderSection } from './changelog';
import { type Commit, parseCommit } from './commits';

const commits = (...subjects: string[]): Commit[] =>
  subjects.flatMap((subject) => parseCommit('0123456789abcdef', subject) ?? []);

describe('renderSection', () => {
  it('groups breaking changes, features and fixes, sorted by scope, and drops maintenance', () => {
    const section = renderSection(
      '0.2.0',
      '2026-10-20',
      commits('fix(web): b (#2)', 'chore: c', 'feat(api)!: a (#1)', 'fix(admin): d'),
    );

    expect(section).toBe(
      [
        '## 0.2.0 (2026-10-20)',
        '',
        '### Breaking changes',
        '',
        '- **api:** a ([#1](https://github.com/kromatv/kroma/pull/1))',
        '',
        '### Fixes',
        '',
        '- **admin:** d (012345678)',
        '- **web:** b ([#2](https://github.com/kromatv/kroma/pull/2))',
      ].join('\n'),
    );
  });

  it('says a release with nothing user-facing is maintenance only', () => {
    expect(renderSection('0.1.40', '2026-10-20', commits('chore: a'))).toContain(
      'Maintenance only.',
    );
  });
});

describe('prependSection', () => {
  it('starts a changelog that does not exist yet', () => {
    expect(prependSection('', '## 0.1.40')).toBe('# Changelog\n\n## 0.1.40\n');
  });

  it('puts the new release above the older ones', () => {
    expect(prependSection('# Changelog\n\n## 0.1.40\n', '## 0.1.41')).toBe(
      '# Changelog\n\n## 0.1.41\n\n## 0.1.40\n',
    );
  });
});
