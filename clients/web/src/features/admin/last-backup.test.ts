import { describe, expect, it } from 'vitest';
import { backupJob } from './backup-job.fixture';
import { lastBackup } from './last-backup';

describe('the last scheduled backup', () => {
  it('failed with the reason its run gave', () => {
    const last = lastBackup(backupJob({ status: 'failed', error: '/mnt/nas is not there' }));

    expect(last).toEqual({ kind: 'failed', at: 1_795_000_000_000, error: '/mnt/nas is not there' });
  });

  it('was saved when its run succeeded', () => {
    const last = lastBackup(backupJob({ status: 'success' }));

    expect(last).toEqual({ kind: 'saved', at: 1_795_000_000_000 });
  });

  it('is none while a run is still going', () => {
    const last = lastBackup(backupJob({ status: 'running' }));

    expect(last).toEqual({ kind: 'none' });
  });

  it('is none for a task that never ran', () => {
    const last = lastBackup(backupJob(null));

    expect(last).toEqual({ kind: 'none' });
  });

  it('is none before the task has been read', () => {
    const last = lastBackup(undefined);

    expect(last).toEqual({ kind: 'none' });
  });
});
