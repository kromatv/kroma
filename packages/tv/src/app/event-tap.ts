import type { ClientMessage, ServerEvent } from '@kromatv/client/events';

/** What hears the signed-in event socket through an {@link EventTap}. */
export interface EventTapListener {
  onOpen: () => void;
  onEvent: (event: ServerEvent) => void;
}

/** The event socket a signed-in television keeps open, for a part of the app
 * that answers on it without opening a socket of its own. */
export interface EventTap {
  send: (message: ClientMessage) => boolean;
  /** Hears every open and every frame until the returned function is called. A
   * listener added while the socket is open hears that open at once. */
  listen: (listener: EventTapListener) => () => void;
}

type Socket = Readonly<{ open: boolean; send: (message: ClientMessage) => boolean }>;

/** The side of a tap the socket's owner feeds. */
export interface EventTapFeed extends EventTap {
  attach: (socket: Socket | null) => void;
  opened: () => void;
  heard: (event: ServerEvent) => void;
}

/** A tap with no socket yet: it sends nothing and hears nothing until one is
 * attached. */
export function createEventTap(): EventTapFeed {
  const listeners = new Set<EventTapListener>();
  let socket: Socket | null = null;
  return {
    send: (message) => socket?.send(message) ?? false,
    listen(listener) {
      listeners.add(listener);
      if (socket?.open) {
        listener.onOpen();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    attach(next) {
      socket = next;
    },
    opened() {
      for (const listener of listeners) {
        listener.onOpen();
      }
    },
    heard(event) {
      for (const listener of listeners) {
        listener.onEvent(event);
      }
    },
  };
}
