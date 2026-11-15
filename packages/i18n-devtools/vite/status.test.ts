import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeSets, standing, vpn } from './sets.fixture.ts';
import { confirmMessage, describeStatus } from './status.ts';

afterEach(removeSets);

describe('how a locale stands', () => {
  it('counts what is missing, outdated and unreviewed, and names the keys behind the last two', () => {
    const set = standing();

    const answer = describeStatus(() => [set], { locale: 'en' });

    expect(answer).toEqual({
      refused: null,
      status: {
        locale: 'en',
        coverage: 0.75,
        missing: 1,
        outdated: 1,
        unreviewed: 1,
        sets: [{ scope: null, outdated: ['state.outdated'], unreviewed: ['state.machine'] }],
      },
    });
  });

  it('adds every set up and names a module by its scope', () => {
    const sets = [standing(), vpn()];

    const { status } = describeStatus(() => sets, { locale: 'en' });

    expect(status).toMatchObject({ coverage: 0.8, missing: 1 });
    expect(status?.sets[1]).toEqual({ scope: 'tv.kroma.vpn', outdated: [], unreviewed: [] });
  });

  it('holds the source language complete', () => {
    const set = standing();

    const { status } = describeStatus(() => [set], { locale: 'fr' });

    expect(status).toMatchObject({ coverage: 1, missing: 0, outdated: 0, unreviewed: 0 });
  });

  it('refuses a locale no set keeps a catalog for', () => {
    const set = standing();

    const answer = describeStatus(() => [set], { locale: 'de' });

    expect(answer).toEqual({ status: null, refused: 'no catalog is kept for de' });
  });

  it('refuses an ask that names no locale', () => {
    const set = standing();

    const answer = describeStatus(() => [set], {});

    expect(answer.refused).toContain('malformed');
  });

  it('says why where the catalogs cannot be read', () => {
    const set = standing();
    writeFileSync(join(set.dir, 'en/state.json'), '[]');

    const answer = describeStatus(() => [set], { locale: 'en' });

    expect(answer.refused).toContain('is not a flat map of strings');
  });

  it('says why where the sets themselves cannot be listed', () => {
    const offline = () => {
      throw 'no workspace';
    };

    const answer = describeStatus(offline, { locale: 'en' });

    expect(answer).toEqual({ status: null, refused: 'no workspace' });
  });
});

describe('confirming a translation as it reads', () => {
  it('settles an outdated translation and leaves every other one as it stood', () => {
    const set = standing();

    const answer = confirmMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'state.outdated',
    });

    expect(answer).toEqual({ settled: ['state.outdated'], refused: null });
    expect(describeStatus(() => [set], { locale: 'en' }).status).toMatchObject({
      outdated: 0,
      unreviewed: 1,
      sets: [{ scope: null, outdated: [], unreviewed: ['state.machine'] }],
    });
  });

  it('counts a machine translation as reviewed', () => {
    const set = standing();

    confirmMessage(() => [set], { scope: null, locale: 'en', key: 'state.machine' });

    expect(describeStatus(() => [set], { locale: 'en' }).status).toMatchObject({
      outdated: 1,
      unreviewed: 0,
    });
  });

  it('settles nothing for a translation that was already current', () => {
    const set = standing();

    const answer = confirmMessage(() => [set], { scope: null, locale: 'en', key: 'state.current' });

    expect(answer).toEqual({ settled: [], refused: null });
  });

  it('refuses a key the source language has no message for', () => {
    const set = standing();

    const answer = confirmMessage(() => [set], { scope: null, locale: 'en', key: 'state.gone' });

    expect(answer).toEqual({ settled: [], refused: 'state.gone is not a message of core' });
  });

  it('refuses a locale the set keeps no catalog for', () => {
    const set = standing();

    const answer = confirmMessage(() => [set], {
      scope: null,
      locale: 'de',
      key: 'state.outdated',
    });

    expect(answer).toEqual({ settled: [], refused: 'core has no catalog for de' });
  });

  it('refuses the source language, which has no translation to vouch for', () => {
    const set = standing();

    const answer = confirmMessage(() => [set], {
      scope: null,
      locale: 'fr',
      key: 'state.outdated',
    });

    expect(answer).toEqual({ settled: [], refused: 'fr is the source language' });
  });

  it('refuses a payload past the size bound', () => {
    const set = standing();

    const answer = confirmMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'state.outdated',
      padding: 'x'.repeat(60_000),
    });

    expect(answer).toEqual({ settled: [], refused: 'the request is too large' });
    expect(describeStatus(() => [set], { locale: 'en' }).status?.outdated).toBe(1);
  });

  it('says why where the catalogs cannot be read', () => {
    const set = standing();
    writeFileSync(join(set.dir, 'fr/state.json'), '[]');

    const answer = confirmMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'state.outdated',
    });

    expect(answer.refused).toContain('is not a flat map of strings');
  });
});
