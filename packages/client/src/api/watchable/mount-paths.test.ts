import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';
import type { HlsMasterDeclaration } from '../media/client';
import { ItemId } from '../media/ids';
import { download, MOUNTED, SINTEL, watch } from './client.fixture';

describe('the capability a client is handed', () => {
  it('builds every path under the mount the server named, whatever it is', async () => {
    const { client, calls } = recordingClient();

    await watch(client, '/api/module/tv.example.other')
      .list()
      .catch(() => undefined);

    expect(calls[0]?.path).toBe('/module/tv.example.other/watch');
  });
});

describe('the watchable endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => watch(c).list(), method: 'GET', path: `${MOUNTED}/watch` },
    {
      name: 'a ticket names the file by its torrent index',
      call: (c) => watch(c).ticket(download, 5),
      method: 'POST',
      path: `${MOUNTED}/watch/22e86113ba9a6db4/files/5/ticket`,
    },
    {
      name: 'start names the film the way discovery does',
      call: (c) => watch(c).start(SINTEL),
      method: 'POST',
      path: `${MOUNTED}/watch/start`,
      body: SINTEL,
    },
    {
      name: 'start names an episode by its season and number',
      call: (c) => watch(c).start({ ...SINTEL, kind: 'show', season: 1, episode: 3 }),
      method: 'POST',
      path: `${MOUNTED}/watch/start`,
      body: { ...SINTEL, kind: 'show', season: 1, episode: 3 },
    },
    {
      name: 'probe names the file by its torrent index',
      call: (c) => watch(c).probe(download, 5),
      method: 'GET',
      path: `${MOUNTED}/watch/22e86113ba9a6db4/files/5/probe`,
    },
    {
      name: 'progress asks for the slices it draws',
      call: (c) => watch(c).progress(download, 5, 120),
      method: 'GET',
      path: `${MOUNTED}/watch/22e86113ba9a6db4/files/5/progress?buckets=120`,
    },
    {
      name: 'cancel names the download',
      call: (c) => watch(c).cancel(download),
      method: 'DELETE',
      path: `${MOUNTED}/watch/22e86113ba9a6db4`,
    },
    {
      name: 'a subtitle track carries the ticket minted for its file',
      call: (c) => watch(c).subtitles({ id: download, file: 5, index: 2, token: 'tok' }),
      method: 'GET',
      path: `${MOUNTED}/watch/22e86113ba9a6db4/files/5/subtitles/2.vtt?t=tok`,
    },
    {
      name: 'storyboard names the file by its torrent index',
      call: (c) => watch(c).storyboard(download, 5),
      method: 'GET',
      path: `${MOUNTED}/watch/22e86113ba9a6db4/files/5/storyboard`,
    },
  ])('$name', checkEndpoint);
});

describe('the HLS master URL of a file', () => {
  const { client } = recordingClient();
  const item = ItemId.parse('i1');
  const CREDENTIAL = /[?&]t=[^&]*/;
  const program = (url: string) => url.slice(url.indexOf('/hls/')).replace(CREDENTIAL, '');
  const same = (
    aac: boolean,
    startSec: number,
    audio: number,
    declaration: HlsMasterDeclaration,
  ) => ({
    watchable: program(
      watch(client).hlsMasterUrl({
        id: download,
        file: 5,
        token: 'tok',
        aac,
        startSec,
        audio,
        declaration,
      }),
    ),
    media: program(client.media.hlsMasterUrl(item, aac, startSec, audio, declaration)),
  });

  it('puts the download, the file and the program in the path under the mount', () => {
    expect(
      watch(client).hlsMasterUrl({
        id: download,
        file: 5,
        token: 'tok',
        startSec: 600.6,
        audio: 1,
      }),
    ).toBe(
      'http://kroma.test/api/module/tv.kroma.torrents/watch/22e86113ba9a6db4/files/5/hls/copy/601/1/index.m3u8?t=tok',
    );
  });

  it.each<[string, boolean, number, number, HlsMasterDeclaration]>([
    ['a bare copy', false, 0, 0, {}],
    ['the AAC variant', true, 0, 0, {}],
    ['an anchor and a track out of range', false, -5, -1, {}],
    ['a loudness filter', false, 0, 0, { filter: 'night' }],
    [
      'a copy with its decodable codecs',
      false,
      0,
      0,
      { copyCodecs: ['aac'], videoCodecs: ['h264'] },
    ],
    ['a transcode that drops the audio list', true, 0, 0, { copyCodecs: ['aac'], videoCodecs: [] }],
    ['a decoder ceiling', false, 0, 0, { maxFrame: { width: 1920, height: 1080 } }],
  ])(
    'asks for the program the catalogue asks for, given %s',
    (_, aac, startSec, audio, declared) => {
      const built = same(aac, startSec, audio, declared);

      expect(built.watchable).toBe(built.media);
    },
  );
});
