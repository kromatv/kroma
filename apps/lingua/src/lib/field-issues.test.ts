import { describe, expect, it } from 'vitest';
import { fieldIssues } from './field-issues';
import { variablesOf } from './placeables';

describe('fieldIssues', () => {
  it('names each placeholder the source does not pass, as the text has them now', () => {
    const variables = variablesOf('Play {title}', 'Lire {titre} de {auteur}', { plural: false });

    expect(fieldIssues(variables, [])).toEqual([
      { level: 'error', code: 'unknown-token', detail: 'titre' },
      { level: 'error', code: 'unknown-token', detail: 'auteur' },
    ]);
  });

  it('drops what the last save said about placeholders once the text no longer has them', () => {
    const variables = variablesOf('Play {title}', 'Lire {title}', { plural: false });
    const found = [{ level: 'error', code: 'unknown-token', detail: 'titre' }] as const;

    expect(fieldIssues(variables, found)).toEqual([]);
  });

  it('keeps what the last save found beyond placeholders, and leaves a missing one to the variables line', () => {
    const variables = variablesOf('Play {title}', 'Lire', { plural: false });
    const found = [
      { level: 'warning', code: 'missing-token', detail: 'title' },
      { level: 'error', code: 'unknown-ref', detail: 'common.ok' },
    ] as const;

    expect(fieldIssues(variables, found)).toEqual([
      { level: 'error', code: 'unknown-ref', detail: 'common.ok' },
    ]);
  });
});
