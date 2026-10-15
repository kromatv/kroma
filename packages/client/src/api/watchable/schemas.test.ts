import { describe, expect, it } from 'vitest';
import {
  WatchableEntry,
  WatchableProbe,
  WatchableProgress,
  WatchableStart,
  WatchableStoryboard,
  WatchableTicket,
  WatchableView,
} from './schemas';

const FILE = {
  index: 5,
  name: 'Sintel.mp4',
  sizeBytes: 129241752,
  isVideo: true,
  season: null,
  episode: null,
};

const ENTRY = {
  id: '22e86113ba9a6db4',
  requestId: 'req_7',
  tmdbId: 45745,
  title: 'Sintel',
  year: 2010,
  kind: 'movie',
  posterUrl: '/api/images/sintel',
  progress: 0.34,
  status: 'downloading',
  ephemeral: true,
  files: [FILE],
};

describe('a watchable entry', () => {
  it('reads a download the server described in full', () => {
    expect(WatchableEntry.parse(ENTRY)).toEqual(ENTRY);
  });

  it('reads a download nobody requested and the scanner could not name', () => {
    const bare = {
      ...ENTRY,
      requestId: null,
      tmdbId: null,
      title: null,
      year: null,
      posterUrl: null,
    };

    expect(WatchableEntry.parse(bare)).toEqual(bare);
  });

  it('reads an entry from a module that predates the film id as naming no film', () => {
    const { tmdbId: _, ...older } = ENTRY;

    expect(WatchableEntry.parse(older).tmdbId).toBeNull();
  });

  it('reads an entry from a module that predates episodes as a kept download naming none', () => {
    const { ephemeral: _, ...older } = ENTRY;
    const { season: __, episode: ___, ...olderFile } = FILE;

    const entry = WatchableEntry.parse({ ...older, files: [olderFile] });

    expect(entry).toEqual({ ...ENTRY, ephemeral: false });
  });

  it('keeps the index the torrent gave a file rather than its place in the list', () => {
    const entry = WatchableEntry.parse({ ...ENTRY, files: [{ ...FILE, index: 12 }] });

    expect(entry.files[0]?.index).toBe(12);
  });

  it('refuses a progress that is not a fraction of one', () => {
    expect(() => WatchableEntry.parse({ ...ENTRY, progress: 34 })).toThrow();
    expect(() => WatchableEntry.parse({ ...ENTRY, progress: -0.1 })).toThrow();
  });

  it('refuses a status outside the five the contract names', () => {
    expect(() => WatchableEntry.parse({ ...ENTRY, status: 'stalled' })).toThrow();
  });

  it('refuses an entry with no id to mint a ticket against', () => {
    expect(() => WatchableEntry.parse({ ...ENTRY, id: '' })).toThrow();
  });

  it('refuses a file whose index arrived as a string', () => {
    expect(() => WatchableEntry.parse({ ...ENTRY, files: [{ ...FILE, index: '5' }] })).toThrow();
  });
});

describe('the watchable view', () => {
  it('reads a server with nothing in flight', () => {
    expect(WatchableView.parse({ entries: [] })).toEqual({ entries: [] });
  });

  it('refuses a view with no entries field at all', () => {
    expect(() => WatchableView.parse({})).toThrow();
  });
});

describe('a watchable ticket', () => {
  const ticket = {
    url: '/api/module/tv.kroma.torrents/play/abc',
    token: 'abc',
    expiresAt: 1789802352612,
  };

  it('reads the url, the token an HLS query carries, and the moment both lapse', () => {
    expect(WatchableTicket.parse(ticket)).toEqual(ticket);
  });

  it('refuses a ticket with nothing to credential a playlist with', () => {
    expect(() => WatchableTicket.parse({ ...ticket, token: '' })).toThrow();
  });
});

describe('a started download', () => {
  it('reads the download and the release the server picked', () => {
    const started = { downloadId: '9619ccec50f68056', release: 'Sintel.2010.720p', reused: true };

    expect(WatchableStart.parse(started)).toEqual(started);
  });

  it('refuses a start that names no release', () => {
    expect(() =>
      WatchableStart.parse({ downloadId: '9619ccec50f68056', release: '', reused: false }),
    ).toThrow();
  });
});

describe('a probed file', () => {
  const stereo = { index: 1, codec: 'aac', channels: 2, language: null };
  const probe = {
    durationMs: 888064,
    video: { codec: 'hevc', width: 1920, height: 800 },
    audio: [{ index: 0, codec: 'eac3', channels: 6, language: 'fre' }, stereo],
  };

  it('reads every audio stream with the index a master muxes it by', () => {
    expect(WatchableProbe.parse(probe).audio.map((t) => t.index)).toEqual([0, 1]);
  });

  it('names the track the file itself marks default, wherever it sits in the list', () => {
    const marked = {
      ...probe,
      audio: [
        { ...probe.audio[0], default: false },
        { ...stereo, title: 'Commentary', default: true },
      ],
    };

    expect(WatchableProbe.parse(marked).audio.map((t) => t.default)).toEqual([false, true]);
  });

  it('names no default at all on a module that does not carry one', () => {
    expect(WatchableProbe.parse(probe).audio.every((t) => t.default === undefined)).toBe(true);
  });

  it('reads the colour a module that does not carry it never claimed', () => {
    expect(WatchableProbe.parse(probe).video).toMatchObject({ hdr: false, bitDepth: null });
  });

  it('reads the colour signalling a module carries through to the player', () => {
    const graded = {
      ...probe,
      video: { ...probe.video, hdr: true, bitDepth: 10, hdrFormat: 'dolbyVision' },
    };

    expect(WatchableProbe.parse(graded).video).toMatchObject({
      hdr: true,
      bitDepth: 10,
      hdrFormat: 'dolbyVision',
    });
  });

  it('reads a file whose container gives no duration and holds no picture', () => {
    const bare = { durationMs: null, video: null, audio: [] };

    expect(WatchableProbe.parse(bare)).toMatchObject(bare);
  });

  it('reads a stream ffprobe opened and did not measure as measured in neither direction', () => {
    const unmeasured = {
      durationMs: null,
      video: { codec: 'h264', width: null, height: null },
      audio: [{ index: 0, codec: 'aac', channels: null, language: null }],
    };

    expect(WatchableProbe.parse(unmeasured).video).toMatchObject({ width: null, height: null });
  });

  it('refuses an audio stream with no index', () => {
    const { index: _, ...unindexed } = stereo;

    expect(() => WatchableProbe.parse({ ...probe, audio: [unindexed] })).toThrow();
  });

  it('reads a probe from a module that predates subtitles and chapters as offering neither', () => {
    expect(WatchableProbe.parse(probe)).toMatchObject({ subtitles: [], chapters: [] });
  });

  it('reads every subtitle stream, picture tracks marked as such', () => {
    const subtitled = {
      ...probe,
      subtitles: [
        { index: 0, codec: 'subrip', language: 'fra', title: null, forced: false, text: true },
        { index: 1, codec: 'hdmv_pgs_subtitle', language: 'eng', title: 'SDH', text: false },
      ],
    };

    expect(WatchableProbe.parse(subtitled).subtitles).toEqual([
      { index: 0, codec: 'subrip', language: 'fra', title: null, forced: false, text: true },
      {
        index: 1,
        codec: 'hdmv_pgs_subtitle',
        language: 'eng',
        title: 'SDH',
        forced: false,
        text: false,
      },
    ]);
  });

  it('reads a subtitle stream that does not say it is text as one no player draws', () => {
    const unsaid = { ...probe, subtitles: [{ index: 0, codec: 'subrip', language: null }] };

    expect(WatchableProbe.parse(unsaid).subtitles[0]?.text).toBe(false);
  });

  it('reads the chapters a file carries, a title missing where it has none', () => {
    const chaptered = {
      ...probe,
      chapters: [
        { startMs: 0, endMs: 120000, title: 'Opening' },
        { startMs: 120000, endMs: 888064, title: null },
      ],
    };

    expect(WatchableProbe.parse(chaptered).chapters).toEqual(chaptered.chapters);
  });
});

describe('a storyboard of a file still arriving', () => {
  const sheet = {
    url: '/api/module/tv.kroma.torrents/watch/abc/files/5/storyboard.jpg?t=tok&v=1',
    interval: 10,
    tileW: 160,
    tileH: 90,
    cols: 5,
    rows: 2,
    count: 10,
    duration: 100,
    complete: false,
    ready: '1110000000',
  };

  it('reads the sheet with the tiles drawn so far', () => {
    expect(WatchableStoryboard.parse(sheet)).toEqual(sheet);
  });

  it('refuses a sheet that does not say whether it is finished', () => {
    const { complete: _, ...open } = sheet;

    expect(() => WatchableStoryboard.parse(open)).toThrow();
  });
});

describe('the slices a file is asking for', () => {
  it('refuses an index that cannot name a slice', () => {
    for (const arriving of [[-1], [1.5]]) {
      expect(() => WatchableProgress.parse({ progress: 0.1, arriving })).toThrow();
    }
  });
});
