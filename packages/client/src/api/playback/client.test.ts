import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ItemId, ShowId } from '../media';
import { PlaybackSessionId } from './ids';

const item = ItemId.parse('i 1');
const show = ShowId.parse('s1');
const session = PlaybackSessionId.parse('sess1');
const PING = { sessionId: session, itemId: item, positionMs: 4000, state: 'playing' as const };

describe('the playback endpoints', () => {
  it.each<Endpoint>([
    { name: 'progress', call: (c) => c.playback.progress(), method: 'GET', path: '/progress' },
    {
      name: 'itemProgress',
      call: (c) => c.playback.itemProgress(item),
      method: 'GET',
      path: '/progress/i%201',
    },
    {
      name: 'save, rounding the position to whole milliseconds',
      call: (c) => c.playback.save(item, 1234.6),
      method: 'PUT',
      path: '/progress/i%201',
      body: { positionMs: 1235, durationMs: null },
    },
    {
      name: 'save with the duration the player knows',
      call: (c) => c.playback.save(item, 10, 7200000),
      method: 'PUT',
      path: '/progress/i%201',
      body: { positionMs: 10, durationMs: 7200000 },
    },
    {
      name: 'forget',
      call: (c) => c.playback.forget(item),
      method: 'DELETE',
      path: '/progress/i%201',
    },
    {
      name: 'continueWatching',
      call: (c) => c.playback.continueWatching(),
      method: 'GET',
      path: '/continue',
    },
    {
      name: 'upNext',
      call: (c) => c.playback.upNext(show),
      method: 'GET',
      path: '/shows/s1/up-next',
    },
    {
      name: 'nextEpisode',
      call: (c) => c.playback.nextEpisode(item),
      method: 'GET',
      path: '/items/i%201/next',
    },
    {
      name: 'following',
      call: (c) => c.playback.following(item),
      method: 'GET',
      path: '/items/i%201/following',
    },
    { name: 'forYou', call: (c) => c.playback.forYou(), method: 'GET', path: '/for-you' },
    { name: 'watched', call: (c) => c.playback.watched(), method: 'GET', path: '/watched' },
    {
      name: 'markWatched',
      call: (c) => c.playback.markWatched(item),
      method: 'PUT',
      path: '/watched/i%201',
    },
    {
      name: 'unmarkWatched',
      call: (c) => c.playback.unmarkWatched(item),
      method: 'DELETE',
      path: '/watched/i%201',
    },
    { name: 'myList', call: (c) => c.playback.myList(), method: 'GET', path: '/my-list' },
    {
      name: 'addToList',
      call: (c) => c.playback.addToList(show),
      method: 'PUT',
      path: '/my-list/s1',
    },
    {
      name: 'removeFromList',
      call: (c) => c.playback.removeFromList(item),
      method: 'DELETE',
      path: '/my-list/i%201',
    },
    {
      name: 'ping',
      call: (c) => c.playback.ping(PING),
      method: 'POST',
      path: '/playback/ping',
      body: { sessionId: 'sess1', itemId: 'i 1', positionMs: 4000, state: 'playing' },
    },
    {
      name: 'stop',
      call: (c) => c.playback.stop(session),
      method: 'POST',
      path: '/playback/stop',
      body: { sessionId: 'sess1' },
    },
  ])('$name', checkEndpoint);
});
