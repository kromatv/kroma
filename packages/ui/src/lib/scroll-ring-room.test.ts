import { describe, expect, it } from 'vitest';
import { RING_ROOM } from '#ui/core/tokens';
import { ringRoom } from './scroll-ring-room';

describe('ringRoom', () => {
  it('reaches out sideways only for a page', () => {
    const room = ringRoom({ marginLeft: 4 }, { paddingHorizontal: 10, paddingTop: 3 }, false);

    expect(room.box).toEqual({ marginLeft: 4 - RING_ROOM, marginRight: -RING_ROOM });
    expect(room.content).toEqual({
      paddingHorizontal: 10,
      paddingTop: 3,
      paddingLeft: 10 + RING_ROOM,
      paddingRight: 10 + RING_ROOM,
    });
  });

  it('reaches out on all four sides for a row', () => {
    const room = ringRoom(undefined, { padding: 8 }, true);

    expect(room.box).toEqual({
      marginTop: -RING_ROOM,
      marginBottom: -RING_ROOM,
      marginLeft: -RING_ROOM,
      marginRight: -RING_ROOM,
    });
    expect(room.content).toMatchObject({
      paddingTop: 8 + RING_ROOM,
      paddingBottom: 8 + RING_ROOM,
      paddingLeft: 8 + RING_ROOM,
      paddingRight: 8 + RING_ROOM,
    });
  });
});
