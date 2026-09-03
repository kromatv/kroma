import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ItemId } from '../media';
import { GenerationId, SubtitleId } from './ids';

const item = ItemId.parse('i 1');

describe('the subtitle endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'capabilities',
      call: (c) => c.subtitles.capabilities(item),
      method: 'GET',
      path: '/items/i%201/subtitles/capabilities',
    },
    {
      name: 'downloaded',
      call: (c) => c.subtitles.downloaded(item),
      method: 'GET',
      path: '/items/i%201/subtitles/downloaded',
    },
    {
      name: 'delete',
      call: (c) => c.subtitles.delete(item, SubtitleId.parse('sub 1')),
      method: 'DELETE',
      path: '/items/i%201/subtitles/downloaded/sub%201',
    },
    {
      name: 'generate',
      call: (c) => c.subtitles.generate(item, { mode: 'transcribe', lang: 'fr' }),
      method: 'POST',
      path: '/items/i%201/subtitles/generate',
      body: { mode: 'transcribe', lang: 'fr' },
    },
    {
      name: 'generations',
      call: (c) => c.subtitles.generations(item),
      method: 'GET',
      path: '/items/i%201/subtitles/generations',
    },
    {
      name: 'cancel',
      call: (c) => c.subtitles.cancel(item, GenerationId.parse('g 1')),
      method: 'DELETE',
      path: '/items/i%201/subtitles/generations/g%201',
    },
  ])('$name', checkEndpoint);
});
