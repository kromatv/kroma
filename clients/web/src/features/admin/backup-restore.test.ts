import { describe, expect, it } from 'vitest';
import { asksFirst, confirmLabelKey, toShow } from './backup-restore';

const films = [{ id: 'films', name: 'Films' }];

describe('whether a restore asks first which libraries it removes', () => {
  it('asks before a reset the owner has not seen the answer to', () => {
    expect(asksFirst({ reset: true }, null)).toBe(true);
  });

  it('does not ask again once the libraries were shown', () => {
    expect(asksFirst({ reset: true }, films)).toBe(false);
  });

  it('never asks before a restore that is not a reset', () => {
    expect(asksFirst({ reset: false }, null)).toBe(false);
    expect(asksFirst({}, null)).toBe(false);
  });
});

describe('what the answer to the question leads to', () => {
  it('shows the libraries a reset would remove', () => {
    expect(toShow(films)).toEqual(films);
  });

  it('shows nothing when the reset removes none, so the restore goes on', () => {
    expect(toShow([])).toBeNull();
  });
});

describe('the label of the confirm button', () => {
  it('says the import runs while it is busy', () => {
    expect(confirmLabelKey({ busy: true, removing: films })).toBe('admin.backupImporting');
  });

  it('says it removes once the libraries it removes are shown', () => {
    expect(confirmLabelKey({ busy: false, removing: films })).toBe('admin.backupRestoreRemove');
  });

  it('says restore before anything is shown', () => {
    expect(confirmLabelKey({ busy: false, removing: null })).toBe('admin.backupRestoreConfirm');
  });
});
