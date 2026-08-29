import { bench, describe } from 'vitest';
import { Directions, SpatialNavigator } from './index';

function rails(rows: number, tiles: number): SpatialNavigator {
  const nav = new SpatialNavigator();
  nav.registerNode('root', { orientation: 'vertical' });
  for (let row = 0; row < rows; row += 1) {
    nav.registerNode(`rail${row}`, { parent: 'root', index: row, orientation: 'horizontal' });
    for (let tile = 0; tile < tiles; tile += 1) {
      nav.registerNode(`t${row}_${tile}`, {
        parent: `rail${row}`,
        index: tile,
        focusable: true,
      });
    }
  }
  return nav;
}

function grid(rows: number, columns: number): SpatialNavigator {
  const nav = new SpatialNavigator();
  nav.registerNode('root', { orientation: 'vertical', alignInGrid: true });
  for (let row = 0; row < rows; row += 1) {
    nav.registerNode(`r${row}`, { parent: 'root', index: row, orientation: 'horizontal' });
    for (let column = 0; column < columns; column += 1) {
      nav.registerNode(`c${row}_${column}`, {
        parent: `r${row}`,
        index: column,
        focusable: true,
      });
    }
  }
  return nav;
}

// The home screen the app actually draws, and a browse grid's mounted window.
const HOME = { rows: 12, tiles: 20 };
const WINDOW = { rows: 9, columns: 8 };

describe('registration', () => {
  bench('a home screen, 12 rails of 20 tiles', () => {
    rails(HOME.rows, HOME.tiles);
  });

  bench("a browse grid's window, 9 rows of 8", () => {
    grid(WINDOW.rows, WINDOW.columns);
  });

  // Nothing in the app is this wide. It is here to show the shape of the cost:
  // a container's children are kept sorted, so registration is quadratic in the
  // width of ONE container and this is where that would show.
  bench('one container of 1000 children', () => {
    const nav = new SpatialNavigator();
    nav.registerNode('root', { orientation: 'horizontal' });
    for (let at = 0; at < 1000; at += 1) {
      nav.registerNode(`n${at}`, { parent: 'root', index: at, focusable: true });
    }
  });
});

describe('a press', () => {
  const home = rails(HOME.rows, HOME.tiles);
  home.focus('t6_10');
  bench('along a rail, there and back', () => {
    home.handle(Directions.RIGHT);
    home.handle(Directions.LEFT);
  });

  const across = rails(HOME.rows, HOME.tiles);
  across.focus('t6_10');
  bench('between rails, there and back', () => {
    across.handle(Directions.DOWN);
    across.handle(Directions.UP);
  });

  const aligned = grid(WINDOW.rows, WINDOW.columns);
  aligned.focus('c4_4');
  bench('down a grid column, there and back', () => {
    aligned.handle(Directions.DOWN);
    aligned.handle(Directions.UP);
  });

  const wide = rails(1, 1000);
  wide.focus('t0_500');
  bench('along a rail of 1000, there and back', () => {
    wide.handle(Directions.RIGHT);
    wide.handle(Directions.LEFT);
  });
});

describe('the window sliding', () => {
  const nav = grid(WINDOW.rows, WINDOW.columns);
  nav.focus('c4_4');
  let row = WINDOW.rows;
  bench('one row leaves and one arrives', () => {
    nav.registerNode(`r${row}`, { parent: 'root', index: row, orientation: 'horizontal' });
    for (let column = 0; column < WINDOW.columns; column += 1) {
      nav.registerNode(`c${row}_${column}`, {
        parent: `r${row}`,
        index: column,
        focusable: true,
      });
    }
    nav.unregisterNode(`r${row}`);
    row += 1;
  });
});
