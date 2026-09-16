import { describe, expect, it, vi } from 'vitest';
import type { PlayerNavActions } from '#ui/components/organisms/player/hooks/use-player-nav';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { handleMediaKey, TRANSPORT_KEYS } from './nav-keys';

const EVERY_KEY: readonly RemoteKey[] = [
  'Up',
  'Down',
  'Left',
  'Right',
  'Enter',
  'Back',
  'Play',
  'Pause',
  'PlayPause',
  'Next',
  'Prev',
  'Stop',
  'Rewind',
  'FastForward',
  'ColorRed',
  'ColorGreen',
  'ColorYellow',
  'ColorBlue',
];

function makeActions(): PlayerNavActions {
  return {
    togglePlay: vi.fn(),
    seekNudge: vi.fn(),
    onNext: vi.fn(),
    hasNext: true,
    volumeNudge: vi.fn(),
    toggleMute: vi.fn(),
    togglePip: vi.fn(),
    toggleFullscreen: vi.fn(),
    onExit: vi.fn(),
  };
}

describe('TRANSPORT_KEYS', () => {
  it('names exactly the keys handleMediaKey answers', () => {
    const actions = makeActions();

    const answered = EVERY_KEY.filter((key) => handleMediaKey(key, actions));

    expect(new Set(answered)).toEqual(TRANSPORT_KEYS);
  });

  it('claims no key the d-pad needs', () => {
    for (const key of ['Up', 'Down', 'Left', 'Right', 'Enter', 'Back'] as const) {
      expect(TRANSPORT_KEYS.has(key)).toBe(false);
    }
  });
});
