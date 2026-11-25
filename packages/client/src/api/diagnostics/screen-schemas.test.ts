import { describe, expect, it } from 'vitest';
import { ServerEvent } from '../events';
import { SCREEN_MAX_ROWS, Screen, ScreenClientMessage, ScreenDevice, ScreenRow } from './schemas';

const ROW = {
  depth: 1,
  name: 'Dialog.Footer',
  props: { open: true, size: 2, title: 'Réglages', icon: null },
  box: { x: 0, y: 10.5, width: 1920, height: 80 },
};

const SCREEN = { fibers: 42, truncated: false, rows: [ROW, { ...ROW, depth: 2, box: null }] };

describe('a screen on the wire', () => {
  it('reads rows with every kind of prop and a missing box', () => {
    expect(Screen.parse(SCREEN)).toEqual(SCREEN);
  });

  it('refuses a nested prop, a negative depth and an empty name', () => {
    expect(ScreenRow.safeParse({ ...ROW, props: { style: { a: 1 } } }).success).toBe(false);
    expect(ScreenRow.safeParse({ ...ROW, depth: -1 }).success).toBe(false);
    expect(ScreenRow.safeParse({ ...ROW, name: '' }).success).toBe(false);
  });

  it('refuses more rows than an answer carries', () => {
    const rows = Array.from({ length: SCREEN_MAX_ROWS + 1 }, () => ROW);

    expect(Screen.safeParse({ ...SCREEN, rows }).success).toBe(false);
  });

  it('reads a roster entry and refuses an id that is not a device id', () => {
    const device = { id: 'tv-salon-01', name: 'Salon', platform: 'Tizen' };

    expect(ScreenDevice.parse(device)).toEqual(device);
    expect(ScreenDevice.safeParse({ ...device, id: '../x' }).success).toBe(false);
  });

  it('reads the request frame among the server events', () => {
    const frame = { type: 'screen.request', screenId: 'tv-salon-01', requestId: 'f'.repeat(64) };

    expect(ServerEvent.parse(frame)).toEqual(frame);
  });

  it('reads the hello and the reply a screen says', () => {
    const hello = {
      type: 'screen.hello',
      screenId: 'tv-salon-01',
      name: 'Salon',
      platform: 'Tizen',
    };
    const reply = { type: 'screen.reply', requestId: 'r1', screen: SCREEN };

    expect(ScreenClientMessage.parse(hello)).toEqual(hello);
    expect(ScreenClientMessage.parse(reply)).toEqual(reply);
  });
});
