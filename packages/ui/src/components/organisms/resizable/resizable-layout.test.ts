import { describe, expect, it } from 'vitest';
import {
  adjust,
  collapsedAt,
  defaultLayout,
  limitsFor,
  type PanelSpec,
  percentOf,
  pointsOf,
  resetSeam,
  resizePanel,
  sameLayout,
  solve,
} from './resizable-layout';

const at = (specs: readonly PanelSpec[], available = 1000) => limitsFor(specs, available);

const OPEN: readonly PanelSpec[] = [{}, {}];

describe('percentOf', () => {
  it('reads points against the group they were measured for', () => {
    expect(percentOf('280px', 1400)).toBe(20);
    expect(percentOf(25, 1400)).toBe(25);
  });

  it('cannot resolve points before the group has been measured', () => {
    expect(percentOf('280px', 0)).toBeUndefined();
    expect(percentOf('nonsense' as `${number}px`, 1000)).toBeUndefined();
    expect(percentOf(Number.NaN, 1000)).toBeUndefined();
  });

  it('goes back to points', () => {
    expect(pointsOf(20, 1400)).toBe(280);
  });
});

describe('limitsFor', () => {
  it('resolves both spellings of every bound', () => {
    expect(at([{ minSize: '200px', maxSize: 60 }])[0]).toEqual({
      min: 20,
      max: 60,
      collapsible: false,
      collapsedSize: 20,
    });
  });

  it('holds a maximum to the minimum beside it rather than crossing it', () => {
    expect(at([{ minSize: 40, maxSize: 10 }])[0]?.max).toBe(40);
  });

  it('gives a panel that says nothing the whole group to move in', () => {
    expect(at([{}])[0]).toEqual({ min: 0, max: 100, collapsible: false, collapsedSize: 0 });
  });

  it('shuts a collapsible panel to nothing unless it names a size', () => {
    expect(at([{ collapsible: true, minSize: 20 }])[0]?.collapsedSize).toBe(0);
    expect(at([{ collapsible: true, minSize: 20, collapsedSize: '60px' }])[0]?.collapsedSize).toBe(
      6,
    );
  });
});

describe('defaultLayout', () => {
  it('splits the group between the panels that state nothing', () => {
    expect(defaultLayout([{}, {}, {}], 1000)).toEqual([100 / 3, 100 / 3, 100 / 3]);
  });

  it('leaves the stated ones alone and shares what they leave', () => {
    expect(defaultLayout([{ defaultSize: 20 }, {}, {}], 1000)).toEqual([20, 40, 40]);
  });

  it('reads a points default against the measured group', () => {
    expect(defaultLayout([{ defaultSize: '250px' }, {}], 1000)).toEqual([25, 75]);
  });

  it('shares nothing out where every panel states its own size', () => {
    expect(defaultLayout([{ defaultSize: 30 }, { defaultSize: 70 }], 1000)).toEqual([30, 70]);
  });
});

describe('solve', () => {
  it('lifts a panel to its floor and takes the difference from the rest', () => {
    expect(solve([5, 95], at([{ minSize: 20 }, {}]))).toEqual([20, 80]);
  });

  it('restores the sum when the wish is short of the whole group', () => {
    expect(solve([10, 10], at(OPEN))).toEqual([50, 50]);
  });

  it('leaves the panels where they are when nothing is out of bounds', () => {
    expect(solve([30, 70], at(OPEN))).toEqual([30, 70]);
  });

  it('spreads what it takes back in proportion to the room each panel has', () => {
    expect(solve([60, 30, 30], at([{}, {}, {}]))).toEqual([50, 25, 25]);
  });

  it('cannot pull a shut panel back open', () => {
    const limits = at([{ collapsible: true, minSize: 20 }, {}]);
    expect(solve([0, 80], limits)).toEqual([0, 100]);
  });

  it('settles a collapsible panel out of the dead zone it may not rest in', () => {
    const limits = at([{ collapsible: true, minSize: 20 }, {}]);
    expect(solve([4, 96], limits)[0]).toBe(0);
    expect(solve([16, 84], limits)[0]).toBe(20);
  });

  it('takes nothing back from a shut panel when the group has to shrink', () => {
    const limits = at([{ collapsible: true, minSize: 20 }, {}, {}]);
    expect(solve([0, 60, 60], limits)).toEqual([0, 50, 50]);
  });

  it('keeps a layout that cannot be made to fill a group with nothing left to give', () => {
    expect(solve([40, 40], at([{ maxSize: 40 }, { maxSize: 40 }]))).toEqual([40, 40]);
  });

  // A controlled `layout` naming more panels than the group holds: the extra
  // ones have no bounds of their own to be held to.
  it('leaves a panel it was given no bounds for where the caller put it', () => {
    expect(solve([50, 30, 10], at(OPEN))).toEqual([54.167, 35.833, 10]);
  });
});

describe('adjust', () => {
  it('moves the seam, growing the panel behind it', () => {
    expect(adjust([25, 75], 0, 10, at(OPEN))).toEqual([35, 65]);
    expect(adjust([25, 75], 0, -10, at(OPEN))).toEqual([15, 85]);
  });

  it('stops where the panel it is taking from runs out', () => {
    expect(adjust([25, 75], 0, 60, at([{}, { minSize: 30 }]))).toEqual([70, 30]);
  });

  it('carries on into the panels beyond the two it separates', () => {
    const limits = at([{}, { minSize: 40 }, { minSize: 10 }]);
    expect(adjust([20, 60, 20], 0, 30, limits)).toEqual([50, 40, 10]);
  });

  it('is a no-op on a seam that separates nothing', () => {
    expect(adjust([50, 50], 1, 10, at(OPEN))).toEqual([50, 50]);
    expect(adjust([50, 50], -1, 10, at(OPEN))).toEqual([50, 50]);
    expect(adjust([50, 50], 0, Number.NaN, at(OPEN))).toEqual([50, 50]);
  });

  it('shuts a collapsible panel a drag takes past halfway', () => {
    const limits = at([{ collapsible: true, minSize: 20 }, {}]);
    expect(adjust([20, 80], 0, -15, limits)).toEqual([0, 100]);
    expect(adjust([20, 80], 0, -5, limits)).toEqual([20, 80]);
  });

  it('pulls a shut panel back open, which redistribution never does', () => {
    const limits = at([{ collapsible: true, minSize: 20 }, {}]);
    expect(adjust([0, 100], 0, 18, limits)).toEqual([20, 80]);
    expect(adjust([0, 100], 0, 4, limits)).toEqual([0, 100]);
  });

  it('holds a seam whose panel is already at its ceiling', () => {
    expect(adjust([50, 50], 0, 10, at([{ maxSize: 50 }, {}]))).toEqual([50, 50]);
  });

  it('moves a seam inside a layout naming more panels than the group has', () => {
    expect(adjust([40, 30, 30], 0, 10, at(OPEN))).toEqual([50, 20, 30]);
  });
});

describe('resizePanel', () => {
  it('asks the seam after the panel for the room', () => {
    expect(resizePanel([25, 75], 0, 40, at(OPEN))).toEqual([40, 60]);
  });

  it('asks the seam before it for the last panel, which has none after it', () => {
    expect(resizePanel([25, 75], 1, 90, at(OPEN))).toEqual([10, 90]);
  });

  it('does nothing to a group with a single panel', () => {
    expect(resizePanel([100], 0, 40, at([{}]))).toEqual([100]);
  });
});

describe('resetSeam', () => {
  it('puts its two panels back in the proportion they opened at', () => {
    expect(resetSeam([60, 40], 0, [25, 75], at(OPEN))).toEqual([25, 75]);
  });

  it('leaves every other panel where the reader left it', () => {
    const limits = at([{}, {}, {}]);
    expect(resetSeam([10, 30, 60], 0, [20, 20, 60], limits)).toEqual([20, 20, 60]);
  });

  it('is a no-op past the last seam', () => {
    expect(resetSeam([50, 50], 5, [50, 50], at(OPEN))).toEqual([50, 50]);
  });

  it('holds a seam whose panels were never given an opening size', () => {
    expect(resetSeam([40, 30, 30], 1, [50, 50], at([{}, {}, {}]))).toEqual([40, 30, 30]);
  });

  it('holds a seam whose two panels both opened at nothing', () => {
    expect(resetSeam([40, 60], 0, [0, 0], at(OPEN))).toEqual([40, 60]);
  });
});

describe('collapsedAt', () => {
  it('is only ever true of a panel that asked to be collapsible', () => {
    const [shuts, holds] = at([{ collapsible: true, minSize: 20 }, { minSize: 20 }]);
    expect(shuts && collapsedAt(0, shuts)).toBe(true);
    expect(shuts && collapsedAt(20, shuts)).toBe(false);
    expect(holds && collapsedAt(0, holds)).toBe(false);
  });
});

describe('sameLayout', () => {
  it('reads to the precision the solver rounds to', () => {
    expect(sameLayout([25, 75], [25.0001, 74.9999])).toBe(true);
    expect(sameLayout([25, 75], [26, 74])).toBe(false);
    expect(sameLayout([25, 75], [25])).toBe(false);
  });
});
