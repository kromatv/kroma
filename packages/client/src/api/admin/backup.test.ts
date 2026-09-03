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
});
