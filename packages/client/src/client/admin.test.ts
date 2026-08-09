import { describe, expect, it } from 'vitest';
import {
  adminBrowseFolders,
  adminJob,
  adminLogs,
  adminSettings,
  exportBackup,
  importBackup,
  listNotificationImages,
  pipelineElements,
  playHistory,
  runJob,
  terminateSession,
  topUsers,
  updateUser,
} from './admin';
import type { RequestContext } from './base';

function recordCtx() {
  const json: { path: string; init?: RequestInit }[] = [];
  const blob: { path: string; init?: RequestInit }[] = [];
  const ctx = {
    baseUrl: 'http://nas',
    json: async (path: string, init?: RequestInit) => {
      json.push({ path, init });
      return {} as never;
    },
    blob: async (path: string, init?: RequestInit) => {
      blob.push({ path, init });
      return new Blob();
    },
  } as unknown as RequestContext;
  return { ctx, json, blob };
}

describe('adminLogs', () => {
  it('builds no query with no filters', () => {
    const { ctx, json } = recordCtx();
    void adminLogs(ctx);
    expect(json[0]?.path).toBe('/admin/logs');
  });

  it('adds each present filter', () => {
    const { ctx, json } = recordCtx();
    void adminLogs(ctx, { level: 'warn', source: 'core', q: 'hi there', limit: 50 });
    expect(json[0]?.path).toBe('/admin/logs?level=warn&source=core&q=hi+there&limit=50');
  });
});

describe('pipelineElements', () => {
  it('omits empty filters but keeps page/limit 0 (they are meaningful)', () => {
    const { ctx, json } = recordCtx();
    void pipelineElements(ctx, { status: '', page: 0, limit: 0 });
    expect(json[0]?.path).toBe('/admin/pipeline/elements?page=0&limit=0');
  });

  it('includes text filters', () => {
    const { ctx, json } = recordCtx();
    void pipelineElements(ctx, { kind: 'item', q: 'dune' });
    expect(json[0]?.path).toBe('/admin/pipeline/elements?kind=item&q=dune');
  });
});

describe('simple query builders', () => {
  it('encodes the browse path, or omits it', () => {
    const { ctx, json } = recordCtx();
    void adminBrowseFolders(ctx, '/mnt/media');
    void adminBrowseFolders(ctx);
    expect(json[0]?.path).toBe('/admin/libraries/browse?path=%2Fmnt%2Fmedia');
    expect(json[1]?.path).toBe('/admin/libraries/browse');
  });

  it('defaults the stats day windows', () => {
    const { ctx, json } = recordCtx();
    void topUsers(ctx);
    void playHistory(ctx);
    void topUsers(ctx, 3);
    expect(json.map((c) => c.path)).toEqual([
      '/admin/stats/top-users?days=7',
      '/admin/stats/history?days=28',
      '/admin/stats/top-users?days=3',
    ]);
  });

  it('passes the settings view through', () => {
    const { ctx, json } = recordCtx();
    void adminSettings(ctx, 'media');
    expect(json[0]?.path).toBe('/admin/settings?view=media');
  });

  it('encodes the job key', () => {
    const { ctx, json } = recordCtx();
    void adminJob(ctx, 'sections.curate');
    void runJob(ctx, 'a b');
    expect(json[0]?.path).toBe('/admin/jobs/sections.curate');
    expect(json[1]).toMatchObject({ path: '/admin/jobs/a%20b/run', init: { method: 'POST' } });
  });
});

describe('bodies', () => {
  it('terminateSession defaults the message to empty', () => {
    const { ctx, json } = recordCtx();
    void terminateSession(ctx, 's 1');
    void terminateSession(ctx, 's2', 'stopped by admin');
    expect(json[0]?.path).toBe('/admin/sessions/s%201/stop');
    expect(JSON.parse(json[0]?.init?.body as string)).toEqual({ message: '' });
    expect(JSON.parse(json[1]?.init?.body as string)).toEqual({ message: 'stopped by admin' });
  });

  it('updateUser PATCHes the encoded id with its patch', () => {
    const { ctx, json } = recordCtx();
    void updateUser(ctx, 'u 1', { username: 'Max', permissions: ['playback'] });
    expect(json[0]).toMatchObject({ path: '/admin/users/u%201', init: { method: 'PATCH' } });
    expect(JSON.parse(json[0]?.init?.body as string)).toEqual({
      username: 'Max',
      permissions: ['playback'],
    });
  });
});

function payloadCtx(payload: unknown) {
  const paths: string[] = [];
  const ctx = {
    baseUrl: 'http://nas',
    json: async (path: string) => {
      paths.push(path);
      return payload as never;
    },
  } as unknown as RequestContext;
  return { ctx, paths };
}

describe('listNotificationImages', () => {
  it('parses the listing through the schema', async () => {
    const listing = {
      images: [
        {
          name: 'notif-a-w1280.webp',
          url: '/api/images/notif-a-w1280.webp',
          uploadedAt: 5,
          bytes: 9,
        },
      ],
    };
    const { ctx, paths } = payloadCtx(listing);
    await expect(listNotificationImages(ctx)).resolves.toEqual(listing);
    expect(paths[0]).toBe('/admin/notifications/images');
  });

  it('rejects a malformed listing', async () => {
    const { ctx } = payloadCtx({ images: [{ name: 1 }] });
    await expect(listNotificationImages(ctx)).rejects.toThrow();
  });
});

describe('backup password encoding (hexUtf8)', () => {
  it('exports without headers when no password is given', () => {
    const { ctx, blob } = recordCtx();
    void exportBackup(ctx);
    expect(blob[0]).toEqual({ path: '/admin/backup/export', init: undefined });
  });

  it('hex-encodes the password into the export header', () => {
    const { ctx, blob } = recordCtx();
    void exportBackup(ctx, 'pw'); // 'p'=0x70 'w'=0x77
    expect(blob[0]?.init?.headers).toEqual({ 'x-backup-password': '7077' });
  });

  it('sets password + reset headers on import', () => {
    const { ctx, json } = recordCtx();
    void importBackup(ctx, new Blob(['z']), { password: 'é', reset: true }); // é = C3 A9
    expect(json[0]?.path).toBe('/admin/backup/import');
    expect(json[0]?.init?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-backup-password': 'c3a9',
      'x-backup-reset': '1',
    });
  });
});
