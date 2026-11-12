import { describe, expect, it } from 'vitest';
import { smartHubSections } from './smart-hub-tiles';

const card = (id: string) => `http://192.168.1.20:4040/api/items/${id}/card`;

const resume = JSON.stringify([
  { id: 'm1', title: 'Blade Runner', subtitle: '1982', imageUrl: card('m1'), kind: 'movie' },
  {
    id: 'e7',
    title: 'Severance',
    subtitle: 'Hello, Ms. Cobel',
    imageUrl: card('e7'),
    kind: 'episode',
    showId: 's3',
  },
]);

const channels = JSON.stringify([
  {
    title: 'Récemment ajoutés',
    items: [{ id: 'm9', title: 'Dune', subtitle: '2021', imageUrl: card('m9') }],
  },
  { title: 'Tendances', items: [{ id: 'm5', title: 'Arrival', imageUrl: card('m5') }] },
]);

describe('smartHubSections', () => {
  it('puts continue watching first, then the newest titles', () => {
    const sections = smartHubSections(resume, channels, 'Reprendre la lecture');

    expect(sections.map((section) => section.title)).toEqual([
      'Reprendre la lecture',
      'Récemment ajoutés',
    ]);
    expect(sections[1]?.tiles).toEqual([
      {
        title: 'Dune',
        subtitle: '2021',
        image: card('m9'),
        ratio: '16:9',
        url: 'kroma://item/m9',
        playable: false,
      },
    ]);
  });

  it('links an episode to its show, as every launcher does', () => {
    const [continueRow] = smartHubSections(resume, '[]', 'Reprendre la lecture');

    expect(continueRow?.tiles.map((entry) => entry.url)).toEqual([
      'kroma://item/m1',
      'kroma://show/s3',
    ]);
    expect(continueRow?.tiles.every((entry) => entry.playable)).toBe(true);
  });

  it('never links one title twice', () => {
    const again = JSON.stringify([
      {
        title: 'Récemment ajoutés',
        items: [{ id: 'm1', title: 'Blade Runner', imageUrl: card('m1') }],
      },
    ]);

    const sections = smartHubSections(resume, again, 'Reprendre la lecture');

    expect(sections).toHaveLength(1);
  });

  it('leaves out a title with no web image', () => {
    const noArt = JSON.stringify([
      { id: 'm2', title: 'Alien', imageUrl: 'data:image/svg+xml,x', kind: 'movie' },
    ]);

    expect(smartHubSections(noArt, '[]', 'Reprendre la lecture')).toEqual([]);
  });

  it('publishes nothing from JSON it cannot read', () => {
    expect(smartHubSections('not json', '{"rows":[]}', 'Reprendre la lecture')).toEqual([]);
  });

  it('keeps to Samsung forty tiles', () => {
    const many = (prefix: string) =>
      Array.from({ length: 30 }, (_, index) => ({
        id: `${prefix}${index}`,
        title: 'T',
        imageUrl: card(`${prefix}${index}`),
        kind: 'movie',
      }));
    const sections = smartHubSections(
      JSON.stringify(many('c')),
      JSON.stringify([{ title: 'Récemment ajoutés', items: many('n') }]),
      'Reprendre la lecture',
    );

    expect(sections.map((section) => section.tiles.length)).toEqual([20, 20]);
  });
});
