import { describe, expect, it } from 'vitest';
import { RING_ROOM } from '#ui/core/tokens';
import { ringRoom } from './scroll-ring-room';

describe('ringRoom', () => {
  it('reaches out sideways only for a page', () => {
    const room = ringRoom({ marginStart: 4 }, { paddingHorizontal: 10, paddingTop: 3 }, false);

    expect(room.box).toEqual({ marginStart: 4 - RING_ROOM, marginEnd: -RING_ROOM });
    expect(room.content).toEqual({
      paddingHorizontal: 10,
      paddingTop: 3,
      paddingStart: 10 + RING_ROOM,
      paddingEnd: 10 + RING_ROOM,
    });
  });

  it('adds its room to the start and end a caller laid out', () => {
    const room = ringRoom(undefined, { paddingStart: 64, paddingEnd: 32 }, false);

    expect(room.content).toEqual({ paddingStart: 64 + RING_ROOM, paddingEnd: 32 + RING_ROOM });
  });

  it('reaches out on all four sides for a row', () => {
    const room = ringRoom(undefined, { padding: 8 }, true);

    expect(room.box).toEqual({
      marginTop: -RING_ROOM,
      marginBottom: -RING_ROOM,
      marginStart: -RING_ROOM,
      marginEnd: -RING_ROOM,
    });
    expect(room.content).toMatchObject({
      paddingTop: 8 + RING_ROOM,
      paddingBottom: 8 + RING_ROOM,
      paddingStart: 8 + RING_ROOM,
      paddingEnd: 8 + RING_ROOM,
    });
  });
});
