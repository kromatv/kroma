import { describe, expect, it } from 'vitest';
import { castRowDetail } from './cast-context';

const WORDS = {
  'cast.waking': 'Waking',
  'cast.needsPower': 'Switch on',
  'cast.asleep': 'Asleep',
  'cast.idle': 'Idle',
} as const;

const t = (key: keyof typeof WORDS) => WORDS[key];

const watching = (title: string, metadataTitle?: string | null) => ({
  nowPlaying: {
    item: { title, metadata: metadataTitle === undefined ? null : { title: metadataTitle } },
  },
});

describe('the line under a receiver', () => {
  it.each([
    ['waking', 'Waking'],
    ['needsPower', 'Switch on'],
    ['asleep', 'Asleep'],
  ] as const)('says %s in words even when a title is known', (state, text) => {
    expect(castRowDetail(watching('Dune'), state, t)).toEqual({ text, idle: false });
  });

  it('says idle when nothing plays', () => {
    expect(castRowDetail({}, 'idle', t)).toEqual({ text: 'Idle', idle: true });
  });

  it('shows the metadata title of what plays', () => {
    expect(castRowDetail(watching('file.mkv', 'Dune'), 'playing', t)).toEqual({
      text: 'Dune',
      idle: false,
    });
  });

  it('falls back to the item title without metadata', () => {
    expect(castRowDetail(watching('Dune'), 'playing', t)).toEqual({ text: 'Dune', idle: false });
  });

  it('falls back to the item title when the metadata has none', () => {
    expect(castRowDetail(watching('Dune', null), 'playing', t)).toEqual({
      text: 'Dune',
      idle: false,
    });
  });
});
