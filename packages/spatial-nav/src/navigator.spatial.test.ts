import { type Rect, SpatialNavigator } from '@kromatv/spatial-nav';
import { describe, expect, it } from 'vitest';

const TILE = 100;

/**
 * A page of rails, each scrolled by its own amount: tile `n` of a rail shows at
 * `n * 100 - scroll`. `spatial` is what the page declares; a tile named in
 * `blind` cannot say where it is.
 */
function page(
  scrolls: readonly number[],
  { spatial = true, blind = [] }: { spatial?: boolean; blind?: readonly string[] } = {},
): SpatialNavigator {
  const nav = new SpatialNavigator();
  nav.registerNode('page', { orientation: 'vertical', spatial });
  scrolls.forEach((scroll, row) => {
    nav.registerNode(`rail${row}`, { parent: 'page', orientation: 'horizontal' });
    for (let tile = 0; tile < 6; tile += 1) {
      const id = `r${row}t${tile}`;
      const rect = (): Rect | null =>
        blind.includes(id)
          ? null
          : { x: tile * TILE - scroll, y: row * 200, width: TILE - 10, height: 150 };
      nav.registerNode(id, { parent: `rail${row}`, focusable: true, rect });
    }
  });
  return nav;
}

describe('between the rails of a spatial page', () => {
  it('lands on the tile under the one it leaves, not on the first of the rail', () => {
    const nav = page([0, 0]);
    nav.focus('r0t3');

    nav.handle('down');

    expect(nav.focusedId).toBe('r1t3');
  });

  it('lands on the tile that shows under it when the rails are scrolled apart', () => {
    const nav = page([200, 0]);
    nav.focus('r0t4');

    nav.handle('down');

    expect(nav.focusedId).toBe('r1t2');
  });

  it('comes back up to the tile above, whatever the rail above remembers', () => {
    const nav = page([0, 0]);
    nav.focus('r0t1');
    nav.focus('r1t4');

    nav.handle('up');

    expect(nav.focusedId).toBe('r0t4');
  });

  it('goes right, down, then up and is back where it was', () => {
    const nav = page([0, 0, 0]);
    nav.focus('r0t0');
    nav.handle('right');
    nav.handle('right');

    nav.handle('down');
    expect(nav.focusedId).toBe('r1t2');
    nav.handle('up');

    expect(nav.focusedId).toBe('r0t2');
  });

  it('takes the nearest tile when none is under the one it leaves', () => {
    const nav = page([0, 700]);
    nav.focus('r0t5');

    nav.handle('down');

    expect(nav.focusedId).toBe('r1t5');
  });

  it('skips a tile that cannot say where it is', () => {
    const nav = page([0, 0], { blind: ['r1t3'] });
    nav.focus('r0t3');

    nav.handle('down');

    expect(['r1t2', 'r1t4']).toContain(nav.focusedId);
  });

  it('falls back on the rail own choice when the tile it leaves cannot say where it is', () => {
    const nav = page([0, 0], { blind: ['r0t3'] });
    nav.focus('r0t3');

    nav.handle('down');

    expect(nav.focusedId).toBe('r1t0');
  });
});

describe('a page that is not spatial', () => {
  it('keeps landing on the child a rail was last left on', () => {
    const nav = page([0, 0], { spatial: false });
    nav.focus('r1t4');
    nav.focus('r0t1');

    nav.handle('down');

    expect(nav.focusedId).toBe('r1t4');
  });
});
