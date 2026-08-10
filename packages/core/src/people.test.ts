import type { Metadata } from '@kroma/client';
import { describe, expect, it } from 'vitest';
import type { Translate } from './i18n';
import {
  creditsPerson,
  jobLabel,
  personDisplayName,
  personInvolvement,
  roleLabels,
} from './people';

// Echoes the key, so role labels are asserted by key.
const t: Translate = (key) => key;

function meta(p: {
  cast?: { name: string; profileUrl?: string | null }[];
  crew?: { name: string; job: string; profileUrl?: string | null }[];
}): Metadata {
  return { cast: p.cast ?? [], crew: p.crew ?? [] } as unknown as Metadata;
}

describe('creditsPerson', () => {
  const m = meta({
    cast: [{ name: 'Ana de Armas' }],
    crew: [{ name: 'Denis Villeneuve', job: 'Director' }],
  });

  it('matches a cast member case-insensitively and trimmed', () => {
    expect(creditsPerson(m, '  ana DE armas ')).toBe(true);
  });

  it('matches a crew member', () => {
    expect(creditsPerson(m, 'Denis Villeneuve')).toBe(true);
  });

  it('returns false for an uncredited name', () => {
    expect(creditsPerson(m, 'Someone Else')).toBe(false);
  });

  it('returns false for null metadata or a blank name', () => {
    expect(creditsPerson(null, 'Ana de Armas')).toBe(false);
    expect(creditsPerson(undefined, 'Ana de Armas')).toBe(false);
    expect(creditsPerson(m, '   ')).toBe(false);
  });

  it('tolerates metadata that carries no credit lists at all', () => {
    expect(creditsPerson({} as Metadata, 'Ana de Armas')).toBe(false);
  });
});

describe('personInvolvement', () => {
  it('aggregates acted flag, distinct jobs (first-seen order) and first profile photo', () => {
    const metas = [
      meta({ cast: [{ name: 'Greta Gerwig' }] }),
      meta({
        crew: [
          { name: 'Greta Gerwig', job: 'Director', profileUrl: '/gg.jpg' },
          { name: 'Greta Gerwig', job: 'Writer' },
        ],
      }),
      meta({ crew: [{ name: 'greta gerwig', job: 'Director', profileUrl: '/other.jpg' }] }),
    ];
    const inv = personInvolvement(metas, 'Greta Gerwig');
    expect(inv.acted).toBe(true);
    expect(inv.jobs).toEqual(['Director', 'Writer']);
    expect(inv.profileUrl).toBe('/gg.jpg');
  });

  it('skips null metadata entries', () => {
    const inv = personInvolvement([null, undefined, meta({ cast: [{ name: 'X' }] })], 'X');
    expect(inv.acted).toBe(true);
    expect(inv.jobs).toEqual([]);
    expect(inv.profileUrl).toBeNull();
  });

  it('walks past crew credits that name someone else', () => {
    const inv = personInvolvement(
      [
        meta({
          crew: [
            { name: 'Someone Else', job: 'Director' },
            { name: 'Z', job: 'Writer' },
          ],
        }),
      ],
      'Z',
    );
    expect(inv.jobs).toEqual(['Writer']);
  });

  it('reports no involvement for an unknown person', () => {
    const inv = personInvolvement([meta({ cast: [{ name: 'X' }] })], 'Y');
    expect(inv).toEqual({ acted: false, jobs: [], profileUrl: null });
  });

  it('takes the profile photo from the cast credit that carries one', () => {
    const inv = personInvolvement(
      [
        meta({ cast: [{ name: 'Z' }] }),
        meta({ cast: [{ name: 'Z', profileUrl: '/z.jpg' }] }),
        meta({ cast: [{ name: 'Z', profileUrl: '/later.jpg' }] }),
      ],
      'Z',
    );
    expect(inv.profileUrl).toBe('/z.jpg');
  });

  it('tolerates metadata that carries no credit lists at all', () => {
    expect(personInvolvement([{} as Metadata], 'Z')).toEqual({
      acted: false,
      jobs: [],
      profileUrl: null,
    });
  });

  it('takes the profile photo from a crew credit when cast has none', () => {
    const inv = personInvolvement(
      [
        meta({
          cast: [{ name: 'Z', profileUrl: null }],
          crew: [{ name: 'Z', job: 'Writer', profileUrl: '/z.jpg' }],
        }),
      ],
      'Z',
    );
    expect(inv.profileUrl).toBe('/z.jpg');
  });
});

describe('personDisplayName', () => {
  it('recovers the original casing from the credits', () => {
    const metas = [meta({ cast: [{ name: 'Timothée Chalamet' }] })];
    expect(personDisplayName(metas, 'timothée chalamet')).toBe('Timothée Chalamet');
  });

  it('recovers casing from crew when not in cast', () => {
    const metas = [meta({ crew: [{ name: 'Hans Zimmer', job: 'Composer' }] })];
    expect(personDisplayName(metas, 'HANS ZIMMER')).toBe('Hans Zimmer');
  });

  it('falls back to the given name when uncredited', () => {
    expect(personDisplayName([meta({ cast: [{ name: 'A' }] })], 'unknown')).toBe('unknown');
  });

  it('walks past null entries and credits that name someone else', () => {
    const metas = [
      null,
      {} as Metadata,
      meta({ cast: [{ name: 'A' }], crew: [{ name: 'B', job: 'Director' }] }),
      meta({ crew: [{ name: 'Hans Zimmer', job: 'Composer' }] }),
    ];
    expect(personDisplayName(metas, 'hans zimmer')).toBe('Hans Zimmer');
  });
});

describe('roleLabels', () => {
  it('prepends the actor role then each distinct crew job, de-duplicated', () => {
    const labels = roleLabels(t, { acted: true, jobs: ['Director', 'Writer'], profileUrl: null });
    expect(labels).toEqual(['person.role.actor', 'person.role.director', 'person.role.writer']);
  });

  it('omits the actor role when the person only crewed', () => {
    const labels = roleLabels(t, { acted: false, jobs: ['Creator'], profileUrl: null });
    expect(labels).toEqual(['person.role.creator']);
  });

  it('de-duplicates identical resolved labels', () => {
    const labels = roleLabels(t, { acted: false, jobs: ['Gaffer', 'Gaffer'], profileUrl: null });
    expect(labels).toEqual(['Gaffer']);
  });
});

describe('jobLabel', () => {
  it('translates known TMDB jobs', () => {
    expect(jobLabel(t, 'Director')).toBe('person.role.director');
    expect(jobLabel(t, 'Writer')).toBe('person.role.writer');
    expect(jobLabel(t, 'Creator')).toBe('person.role.creator');
  });

  it('returns an unknown job verbatim', () => {
    expect(jobLabel(t, 'Best Boy')).toBe('Best Boy');
  });
});
