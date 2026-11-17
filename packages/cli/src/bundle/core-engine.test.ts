import { describe, expect, it } from 'vitest';
import {
  coreGrantProblem,
  coreSchemaFor,
  readTableVersions,
  type TableVersions,
} from './core-engine';

const versions: TableVersions = {
  version: 19,
  tables: {
    downloads: { changed: 19, broke: 1 },
    items: { changed: 5, broke: 5 },
    users: { changed: 1, broke: 1 },
    curated_old: { changed: 7, broke: 7, dropped: true },
  },
};

describe('coreSchemaFor', () => {
  it('is the newest version that last changed a table the grant names', () => {
    const scope = { read: ['items', 'users.username'], write: ['downloads'] };

    expect(coreSchemaFor(scope, versions)).toBe(19);
  });

  it('counts a column grant as a grant on its table', () => {
    expect(coreSchemaFor({ read: ['Items.title', 'users.email'] }, versions)).toBe(5);
  });

  it('is null for a module that reaches none of the core database', () => {
    expect(coreSchemaFor(undefined, versions)).toBeNull();
    expect(coreSchemaFor({ read: [], write: null }, versions)).toBeNull();
  });

  it('refuses a table the core schema does not have', () => {
    expect(() => coreSchemaFor({ read: ['notes.body'] }, versions)).toThrow(
      'storage.core names "notes", which the core schema at version 19 has no table of',
    );
  });

  it('refuses a table the core schema dropped', () => {
    expect(() => coreSchemaFor({ read: ['curated_old'] }, versions)).toThrow('"curated_old"');
  });
});

describe('readTableVersions', () => {
  it('reads the core schema this repository builds, downloads included', () => {
    const read = readTableVersions();

    expect(read.version).toBeGreaterThanOrEqual(19);
    expect(read.tables.downloads?.changed).toBeGreaterThanOrEqual(19);
  });
});

describe('coreGrantProblem', () => {
  it('says nothing about a grant whose tables the core schema has', () => {
    expect(coreGrantProblem({ read: ['downloads', 'users.username'] })).toBeNull();
  });

  it('names every table a grant reaches that the core schema does not have', () => {
    expect(coreGrantProblem({ read: ['ghosts'], write: ['phantoms.name'] })).toBe(
      'storage.core names "ghosts", "phantoms", which the core schema at version ' +
        `${readTableVersions().version} has no table of`,
    );
  });
});
