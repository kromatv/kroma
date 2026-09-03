import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';
import { ItemId, LibraryId, ShowId } from './ids';

const item = ItemId.parse('i1');
const spaced = ItemId.parse('i 1');
const show = ShowId.parse('s1');
const library = LibraryId.parse('lib1');

describe('the media endpoints', () => {
  it.each<Endpoint>([
    { name: 'health', call: (c) => c.media.health(), method: 'GET', path: '/health' },
    { name: 'splash', call: (c) => c.media.splash(), method: 'GET', path: '/splash' },
    { name: 'libraries', call: (c) => c.media.libraries(), method: 'GET', path: '/libraries' },
    { name: 'items', call: (c) => c.media.items(), method: 'GET', path: '/items' },
    {
      name: 'items scoped to one library',
      call: (c) => c.media.items(library),
      method: 'GET',
      path: '/items?library=lib1',
    },
    {
      name: 'movies',
      call: (c) => c.media.movies(library),
      method: 'GET',
      path: '/movies?library=lib1',
    },
    { name: 'shows', call: (c) => c.media.shows(), method: 'GET', path: '/shows' },
    { name: 'show', call: (c) => c.media.show(show), method: 'GET', path: '/shows/s1' },
    { name: 'item', call: (c) => c.media.item(spaced), method: 'GET', path: '/items/i%201' },
    {
      name: 'similar',
      call: (c) => c.media.similar(spaced),
      method: 'GET',
      path: '/items/i%201/similar',
    },
    {
      name: 'themed',
      call: (c) => c.media.themed('christmas & co'),
      method: 'GET',
      path: '/themed?q=christmas+%26+co',
    },
    { name: 'home', call: (c) => c.media.home(), method: 'GET', path: '/home' },
    { name: 'featured', call: (c) => c.media.featured(), method: 'GET', path: '/home/featured' },
    {
      name: 'aiSuggest',
      call: (c) => c.media.aiSuggest(spaced),
      method: 'GET',
      path: '/items/i%201/ai-suggest',
    },
    {
      name: 'search',
      call: (c) => c.media.search('dune', { limit: 20 }),
      method: 'GET',
      path: '/search?q=dune&limit=20',
    },
    {
      name: 'people',
      call: (c) => c.media.people('Denis V', { library }),
      method: 'GET',
      path: '/people?name=Denis+V&library=lib1',
    },
    {
      name: 'person',
      call: (c) => c.media.person('Denis V'),
      method: 'GET',
      path: '/people/details?name=Denis+V',
    },
    { name: 'scan', call: (c) => c.media.scan(), method: 'POST', path: '/scan' },
    { name: 'logs', call: (c) => c.media.logs(), method: 'GET', path: '/logs?tail=200' },
    {
      name: 'rematch.candidates',
      call: (c) => c.media.rematch.candidates('movie', spaced),
      method: 'GET',
      path: '/rematch/movie/i%201/candidates',
    },
    {
      name: 'rematch.candidates with a typed query',
      call: (c) => c.media.rematch.candidates('show', show, ' the wire & co '),
      method: 'GET',
      path: '/rematch/show/s1/candidates?q=the+wire+%26+co',
    },
    {
      name: 'rematch.set',
      call: (c) => c.media.rematch.set('movie', spaced, 603),
      method: 'POST',
      path: '/rematch/movie/i%201',
      body: { tmdbId: 603 },
    },
  ])('$name', checkEndpoint);
});

describe('the URL builders, which make no request', () => {
  const { client } = recordingClient();

  it.each([
    ['streamUrl', client.media.streamUrl(spaced), '/items/i%201/stream'],
    ['subtitleUrl', client.media.subtitleUrl(spaced, 3), '/items/i%201/subtitles/3.vtt'],
    ['storyboardUrl', client.media.storyboardUrl(spaced), '/items/i%201/storyboard'],
    ['posterUrl', client.media.artwork.posterUrl(spaced), '/items/i%201/poster'],
    ['showPosterUrl', client.media.artwork.showPosterUrl(show), '/shows/s1/poster'],
    ['logsUrl', client.media.logsUrl(), '/logs?tail=200'],
    ['downloadUrl', client.media.downloadUrl(spaced), '/items/i%201/download'],
    [
      'downloadUrl keeps "copy nothing" distinct from "no preference"',
      client.media.downloadUrl(spaced, [], []),
      '/items/i%201/download?copy=&video=',
    ],
    [
      'downloadUrl with a codec set',
      client.media.downloadUrl(spaced, ['aac', 'ac3']),
      '/items/i%201/download?copy=aac%2Cac3',
    ],
  ])('%s', (_name, url, path) => {
    expect(url).toBe(`http://kroma.test/api${path}`);
  });
});

const SPLASH = {
  kind: 'movie',
  title: 'Dune',
  year: 2021,
  backdropUrl: '/api/images/b.webp',
};

describe('splash', () => {
  it('resolves each art path against the server, like every other poster', async () => {
    const { client } = recordingClient(() => ({ json: [SPLASH] }));

    const entries = await client.media.splash();

    expect(entries[0]?.backdropUrl).toBe('http://kroma.test/api/images/b.webp');
  });

  it('leaves an absolute URL alone and keeps the rest of the entry', async () => {
    const absolute = { ...SPLASH, backdropUrl: 'https://image.tmdb.org/b.jpg' };
    const { client } = recordingClient(() => ({ json: [absolute] }));

    const entries = await client.media.splash();

    expect(entries[0]).toEqual(absolute);
  });

  it('keeps an entry whose backdrop resolves to nothing as the server sent it', async () => {
    const { client } = recordingClient(() => ({ json: [{ ...SPLASH, backdropUrl: '' }] }));

    const entries = await client.media.splash();

    expect(entries[0]?.backdropUrl).toBe('');
  });

  it('answers an empty sample with an empty list', async () => {
    const { client } = recordingClient(() => ({ json: [] }));

    await expect(client.media.splash()).resolves.toEqual([]);
  });
});

describe('the HLS master URL', () => {
  const { client } = recordingClient();
  const url = (...args: Parameters<typeof client.media.hlsMasterUrl>) =>
    client.media.hlsMasterUrl(...args).replace('http://kroma.test/api', '');

  it('emits the copy program at anchor 0, audio 0', () => {
    expect(url(item)).toBe('/items/i1/hls/copy/0/0/index.m3u8');
  });

  it('emits the aac program for the AAC variant', () => {
    expect(url(item, true)).toBe('/items/i1/hls/aac/0/0/index.m3u8');
  });

  it('puts the anchor (rounded, clamped) and audio track in the path', () => {
    expect(url(item, false, 600.6, 2)).toBe('/items/i1/hls/copy/601/2/index.m3u8');
    expect(url(item, false, -5, -1)).toBe('/items/i1/hls/copy/0/0/index.m3u8');
  });

  it('makes a loudness filter the mode segment, which forces the transcode path', () => {
    expect(url(item, false, 0, 0, { filter: 'night' })).toBe(
      '/items/i1/hls/aac-night/0/0/index.m3u8',
    );
  });

  it('declares decodable codecs so the server can override an unplayable copy', () => {
    expect(url(item, false, 0, 0, { copyCodecs: ['aac', 'eac3'] })).toBe(
      '/items/i1/hls/copy/0/0/index.m3u8?copy=aac%2Ceac3',
    );
  });

  it('ignores declared audio codecs once the request already transcodes', () => {
    expect(url(item, true, 0, 0, { copyCodecs: ['aac'] })).toBe('/items/i1/hls/aac/0/0/index.m3u8');
  });

  it('declares decodable video, which the audio treatment never suppresses', () => {
    expect(url(item, true, 0, 0, { videoCodecs: ['h264'] })).toBe(
      '/items/i1/hls/aac/0/0/index.m3u8?video=h264',
    );
  });

  it('declares both axes of the decoder ceiling, which the server fits inside', () => {
    expect(url(item, false, 0, 0, { maxFrame: { width: 1920, height: 1080 } })).toBe(
      '/items/i1/hls/copy/0/0/index.m3u8?maxw=1920&maxh=1080',
    );
  });

  it('declares no ceiling for a device that never probed one', () => {
    expect(url(item, false, 0, 0, { maxFrame: { width: 0, height: 0 } })).toBe(
      '/items/i1/hls/copy/0/0/index.m3u8',
    );
  });
});

describe('logs', () => {
  it('returns the log body on success', async () => {
    const { client } = recordingClient(() => ({ text: 'line one\nline two' }));

    await expect(client.media.logs()).resolves.toBe('line one\nline two');
  });

  it('throws on a non-ok response', async () => {
    const { client } = recordingClient(() => ({ ok: false, status: 503 }));

    await expect(client.media.logs()).rejects.toMatchObject({ status: 503 });
  });
});

describe('storyboard', () => {
  const manifest = {
    url: '/api/sb.jpg',
    interval: 10,
    tileW: 160,
    tileH: 90,
    cols: 5,
    rows: 5,
    count: 25,
    duration: 250,
  };

  it('maps 202 to pending, a non-ok to null, and 200 to the manifest', async () => {
    const pending = recordingClient(() => ({ status: 202 })).client;
    const missing = recordingClient(() => ({ ok: false, status: 404 })).client;
    const ready = recordingClient(() => ({ json: manifest })).client;

    await expect(pending.media.storyboard(item)).resolves.toBe('pending');
    await expect(missing.media.storyboard(item)).resolves.toBeNull();
    await expect(ready.media.storyboard(item)).resolves.toEqual(manifest);
  });
});
