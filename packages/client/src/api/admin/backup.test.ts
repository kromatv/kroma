import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordRequest } from '../../kroma-client.fixture';

const archive = new Blob(['zip'], { type: 'application/zip' });

describe('the backup endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'export',
      call: (c) => c.admin.backup.export(),
      method: 'GET',
      path: '/admin/backup/export',
    },
    {
      name: 'import',
      call: (c) => c.admin.backup.import(archive),
      method: 'POST',
      path: '/admin/backup/import',
    },
    {
      name: 'preview',
      call: (c) => c.admin.backup.preview(archive, { reset: true }),
      method: 'POST',
      path: '/admin/backup/import/preview',
    },
    {
      name: 'schedule',
      call: (c) => c.admin.backup.schedule(),
      method: 'GET',
      path: '/admin/backup/schedule',
    },
    {
      name: 'changeSchedule',
      call: (c) => c.admin.backup.changeSchedule({ enabled: true, keep: 3 }),
      method: 'PUT',
      path: '/admin/backup/schedule',
      body: { enabled: true, keep: 3 },
    },
  ])('$name', checkEndpoint);
});

describe('the backup password header', () => {
  it('carries the passphrase as UTF-8 hex, which a header can hold verbatim', async () => {
    const recorded = await recordRequest((c) => c.admin.backup.export('clé'));

    expect(recorded.headers.get('x-backup-password')).toBe('636cc3a9');
  });

  it('sends no password header for an unencrypted archive', async () => {
    const recorded = await recordRequest((c) => c.admin.backup.export());

    expect(recorded.headers.get('x-backup-password')).toBeNull();
  });

  it('flags a reset restore, and says nothing when the restore merges', async () => {
    const resetting = await recordRequest((c) => c.admin.backup.import(archive, { reset: true }));
    const merging = await recordRequest((c) => c.admin.backup.import(archive));

    expect(resetting.headers.get('x-backup-reset')).toBe('1');
    expect(merging.headers.get('x-backup-reset')).toBeNull();
  });

  it('asks a preview with the password and the reset of the restore it stands for', async () => {
    const recorded = await recordRequest((c) =>
      c.admin.backup.preview(archive, { password: 'clé', reset: true }),
    );

    expect(recorded.headers.get('x-backup-password')).toBe('636cc3a9');
    expect(recorded.headers.get('x-backup-reset')).toBe('1');
  });
});
