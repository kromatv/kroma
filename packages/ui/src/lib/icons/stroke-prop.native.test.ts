// The two Tabler packages disagree on which prop carries an icon's outline
// weight, and getting it wrong is quiet: the icon still draws, at the default
// weight, with nothing in the console.

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
    // icon.tsx spreads `{ [STROKE_PROP]: stroke }`, so it must be a string key.
    for (const prop of [NATIVE, WEB]) {
      expect({ [prop]: 1.75 }).toEqual({ [prop]: 1.75 });
      expect(typeof prop).toBe('string');
    }
  });
});
