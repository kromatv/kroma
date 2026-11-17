import { describe, expect, it } from 'vitest';
import { anyReading, repositoriesState, syncFacts, whileDriven } from './sync-facts';

describe('syncFacts', () => {
  it('reads a repository holding its branch head as up to date', () => {
    expect(syncFacts({ kind: 'current' })).toEqual({
      tone: 'success',
      label: 'Up to date',
      ratio: null,
      detail: null,
    });
  });

  it('says how many changed files a sync has read', () => {
    expect(syncFacts({ kind: 'reading', progress: { done: 10, total: 40 } })).toEqual({
      tone: 'warning',
      label: 'Syncing',
      ratio: 0.25,
      detail: 'Read 10 of 40 changed files',
    });
  });

  it('reads as syncing before a pass has counted the files, or while the page drives one', () => {
    expect(syncFacts({ kind: 'reading', progress: null })).toMatchObject({
      label: 'Syncing',
      ratio: null,
      detail: 'Reading the latest changes',
    });
    expect(syncFacts(whileDriven({ kind: 'current' }))).toMatchObject({ label: 'Syncing' });
  });

  it('has no ratio for a sync that counted nothing', () => {
    expect(syncFacts({ kind: 'reading', progress: { done: 0, total: 0 } }).ratio).toBeNull();
  });

  it('says why a sync stopped, and that a new repository is not read yet', () => {
    expect(syncFacts({ kind: 'failed', error: 'GitHub said 404' })).toMatchObject({
      tone: 'danger',
      detail: 'GitHub said 404',
    });
    expect(syncFacts({ kind: 'waiting' })).toMatchObject({
      tone: 'neutral',
      label: 'Not read yet',
    });
  });
});

describe('whileDriven', () => {
  it('reads as reading, keeping what a pass already counted', () => {
    const counted = { kind: 'reading', progress: { done: 1, total: 2 } } as const;

    expect(whileDriven({ kind: 'failed', error: 'x' })).toEqual({
      kind: 'reading',
      progress: null,
    });
    expect(whileDriven(counted)).toBe(counted);
  });
});

describe('anyReading', () => {
  it('is true while one repository still reads', () => {
    expect(anyReading([{ kind: 'current' }, { kind: 'reading', progress: null }])).toBe(true);
    expect(anyReading([{ kind: 'current' }, { kind: 'failed', error: 'x' }])).toBe(false);
  });
});

describe('repositoriesState', () => {
  it('is working while one reads, never to do', () => {
    expect(
      repositoriesState([
        { kind: 'failed', error: 'x' },
        { kind: 'reading', progress: null },
      ]),
    ).toBe('working');
  });

  it('is done once every repository holds its branch, and to do otherwise or with none', () => {
    expect(repositoriesState([{ kind: 'current' }, { kind: 'current' }])).toBe('done');
    expect(repositoriesState([{ kind: 'current' }, { kind: 'waiting' }])).toBe('todo');
    expect(repositoriesState([])).toBe('todo');
  });
});
