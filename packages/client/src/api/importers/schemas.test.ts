import { describe, expect, it } from 'vitest';
import { ImporterList, ImportSignIn, ImportSurvey } from './schemas';

describe('the importer list', () => {
  it('reads an installed importer and one the registry offers', () => {
    const listed = ImporterList.parse({
      importers: [
        {
          id: 'tv.x.import',
          name: 'Reader',
          label: 'Other server',
          installed: true,
          running: true,
          fields: [{ key: 'password', label: 'field.password', type: 'string', secret: true }],
        },
        {
          id: 'tv.x.offered',
          name: 'Offered',
          icon: 'data:image/svg+xml;base64,PHN2Zy8+',
          installed: false,
          running: false,
          fields: [],
        },
      ],
    });

    expect(listed.importers.map((importer) => importer.installed)).toEqual([true, false]);
    expect(listed.importers[0]?.fields[0]?.secret).toBe(true);
    expect(listed.registryError).toBeUndefined();
  });

  it('keeps the reason the registry could not be read', () => {
    const listed = ImporterList.parse({ importers: [], registryError: 'registry unreachable' });

    expect(listed.registryError).toBe('registry unreachable');
  });
});

describe('a sign-in to another server', () => {
  it('reads a ready sign-in with the servers it reaches', () => {
    const signIn = ImportSignIn.parse({
      status: 'ready',
      signIn: 's-1',
      servers: [
        { id: 'srv', name: 'Living room', address: 'http://nas:8096' },
        { id: 'b', name: '' },
      ],
    });

    expect(signIn).toEqual({
      status: 'ready',
      signIn: 's-1',
      servers: [
        { id: 'srv', name: 'Living room', address: 'http://nas:8096' },
        { id: 'b', name: '' },
      ],
    });
  });

  it('reads a pending sign-in with the page to open', () => {
    const signIn = ImportSignIn.parse({
      status: 'pending',
      pending: 'p-7',
      url: 'https://account.example/link',
      expiresAt: 1_700_000_900,
    });

    expect(signIn).toEqual({
      status: 'pending',
      pending: 'p-7',
      url: 'https://account.example/link',
      expiresAt: 1_700_000_900,
    });
  });

  it('refuses a page to open that is not https', () => {
    const signIn = ImportSignIn.safeParse({
      status: 'pending',
      pending: 'p-7',
      url: 'javascript:alert(1)',
    });

    expect(signIn.success).toBe(false);
  });

  it('reads a refusal for a reason it does not know as other', () => {
    const known = ImportSignIn.parse({ status: 'refused', reason: 'credentials', message: 'no' });
    const newer = ImportSignIn.parse({ status: 'refused', reason: 'twoFactor' });

    expect(known).toEqual({ status: 'refused', reason: 'credentials', message: 'no' });
    expect(newer).toEqual({ status: 'refused', reason: 'other' });
  });
});

describe('a survey of another server', () => {
  const SURVEY = {
    libraries: [
      { id: '1', name: 'Films', kind: 'movies', folders: ['/data/movies'] },
      { id: '2', name: 'Albums', kind: 'music', folders: [] },
    ],
    users: [
      {
        id: '42',
        name: 'Ana',
        email: 'ana@example.org',
        signedIn: true,
        allLibraries: false,
        libraries: ['1'],
        finerLimits: ['rating'],
        stateLocked: true,
        stateNeeds: 'pin',
      },
    ],
    counts: { titles: 1204 },
    leftBehind: ['playlists'],
  };

  it('reads libraries, users, counts and what stays behind', () => {
    const survey = ImportSurvey.parse(SURVEY);

    expect(survey.users[0]).toEqual(SURVEY.users[0]);
    expect(survey.counts).toEqual({ titles: 1204 });
    expect(survey.leftBehind).toEqual(['playlists']);
  });

  it('reads a library kind it does not know as other', () => {
    const survey = ImportSurvey.parse(SURVEY);

    expect(survey.libraries.map((library) => library.kind)).toEqual(['movies', 'other']);
  });
});
