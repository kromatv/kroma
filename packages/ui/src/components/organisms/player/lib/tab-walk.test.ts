import { describe, expect, it } from 'vitest';
import type { ControlId } from './nav';
import { nextTabStop, type TabWalk } from './tab-walk';

const CONTROLS: ControlId[] = ['rewind', 'play', 'forward', 'volume', 'fullscreen'];

function at(over: Partial<TabWalk> = {}): TabWalk {
  return {
    zone: 'controls',
    control: 'rewind',
    drawnControls: CONTROLS,
    sheetHasItems: true,
    ...over,
  };
}

describe('nextTabStop forward', () => {
  it('opens on the back button and climbs down to the seek bar', () => {
    expect(nextTabStop(at({ zone: 'back', control: null }), false)).toEqual({ zone: 'progress' });
  });

  it('leaves the seek bar for the leftmost control, never the last one focused', () => {
    expect(nextTabStop(at({ zone: 'progress', control: 'fullscreen' }), false)).toEqual({
      zone: 'controls',
      control: 'rewind',
    });
  });

  it('walks the control row one control at a time', () => {
    expect(nextTabStop(at({ control: 'play' }), false)).toEqual({
      zone: 'controls',
      control: 'forward',
    });
  });

  it('steps off the volume control rather than changing the level', () => {
    expect(nextTabStop(at({ control: 'volume' }), false)).toEqual({
      zone: 'controls',
      control: 'fullscreen',
    });
  });

  it('reaches the up-next sheet past the last control', () => {
    expect(nextTabStop(at({ control: 'fullscreen' }), false)).toEqual({ zone: 'sheet' });
  });

  it('stops at the last control when there is nothing up next', () => {
    expect(nextTabStop(at({ control: 'fullscreen', sheetHasItems: false }), false)).toBeNull();
  });
});

describe('nextTabStop backwards', () => {
  it('leaves the control row for the seek bar off the leftmost control', () => {
    expect(nextTabStop(at({ control: 'rewind' }), true)).toEqual({ zone: 'progress' });
  });

  it('climbs from the seek bar to the back button', () => {
    expect(nextTabStop(at({ zone: 'progress', control: null }), true)).toEqual({ zone: 'back' });
  });

  it('stops at the back button rather than dismissing the chrome', () => {
    expect(nextTabStop(at({ zone: 'back', control: null }), true)).toBeNull();
  });
});

describe('nextTabStop with a row the flags emptied', () => {
  it('walks the seek bar and the back button alone', () => {
    const bare = at({ zone: 'progress', control: null, drawnControls: [], sheetHasItems: false });

    expect(nextTabStop(bare, false)).toBeNull();
    expect(nextTabStop(bare, true)).toEqual({ zone: 'back' });
  });
});
