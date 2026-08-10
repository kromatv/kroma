import { describe, expect, it } from 'vitest';
import {
  ClientTestResult,
  DownloadClientsView,
  DownloadsView,
  DownloadView,
  NamingView,
  OrganizePlan,
  OrganizeResult,
  SaveDownloadClientBody,
} from './schemas';

const download = {
  id: 'd1',
  clientId: 'c1',
  clientName: 'rqbit',
  requestId: null,
  kind: 'movie',
  title: 'The Matrix',
  releaseTitle: 'The.Matrix.1999.1080p',
  season: null,
  episodes: null,
  status: 'downloading',
  progress: 0.42,
  downBps: 1024,
  upBps: 0,
  peers: 7,
  peersSeen: 30,
  sizeBytes: 8589934592,
  score: 2100,
  error: null,
  grabbedAt: 1,
  completedAt: null,
  importedAt: null,
  indexerName: 'Tracker',
  detailsUrl: null,
  infoHash: 'ABC',
  posterUrl: null,
  localId: null,
};

describe('DownloadsView', () => {
  it('parses a queue with no VPN module installed', () => {
    const view = DownloadsView.parse({ downloads: [download], vpn: null });
    expect(view.downloads).toHaveLength(1);
    expect(view.downloads[0]?.progress).toBe(0.42);
    expect(view.vpn).toBeNull();
  });

  it('carries the VPN module status when it is installed', () => {
    const view = DownloadsView.parse({
      downloads: [],
      vpn: { connected: true, exitIp: '198.51.100.9', paused: false },
    });
    expect(view.vpn).toEqual({ connected: true, exitIp: '198.51.100.9', paused: false });
  });

  it('rejects a VPN status that is missing a field', () => {
    expect(() =>
      DownloadsView.parse({ downloads: [], vpn: { connected: true, exitIp: null } }),
    ).toThrow();
  });

  it('rejects a download whose nullable ids are absent rather than null', () => {
    const { requestId, ...withoutRequestId } = download;
    expect(requestId).toBeNull();
    expect(() => DownloadView.parse(withoutRequestId)).toThrow();
  });
});

describe('download clients', () => {
  const client = {
    id: 'c1',
    kind: 'qbittorrent',
    name: 'Seedbox',
    url: 'http://box.local:8080',
    username: 'admin',
    hasPassword: true,
    enabled: true,
    priority: 10,
    createdAt: 1,
    builtin: false,
  };

  it('never exposes the stored password, only whether there is one', () => {
    const view = DownloadClientsView.parse({
      clients: [{ ...client, password: 'hunter2' }],
      rqbitCompiled: false,
    });
    expect(view.clients[0]).not.toHaveProperty('password');
    expect(view.clients[0]?.hasPassword).toBe(true);
  });

  it('takes a save body whose every field is a nullable patch', () => {
    const body = SaveDownloadClientBody.parse({
      kind: null,
      name: 'Renamed',
      url: null,
      username: null,
      password: null,
      enabled: null,
      priority: null,
    });
    expect(body.name).toBe('Renamed');
    expect(body.password).toBeNull();
  });

  it('reads a connection test as ok plus a version or an error', () => {
    expect(ClientTestResult.parse({ ok: true, version: '4.6.0', error: null }).version).toBe(
      '4.6.0',
    );
    expect(ClientTestResult.parse({ ok: false, version: null, error: 'refused' }).ok).toBe(false);
  });
});

describe('naming and organize', () => {
  it('parses the templates with their rendered sample', () => {
    const view = NamingView.parse({
      templates: {
        movieFolder: '{title} ({year})',
        movieFile: '{title}',
        seriesFolder: '{title}',
        seasonFolder: 'Season {season}',
        episodeFile: '{title} S{season}E{episode}',
        case: 'title',
      },
      sample: { movie: 'The Matrix (1999)', episode: 'Show S01E01' },
    });
    expect(view.templates.seasonFolder).toBe('Season {season}');
    expect(view.sample.episode).toBe('Show S01E01');
  });

  it('parses a preview plan and the result of applying it', () => {
    const plan = OrganizePlan.parse({
      moves: [{ title: 'The Matrix', kind: 'movie', from: '/a.mkv', to: '/b.mkv' }],
      totalFiles: 10,
      matching: 9,
    });
    expect(plan.moves[0]?.to).toBe('/b.mkv');

    const result = OrganizeResult.parse({ moved: 1, failed: 1, errors: ['permission denied'] });
    expect(result.errors).toEqual(['permission denied']);
  });
});
