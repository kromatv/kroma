import { describe, expect, it } from 'vitest';
import { type Commit, parseCommit } from './commits';
import { fallbackCanary, fallbackNote, hasReleasable, shapeProblem } from './notes-draft';

const commits = (...subjects: string[]): Commit[] =>
  subjects.flatMap((subject) => parseCommit('sha', subject) ?? []);

describe('fallbackNote', () => {
  it('lists features under New and fixes under Fixed, in the language’s headings', () => {
    const range = commits(
      'feat(tv): settings pane (#296)',
      'fix: a cast reaches the TV (#285)',
      'ci: x',
    );

    expect(fallbackNote(range, 'en')).toBe(
      '## New\n\n- settings pane (#296)\n\n## Fixed\n\n- a cast reaches the TV (#285)\n',
    );
    expect(fallbackNote(range, 'fr')).toContain('## Nouveautés');
    expect(fallbackNote(range, 'fr')).toContain('## Corrections');
  });

  it('leaves out a section with nothing in it', () => {
    expect(fallbackNote(commits('fix: one'), 'en')).toBe('## Fixed\n\n- one\n');
  });
});

describe('fallbackCanary', () => {
  it('lists what a user could notice', () => {
    expect(fallbackCanary(commits('feat: a (#1)', 'chore: b'))).toBe('- a (#1)\n');
  });

  it('says so when a build changed nothing anyone sees', () => {
    expect(fallbackCanary(commits('chore: b'))).toBe('Maintenance only.\n');
  });
});

describe('hasReleasable', () => {
  it('is true only for a feature, a fix or a performance change', () => {
    expect(hasReleasable(commits('docs: a', 'perf: b'))).toBe(true);
    expect(hasReleasable(commits('docs: a', 'refactor: b'))).toBe(false);
  });
});

describe('shapeProblem', () => {
  it('accepts the fixed headings in order', () => {
    expect(shapeProblem('## New\n\n### A\nText\n\n## Fixed\n\n- b\n', 'en')).toBeNull();
  });

  it('refuses a heading the server would not read', () => {
    expect(shapeProblem('## Highlights\n- a\n', 'en')).toBe("unknown heading '## Highlights'");
  });

  it('refuses the headings out of order', () => {
    expect(shapeProblem('## Corrections\n- a\n\n## Nouveautés\n- b\n', 'fr')).toBe(
      'headings out of order',
    );
  });

  it('refuses a note with no section', () => {
    expect(shapeProblem('Some prose.', 'en')).toBe('no section');
  });
});
