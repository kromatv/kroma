import { describe, expect, it } from 'vitest';
import { MSE_CAPS } from './directplay';
import { makeItem, track, UNPROBED } from './directplay.fixture';
import { streamNotice } from './stream-notice';

describe('streamNotice', () => {
  it('says nothing about a direct play, because silence is how a viewer knows', () => {
    const item = makeItem({ audio: [track({ index: 0 })] });

    expect(streamNotice(item, 'direct', MSE_CAPS)).toBeNull();
  });

  it('calls a remux repackaged, without implying the picture changed', () => {
    const item = makeItem({ container: 'mkv', audio: [track({ index: 0, codec: 'ac3' })] });

    expect(streamNotice(item, 'remux', MSE_CAPS)).toEqual({
      messageKey: 'player.repackagedToast',
    });
  });

  it('names the codec the browser could not keep', () => {
    const item = makeItem({ audio: [track({ index: 0, codec: 'truehd', channels: 8 })] });

    expect(streamNotice(item, 'transcode', MSE_CAPS)).toEqual({
      messageKey: 'player.audioReencodedToast',
      messageVars: { codec: 'TRUEHD' },
    });
  });

  it('names the first track that forced the re-encode, not the first track', () => {
    const item = makeItem({
      audio: [track({ index: 0, codec: 'aac' }), track({ index: 1, codec: 'dts' })],
    });

    expect(streamNotice(item, 'transcode', MSE_CAPS)?.messageVars).toEqual({ codec: 'DTS' });
  });

  it('stays silent on a re-encode it cannot describe', () => {
    expect(streamNotice(UNPROBED, 'transcode', MSE_CAPS)).toBeNull();
  });
});
