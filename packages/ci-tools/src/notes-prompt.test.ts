import { describe, expect, it } from 'vitest';
import { releaseSystem, releaseTask } from './notes-prompt';

const sources = {
  skill: 'SKILL',
  guide: 'GUIDE',
  unslop: 'UNSLOP',
  previous: [{ lang: 'fr', text: '## Nouveautés' }],
  catalogs: [{ lang: 'fr', file: 'admin.json', text: '{"admin.title":"Administration"}' }],
};

describe('releaseSystem', () => {
  it('tells the writer it has no tools before the skill that assumes it does', () => {
    const system = releaseSystem(sources);

    expect(system.indexOf('You have no tools')).toBeLessThan(system.indexOf('SKILL'));
  });

  it('adds the writing rules the drafts kept breaking, after the skill they refine', () => {
    const system = releaseSystem(sources);

    expect(system.indexOf('<writing_rules>')).toBeGreaterThan(system.indexOf('UNSLOP'));
    expect(system).toContain('`nav.films` is Movies in English, Films in');
    expect(system).toContain('`#123:`');
  });

  it('carries the rules, the voice and the catalog, each in its own tag', () => {
    const system = releaseSystem(sources);

    expect(system).toContain(
      '<project_rules file="docs/release-notes.md">\nGUIDE\n</project_rules>',
    );
    expect(system).toContain('<previous_note lang="fr">\n## Nouveautés\n</previous_note>');
    expect(system).toContain('<catalog lang="fr" file="admin.json">');
  });
});

describe('releaseTask', () => {
  it('lists every change with its pull request, title, files and body', () => {
    const task = releaseTask('0.1.40', [
      {
        subject: 'feat(tv): settings pane',
        pr: 296,
        title: 'TV settings',
        files: ['a.ts'],
        body: 'Body',
      },
      { subject: 'fix: no pr', pr: null },
    ]);

    expect(task).toContain('KROMA 0.1.40');
    expect(task).toContain(
      '<change pr="296">\nsubject: feat(tv): settings pane\ntitle: TV settings\nfiles: a.ts\n\nBody\n</change>',
    );
    expect(task).toContain('<change>\nsubject: fix: no pr\n</change>');
  });

  it('asks for what was left out and what blocks the release', () => {
    const task = releaseTask('0.1.40', []);

    expect(task).toContain('`leftOut`');
    expect(task).toContain('`blockers`');
  });
});
