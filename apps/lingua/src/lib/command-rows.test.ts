import { describe, expect, it, vi } from 'vitest';
import { languageOf } from '#site/lib/language';
import { indexCommands, messageCommands, sectionCommands } from './command-rows';

describe('indexCommands', () => {
  it('lists each project, then its languages, searchable by tag and native name', () => {
    const rows = indexCommands([{ id: 'o/r', languages: [languageOf('de')] }], () => {});

    expect(rows.map((row) => [row.id, row.label, row.subtitle, row.keywords])).toEqual([
      ['project:o/r', 'o/r', 'Project · 1 language', undefined],
      ['language:o/r:de', 'German', 'Deutsch · de', 'de Deutsch'],
    ]);
  });

  it('opens the project or the language it names', () => {
    const open = vi.fn();
    const [project, language] = indexCommands([{ id: 'o/r', languages: [languageOf('fr')] }], open);

    void project?.run();
    void language?.run();

    expect(open.mock.calls).toEqual([
      [{ to: 'project', project: 'o/r' }],
      [{ to: 'language', project: 'o/r', locale: 'fr' }],
    ]);
  });
});

describe('sectionCommands', () => {
  it('opens each section of the language', () => {
    const open = vi.fn();
    const rows = sectionCommands(
      { project: 'o/r', locale: 'fr', language: 'French' },
      ['nav', 'admin/backup'],
      open,
    );

    void rows[1]?.run();

    expect(rows.map((row) => [row.label, row.subtitle])).toEqual([
      ['nav', 'Section · French'],
      ['admin/backup', 'Section · French'],
    ]);
    expect(open).toHaveBeenCalledWith({
      to: 'section',
      project: 'o/r',
      locale: 'fr',
      file: 'admin/backup',
    });
  });
});

describe('messageCommands', () => {
  it('shows each message the server found by its source, and keeps it whatever the menu matches', () => {
    const open = vi.fn();
    const rows = messageCommands(
      { project: 'o/r', locale: 'fr' },
      [
        { key: 'p.play', file: 'p', source: 'Play', text: 'Lire' },
        { key: 'p.stop', file: 'p', source: 'Stop', text: null },
      ],
      open,
    );

    void rows[0]?.run();

    expect(rows.map((row) => [row.label, row.subtitle, row.meta, row.always])).toEqual([
      ['Play', 'p.play', 'Lire', true],
      ['Stop', 'p.stop', 'Not translated', true],
    ]);
    expect(open).toHaveBeenCalledWith({
      to: 'section',
      project: 'o/r',
      locale: 'fr',
      file: 'p',
      key: 'p.play',
    });
  });
});
