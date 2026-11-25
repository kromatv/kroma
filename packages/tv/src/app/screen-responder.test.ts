import { DeviceId } from '@kromatv/client';
import { type Screen, ScreenRequestId } from '@kromatv/client/diagnostics';
import type { ClientMessage, ServerEvent } from '@kromatv/client/events';
import { describe, expect, it, vi } from 'vitest';
import { createEventTap } from '#tv/app/event-tap';
import { createScreenResponder } from '#tv/app/screen-responder';

const SELF = { screenId: DeviceId.parse('tv-salon-01'), name: 'Salon', platform: 'Tizen' };

const REQUEST_ID = ScreenRequestId.parse('r1');

const SCREEN: Screen = {
  fibers: 3,
  truncated: false,
  rows: [{ depth: 0, name: 'Text', props: { children: 'Pied' }, box: null }],
};

function fakeSocket() {
  const sent: ClientMessage[] = [];
  const socket = {
    open: false,
    send: (message: ClientMessage) => {
      sent.push(message);
      return true;
    },
  };
  return { socket, sent };
}

function request(screenId: string): ServerEvent {
  return { type: 'screen.request', screenId: DeviceId.parse(screenId), requestId: REQUEST_ID };
}

function responding(read = vi.fn(async () => SCREEN)) {
  const tap = createEventTap();
  const { socket, sent } = fakeSocket();
  tap.attach(socket);
  const stop = createScreenResponder(tap, () => SELF, read);
  return { tap, socket, sent, read, stop };
}

describe('the screen responder', () => {
  it('says one hello each time the socket opens and nothing else', () => {
    const { tap, sent, read } = responding();

    tap.opened();
    tap.heard({ type: 'library.updated' });

    expect(sent).toEqual([{ type: 'screen.hello', ...SELF }]);
    expect(read).not.toHaveBeenCalled();
  });

  it('answers a request addressed to its own screen with what it reads', async () => {
    const { tap, sent } = responding();

    tap.heard(request('tv-salon-01'));

    await vi.waitFor(() => {
      expect(sent).toEqual([{ type: 'screen.reply', requestId: REQUEST_ID, screen: SCREEN }]);
    });
  });

  it('stays silent for another screen and for a malformed request', async () => {
    const { tap, sent, read } = responding();
    const malformed = request('tv-salon-01');
    Reflect.set(malformed, 'requestId', 42);

    tap.heard(request('tv-chambre-02'));
    tap.heard(malformed);
    await Promise.resolve();

    expect(read).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('says nothing when the screen cannot be read', async () => {
    const read = vi.fn(async () => {
      throw new Error('no tree');
    });
    const { tap, sent } = responding(read);

    tap.heard(request('tv-salon-01'));
    await vi.waitFor(() => {
      expect(read).toHaveBeenCalled();
    });

    expect(sent).toEqual([]);
  });

  it('hears nothing once stopped', () => {
    const { tap, sent, stop } = responding();

    stop();
    tap.opened();

    expect(sent).toEqual([]);
  });
});
