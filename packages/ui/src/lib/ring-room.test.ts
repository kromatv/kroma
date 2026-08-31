import { describe, expect, it } from 'vitest';
import { RING_ROOM } from '#ui/core/tokens';
import { ringRoomBlock, ringRoomInline } from './ring-room';

describe('the room a focus ring needs inside a scroller', () => {
  it('reaches out by the ring and pads back in by the same amount', () => {
    expect(ringRoomBlock()).toEqual({
      marginBlock: -RING_ROOM,
      paddingBlock: RING_ROOM,
      scrollPadding: RING_ROOM,
    });
  });

  it('measures the reach from the padding the edge already carried', () => {
    expect(ringRoomBlock(RING_ROOM)).toMatchObject({ marginBlock: 0, paddingBlock: RING_ROOM });
  });

  it('says the same thing on the inline axis', () => {
    expect(ringRoomInline(4)).toEqual({
      marginInline: 4 - RING_ROOM,
      paddingInline: RING_ROOM,
      scrollPadding: RING_ROOM,
    });
  });

  it('brings the control into view with the room still around it', () => {
    expect(ringRoomInline().scrollPadding).toBe(RING_ROOM);
  });
});
