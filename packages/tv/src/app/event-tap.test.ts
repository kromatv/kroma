import type { ClientMessage } from '@kromatv/client/events';
import { describe, expect, it, vi } from 'vitest';
import { createEventTap } from '#tv/app/event-tap';

const RELEASE: ClientMessage = { type: 'cast.release' };

describe('the event tap', () => {
  it('sends nothing before a socket is attached or after it is detached', () => {
    const tap = createEventTap();
    const send = vi.fn(() => true);

    const before = tap.send(RELEASE);
    tap.attach({ open: true, send });
    const during = tap.send(RELEASE);
    tap.attach(null);
    const after = tap.send(RELEASE);

    expect([before, during, after]).toEqual([false, true, false]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('tells a listener added while the socket is open that it is open', () => {
    const tap = createEventTap();
    tap.attach({ open: true, send: () => true });
    const onOpen = vi.fn();

    tap.listen({ onOpen, onEvent: vi.fn() });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('tells a listener each time the socket opens', () => {
    const tap = createEventTap();
    const onOpen = vi.fn();
    tap.listen({ onOpen, onEvent: vi.fn() });

    tap.opened();
    tap.opened();

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('hands every frame to every listener until it leaves', () => {
    const tap = createEventTap();
    const onEvent = vi.fn();
    const leave = tap.listen({ onOpen: vi.fn(), onEvent });

    tap.heard({ type: 'library.updated' });
    leave();
    tap.heard({ type: 'library.updated' });

    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
