import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';

describe('the names TMDB offers a title edit', () => {
  it.each<Endpoint>([
    {
      name: 'people, asked for the name trimmed',
      call: (c) => c.media.titleEdits.people(' michael mann '),
      method: 'GET',
      path: '/edits/people?q=michael+mann',
    },
    {
      name: 'studios',
      call: (c) => c.media.titleEdits.studios('a24 & co'),
      method: 'GET',
      path: '/edits/studios?q=a24+%26+co',
    },
  ])('$name', checkEndpoint);

  it('reads a person TMDB has no portrait, department or title for', async () => {
    const jane = { tmdbId: 9, name: 'Jane Doe', photoUrl: null, department: null, knownFor: [] };
    const { client } = recordingClient(() => ({ json: { results: [jane] } }));

    const offered = await client.media.titleEdits.people('jane');

    expect(offered.results).toEqual([jane]);
  });

  it('reads a studio with its logo and its country', async () => {
    const studio = { tmdbId: 11, name: 'Forward Pass', logoUrl: 'https://l.png', country: 'US' };
    const { client } = recordingClient(() => ({ json: { results: [studio] } }));

    const offered = await client.media.titleEdits.studios('forward');

    expect(offered.results).toEqual([studio]);
  });
});
