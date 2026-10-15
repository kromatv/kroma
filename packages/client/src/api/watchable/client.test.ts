import { describe, expect, it } from 'vitest';
import { recordingClient } from '../../kroma-client.fixture';
import { download, SINTEL, watch } from './client.fixture';

const PROGRESS = {
  progress: 0.42,
  downBps: 256000,
  upBps: 51200,
  peers: 4,
  peersSeen: 31,
  pieces: [100, 100, 37, 0],
};

const STARTED = { downloadId: '9619ccec50f68056', release: 'Sintel.2010.720p', reused: false };

const PROBE = {
  durationMs: 888064,
  video: { codec: 'h264', width: 1024, height: 436 },
  audio: [{ index: 0, codec: 'aac', channels: 2, language: 'eng' }],
};

describe('starting a film', () => {
  it('reads the download the server picked', async () => {
    const { client } = recordingClient(() => ({ json: STARTED }));

    await expect(watch(client).start(SINTEL)).resolves.toEqual({ kind: 'started', ...STARTED });
  });

  it("carries the server's words when it found no release", async () => {
    const { client } = recordingClient(() => ({
      ok: false,
      status: 422,
      json: { error: 'Aucune release trouvée' },
    }));

    await expect(watch(client).start(SINTEL)).resolves.toEqual({
      kind: 'noRelease',
      message: 'Aucune release trouvée',
    });
  });

  it('reads a refusal no indexer could answer as the server, not the title', async () => {
    const { client } = recordingClient(() => ({
      ok: false,
      status: 422,
      json: {
        error: "no-indexer-answered: Internet Archive: definition 'internetarchive' missing",
      },
    }));

    await expect(watch(client).start(SINTEL)).resolves.toEqual({
      kind: 'noIndexer',
      message: "Internet Archive: definition 'internetarchive' missing",
    });
  });

  it('reads a refusal with no message as one the screen words itself', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 422, json: {} }));

    await expect(watch(client).start(SINTEL)).resolves.toEqual({
      kind: 'noRelease',
      message: null,
    });
  });

  it('reads a server that stopped waiting on the indexers as a start still going', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 504, json: {} }));

    await expect(watch(client).start(SINTEL)).resolves.toEqual({ kind: 'timedOut' });
  });

  it('refuses a download id the server left empty', async () => {
    const { client } = recordingClient(() => ({ json: { ...STARTED, downloadId: '' } }));

    await expect(watch(client).start(SINTEL)).rejects.toThrow();
  });
});

describe('probing a file', () => {
  it('reads the streams the server found', async () => {
    const { client } = recordingClient(() => ({ json: PROBE }));

    await expect(watch(client).probe(download, 5)).resolves.toMatchObject({
      durationMs: 888064,
      video: { codec: 'h264', width: 1024, height: 436 },
      audio: [{ index: 0, codec: 'aac', channels: 2, language: 'eng' }],
    });
  });

  it('answers pending while the stream cannot be read yet', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 503, json: { error: 'x' } }));

    await expect(watch(client).probe(download, 5)).resolves.toBe('pending');
  });
});

describe('following a file as it arrives', () => {
  it('reads the figures and the slices the source reported', async () => {
    const declared = {
      progress: 0.42,
      figures: { downloaded: 0.42, speed: 318_000, sources: [31, 498] },
      slices: [100, 98, 0],
    };
    const { client } = recordingClient(() => ({ json: declared }));

    await expect(watch(client).progress(download, 5, 4)).resolves.toMatchObject(declared);
  });

  it('reads which slices the source is asking for beside the ones it holds', async () => {
    const { client } = recordingClient(() => ({
      json: { progress: 0.1, slices: [100, 0, 0, 0], arriving: [1, 3] },
    }));

    const read = await watch(client).progress(download, 5, 4);

    expect(read.arriving).toEqual([1, 3]);
  });

  it('reads a payload carrying only the older field names without dropping any of it', async () => {
    const { client } = recordingClient(() => ({ json: PROGRESS }));

    await expect(watch(client).progress(download, 5, 4)).resolves.toEqual({
      ...PROGRESS,
      figures: {},
      arriving: [],
    });
  });
});

describe('reading a subtitle track', () => {
  const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
  const TRACK = { id: download, file: 5, index: 2, token: 'tok' };

  it('reads the cues found so far as partial while the module says the file is arriving', async () => {
    const { client } = recordingClient(() => ({ text: VTT, headers: { 'X-Kroma-Partial': '1' } }));

    await expect(watch(client).subtitles(TRACK)).resolves.toEqual({ vtt: VTT, partial: true });
  });

  it('reads a track the module has finished as complete', async () => {
    const { client } = recordingClient(() => ({ text: VTT, headers: { 'X-Kroma-Partial': '0' } }));

    await expect(watch(client).subtitles(TRACK)).resolves.toEqual({ vtt: VTT, partial: false });
  });

  it('reads a track from a module that names no partial state as complete', async () => {
    const { client } = recordingClient(() => ({ text: VTT }));

    await expect(watch(client).subtitles(TRACK)).resolves.toEqual({ vtt: VTT, partial: false });
  });

  it('lets a refused track through', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 404, json: {} }));

    await expect(watch(client).subtitles(TRACK)).rejects.toMatchObject({ status: 404 });
  });

  it('spells the address of a track under the mount, with the ticket', () => {
    const { client } = recordingClient();

    expect(watch(client).subtitleUrl(TRACK)).toBe(
      'http://kroma.test/api/module/tv.kroma.torrents/watch/22e86113ba9a6db4/files/5/subtitles/2.vtt?t=tok',
    );
  });
});

describe('the storyboard of a file', () => {
  const SHEET = {
    url: '/api/module/tv.kroma.torrents/watch/22e86113ba9a6db4/files/5/storyboard.jpg?t=tok&v=3',
    interval: 10,
    tileW: 160,
    tileH: 90,
    cols: 2,
    rows: 2,
    count: 4,
    duration: 40,
    complete: false,
    ready: '1100',
  };

  it('answers pending while the module has not begun the sheet', async () => {
    const { client } = recordingClient(() => ({ status: 202, json: { status: 'pending' } }));

    await expect(watch(client).storyboard(download, 5)).resolves.toBe('pending');
  });

  it('answers none where the module offers no sheet', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 404, json: {} }));

    await expect(watch(client).storyboard(download, 5)).resolves.toBeNull();
  });

  it('reads the tiles drawn so far and whether more are coming', async () => {
    const { client } = recordingClient(() => ({ json: SHEET }));

    await expect(watch(client).storyboard(download, 5)).resolves.toMatchObject({
      complete: false,
      ready: '1100',
      count: 4,
    });
  });

  it('hands the sheet back at an address a native image can load as it is', async () => {
    const { client } = recordingClient(() => ({ json: SHEET }));

    const sheet = await watch(client).storyboard(download, 5);

    expect(sheet).toMatchObject({ url: `http://kroma.test${SHEET.url}` });
  });

  it('keeps a sheet address that is already absolute', async () => {
    const elsewhere = { ...SHEET, url: 'https://cdn.example/sheet.jpg?v=3' };
    const { client } = recordingClient(() => ({ json: elsewhere }));

    const sheet = await watch(client).storyboard(download, 5);

    expect(sheet).toMatchObject({ url: 'https://cdn.example/sheet.jpg?v=3' });
  });

  it('refuses a sheet that does not say which tiles are drawn', async () => {
    const { ready: _, ...unmarked } = SHEET;
    const { client } = recordingClient(() => ({ json: unmarked }));

    await expect(watch(client).storyboard(download, 5)).rejects.toThrow(/ready/);
  });

  it('lets a failed storyboard through', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 500, json: {} }));

    await expect(watch(client).storyboard(download, 5)).rejects.toMatchObject({ status: 500 });
  });
});

describe('cancelling a download', () => {
  it('reads a removal the server confirmed', async () => {
    const { client } = recordingClient(() => ({ json: { removed: true } }));

    await expect(watch(client).cancel(download)).resolves.toBe(true);
  });

  it('reads a download the server kept as not removed', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 409, json: { error: 'x' } }));

    await expect(watch(client).cancel(download)).resolves.toBe(false);
  });

  it('reads a download the server no longer knows as not removed', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 404, json: { error: 'x' } }));

    await expect(watch(client).cancel(download)).resolves.toBe(false);
  });
});

describe('a server that fails for another reason', () => {
  it('lets a failed list through', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 500, json: {} }));

    await expect(watch(client).list()).rejects.toMatchObject({ status: 500 });
  });

  it('lets a refused ticket through', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 403, json: {} }));

    await expect(watch(client).ticket(download, 5)).rejects.toMatchObject({ status: 403 });
  });

  it('lets a failed start through', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 500, json: {} }));

    await expect(watch(client).start(SINTEL)).rejects.toMatchObject({ status: 500 });
  });

  it('lets a failed probe through', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 500, json: {} }));

    await expect(watch(client).probe(download, 5)).rejects.toMatchObject({ status: 500 });
  });
});
