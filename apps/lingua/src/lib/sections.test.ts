import { describe, expect, it } from 'vitest';
import { sectionOf } from './sections';

describe('sectionOf', () => {
  it('files the home page and every project page under projects', () => {
    expect(['/', '/o/r', '/o/r/fr', '/o/r/fr/admin/backup'].map(sectionOf)).toEqual([
      'projects',
      'projects',
      'projects',
      'projects',
    ]);
  });

  it('names the contributions and status pages, with or without a trailing slash', () => {
    expect([sectionOf('/contributions'), sectionOf('/setup/')]).toEqual([
      'contributions',
      'status',
    ]);
  });

  it('puts a problem page in no section', () => {
    expect(sectionOf('/problem')).toBeNull();
  });
});
