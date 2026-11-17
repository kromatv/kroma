import { describe, expect, it } from 'vitest';
import { LocaleInput, NamespaceInput, ProjectInput, readAs, SearchInput } from './loaders';

describe('readAs', () => {
  it('reads what a page asks for, and nothing a caller hung off it', () => {
    const sent = { id: 'o/r', locale: 'pt-BR', file: 'admin/backup', extra: 1 };

    expect(readAs(NamespaceInput)(sent)).toEqual({
      id: 'o/r',
      locale: 'pt-BR',
      file: 'admin/backup',
    });
  });

  it('finds nothing in an address that names no repository or no language', () => {
    const longTag = `fr-${'x'.repeat(8)}-${'y'.repeat(8)}-${'z'.repeat(8)}-${'w'.repeat(8)}`;
    const given = [
      readAs(ProjectInput)({ id: 'o r/x' }),
      readAs(ProjectInput)({ id: `o/${'r'.repeat(200)}` }),
      readAs(LocaleInput)({ id: 'o/r', locale: 'not a tag' }),
      readAs(LocaleInput)({ id: 'o/r', locale: longTag }),
    ];

    expect(given).toEqual([null, null, null, null]);
  });

  it('cuts a search at 200 characters', () => {
    const read = readAs(SearchInput);

    expect(read({ id: 'o/r', locale: 'fr', query: 'a'.repeat(500) })?.query).toHaveLength(200);
  });
});

describe('ProjectInput', () => {
  it('refuses an input that is not the shape a page sends', () => {
    const given = [undefined, 'o/r', { id: ['o/r'] }, { id: 7 }];

    expect(given.map((input) => ProjectInput.safeParse(input).success)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
