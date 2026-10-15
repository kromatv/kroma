import type { WatchableStoryboard } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import { drawnTileIndex, storyboardAsksAgain, storyboardTileIndex } from './watchable-storyboard';

const sheet = (over: Partial<WatchableStoryboard> = {}): WatchableStoryboard => ({
  url: 'http://kroma.test/sheet.jpg?t=tok&v=1',
  interval: 10,
  tileW: 160,
  tileH: 90,
  cols: 2,
  rows: 2,
  count: 4,
  duration: 40,
  complete: false,
  ready: '1100',
  ...over,
});

describe('whether a sheet is asked for again', () => {
  it('asks again while the module has not begun the sheet', () => {
    expect(storyboardAsksAgain('pending')).toBe(true);
  });

  it('asks again while tiles are still being drawn', () => {
    expect(storyboardAsksAgain(sheet({ complete: false }))).toBe(true);
  });

  it('stops once the sheet is complete', () => {
    expect(storyboardAsksAgain(sheet({ complete: true, ready: '1111' }))).toBe(false);
  });

  it('stops where the module offers no sheet', () => {
    expect(storyboardAsksAgain(null)).toBe(false);
  });
});

describe('the tile a second falls on', () => {
  it('counts tiles by the interval', () => {
    expect(storyboardTileIndex(sheet(), 25)).toBe(2);
  });

  it('holds a second past the end on the last tile', () => {
    expect(storyboardTileIndex(sheet(), 500)).toBe(3);
  });

  it('holds a second before the start on the first tile', () => {
    expect(storyboardTileIndex(sheet(), -3)).toBe(0);
  });

  it('has none on a sheet with no tiles', () => {
    expect(storyboardTileIndex(sheet({ count: 0 }), 5)).toBeNull();
  });
});

describe('a tile only where it is drawn', () => {
  it('yields a tile the sheet marks drawn', () => {
    expect(drawnTileIndex(sheet({ ready: '1100' }), 15)).toBe(1);
  });

  it('yields none for a tile the sheet has not reached', () => {
    expect(drawnTileIndex(sheet({ ready: '1100' }), 25)).toBeNull();
  });

  it('yields none for a tile past what the mask covers', () => {
    expect(drawnTileIndex(sheet({ ready: '11' }), 35)).toBeNull();
  });

  it('draws the whole of a catalogue sheet, which marks no tile', () => {
    const { ready: _, complete: __, ...catalogue } = sheet();

    expect(drawnTileIndex(catalogue, 35)).toBe(3);
  });
});
