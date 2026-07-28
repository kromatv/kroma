// Which prop carries an icon's outline WEIGHT, on each platform.
//
// The two Tabler packages agree on `size` and `color` but not on this name, and
// getting it wrong is QUIET: the icon still draws, at the default weight, so a
// whole shell's iconography goes subtly heavy with nothing in the console. That
// silence is the reason this is a named constant instead of a literal at the
// call site, and the reason the two spellings are pinned here.

import { describe, expect, it } from 'vitest';
import { STROKE_PROP as NATIVE } from './stroke-prop';
import { STROKE_PROP as WEB } from './stroke-prop.web';

describe('STROKE_PROP', () => {
  it('is strokeWidth on native, where plain `stroke` is the COLOUR', () => {
    // @tabler/icons-react-native's props extend react-native-svg's SvgProps.
    expect(NATIVE).toBe('strokeWidth');
  });

  it('is stroke on the web, which @tabler/icons-react applies as the width', () => {
    expect(WEB).toBe('stroke');
  });

  it('differs between the halves, which is the entire reason for the split', () => {
    expect(NATIVE).not.toBe(WEB);
  });

  it('is a usable computed key either way', () => {
    // icon.tsx builds `{ [STROKE_PROP]: stroke }` and spreads it, so the value
    // has to be a plain string key on both halves.
    for (const prop of [NATIVE, WEB]) {
      expect({ [prop]: 1.75 }).toEqual({ [prop]: 1.75 });
      expect(typeof prop).toBe('string');
    }
  });
});
