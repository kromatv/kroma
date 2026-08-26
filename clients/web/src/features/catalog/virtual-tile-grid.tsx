import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type GridGeometry,
  type GridShape,
  gridShape,
  type RowWindow,
  rowWindow,
  TILE_GAP,
} from '#web/shared/lib/tile-layout';

const OVERSCAN = 3;

const NOTHING: RowWindow = { first: 0, count: 0 };

// Chrome re-anchors the scroll position when content above the viewport changes
// size, which is exactly what mounting a row is. Left on, its compensation
// fires the scroll listener, which mounts another row, which compensates again:
// the page runs away to the end.
const BOX: CSSProperties = { position: 'relative', overflowAnchor: 'none' };

const ROW: CSSProperties = { position: 'absolute', left: 0, right: 0, display: 'flex' };

// Measured before paint rather than through <Box onLayout>, whose observer
// lands a frame late: for that frame the grid would reserve no height at all,
// and a browser restoring a scroll position clamps it against a page that is
// briefly one viewport tall.
function useRoom(box: RefObject<HTMLDivElement | null>): number {
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () =>
      setRoom((current) => (current === el.clientWidth ? current : el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [box]);
  return room;
}

function useRowWindow(box: RefObject<HTMLDivElement | null>, shape: GridShape): RowWindow {
  const [shown, setShown] = useState<RowWindow>(NOTHING);
  const { rows, pitch } = shape;
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = box.current;
      if (!el) return;
      const next = rowWindow({
        rows,
        pitch,
        top: el.getBoundingClientRect().top,
        viewport: window.innerHeight,
        overscan: OVERSCAN,
      });
      setShown((current) =>
        current.first === next.first && current.count === next.count ? current : next,
      );
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [box, rows, pitch]);
  return shown;
}

export interface VirtualTileGridProps<T> {
  data: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, width: number) => ReactNode;
}

/** The catalogue's poster grid at library scale: it reserves the height of
 * every row and mounts only the ones near the viewport. `TileGrid` is the one
 * to reach for where the whole list fits a screen or two. */
export function VirtualTileGrid<T>({ data, keyOf, renderItem }: Readonly<VirtualTileGridProps<T>>) {
  const box = useRef<HTMLDivElement>(null);
  const room = useRoom(box);
  const shape = gridShape(room, data.length);
  const shown = useRowWindow(box, shape);
  const rows: number[] = [];
  for (let row = shown.first; row < shown.first + shown.count; row++) rows.push(row);

  return (
    <div
      ref={box}
      data-tile-columns={shape.columns}
      data-tile-pitch={shape.pitch}
      style={{ ...BOX, height: shape.height }}
    >
      {rows.map((row) => (
        // Keyed by the row's place in the WHOLE grid, never by its place in the
        // window: keyed positionally, a shift of one row hands every key a
        // different title, and React remounts the lot. A remounted tile loses
        // the focus it was holding and replays its artwork's fade-in.
        <div key={row} style={{ ...ROW, top: row * shape.pitch, gap: TILE_GAP }}>
          {data.slice(row * shape.columns, (row + 1) * shape.columns).map((item) => (
            <Fragment key={keyOf(item)}>{renderItem(item, shape.cell)}</Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The laid-out grid inside `root`, measured once so a caller asking about
 * many rows forces one layout rather than one per question. */
export function gridGeometry(root: HTMLElement | null | undefined): GridGeometry | null {
  const grid = root?.querySelector<HTMLElement>('[data-tile-pitch]');
  if (!grid) return null;
  const columns = Number(grid.dataset.tileColumns);
  const pitch = Number(grid.dataset.tilePitch);
  if (!(columns > 0 && pitch > 0)) return null;
  const box = grid.getBoundingClientRect();
  return { top: box.top, bottom: box.bottom, columns, pitch };
}
