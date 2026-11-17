import { describe, expect, it } from 'vitest';
import type { MessageHit } from '#site/lib/views';
import { searchMessages } from './message-search';

const hit = (key: string, source: string, text: string | null = null): MessageHit => ({
  key,
  file: key.split('.')[0] ?? '',
  source,
  text,
});

const messages = [
  hit('player.audio', 'Audio track', 'Piste audio'),
  hit('nav.home', 'Home', 'Accueil'),
  hit('player.subtitles', 'Subtitles', null),
  hit('audio', 'Sound', 'Son'),
];

describe('searchMessages', () => {
  it('finds a message by its key, its source or its translation, ignoring case', () => {
    expect(searchMessages(messages, 'ACCUEIL').map((m) => m.key)).toEqual(['nav.home']);
    expect(searchMessages(messages, 'subtitles').map((m) => m.key)).toEqual(['player.subtitles']);
  });

  it('puts the closest match first, a whole key above a key that only holds the word', () => {
    expect(searchMessages(messages, 'audio').map((m) => m.key)).toEqual(['audio', 'player.audio']);
  });

  it('keeps the catalog order between equal matches', () => {
    expect(searchMessages(messages, 'player').map((m) => m.key)).toEqual([
      'player.audio',
      'player.subtitles',
    ]);
  });

  it('answers at most the limit', () => {
    const many = Array.from({ length: 80 }, (_, at) => hit(`k.${at}`, 'Same text'));

    expect(searchMessages(many, 'same')).toHaveLength(50);
    expect(searchMessages(many, 'same', 3)).toHaveLength(3);
  });

  it('finds nothing for a query under two characters', () => {
    expect(searchMessages(messages, ' a ')).toEqual([]);
  });
});
