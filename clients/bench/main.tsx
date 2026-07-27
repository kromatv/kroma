// The performance bench: the app's real rendering path, without the app.
//
// A television's cost is rows of artwork and a focus that moves through them,
// and measuring that used to need a signed-in server, a populated library and a
// TV on the desk. This mounts the SAME components the browse screens use - the
// navigator, <Rail>, <MediaCard>, the focus ring and its transition - over
// generated data, so a number is reproducible on any machine and comparable
// between two commits.
//
// Served by `clients/tv-build/perf-bench.ts`, which drives it with the remote's
// keys and reads `KROMA_PERF`. Size it with `?rails=8&tiles=20`.

import {
  Box,
  configureRemote,
  FocusScope,
  FocusScroll,
  FocusSlot,
  MediaCard,
  Rail,
  Skeleton,
  Spinner,
  Txt,
  useGrowingCount,
} from '@kroma/ui/kit';
import { createRoot } from 'react-dom/client';

configureRemote();

const params = new URLSearchParams(location.search);
const RAILS = Number(params.get('rails') ?? 8);
const TILES = Number(params.get('tiles') ?? 20);
/**
 * Real artwork, because decoding it is most of what a television spends its
 * time on and a bench without images measures the wrong thing. One cached image
 * from a running server, requested once per tile with a cache-buster so each
 * tile really decodes - which is what a browse grid does.
 *
 * `w` is the rendition width the server is asked for (`?w=`), so the two modes
 * that matter can be compared directly: full-size against the displayed size.
 */
const ART = params.get('art');
const WIDTH = params.get('w');
/**
 * How many looping animations to run alongside the rails (`?loaders=N`).
 *
 * The kit's spinner, skeleton and caret animate forever while something is
 * loading, and on the browser targets they are the one thing that can cost a
 * frame callback EACH: react-native-web has no native animation driver, so an
 * `Animated.loop` there is a JS timer writing an inline style every frame. This
 * is the knob that makes that cost visible - the player's buffering overlay is
 * `?loaders=1` competing with a decode, and a loading browse grid is `?loaders=30`.
 */
const LOADERS = Number(params.get('loaders') ?? 0);

const artFor = (n: number): string | null => {
  if (!ART) return null;
  const sized = WIDTH ? `${ART}?w=${WIDTH}&v=${n}` : `${ART}?v=${n}`;
  return sized;
};

/** A deterministic tint per tile, so runs are comparable. */
const tint = (n: number): [string, string] => [
  `hsl(${(n * 37) % 360} 30% 24%)`,
  `hsl(${(n * 37) % 360} 30% 12%)`,
];

/** Same as the home screen: three rails mount, the rest arrive as focus comes
 * down. The bench measures the app's behaviour, not a stripped version of it. */
const ROW_CHUNK = 3;

/** The grid, built once as DATA. The bench is synthetic, so a row could be keyed
 * on its position - but building it up front means every tile carries an id, and
 * the render below reads like the real screens it stands in for. */
const GRID = Array.from({ length: RAILS }, (_, row) => ({
  id: `row-${row}`,
  title: `Row ${row + 1}`,
  tiles: Array.from({ length: TILES }, (_, col) => ({
    id: `tile-${row}-${col}`,
    title: `Title ${row + 1}-${col + 1}`,
    autoFocus: row === 0 && col === 0,
    seed: row * TILES + col,
  })),
}));

function Bench() {
  const { count, isNearEnd, grow } = useGrowingCount(RAILS, ROW_CHUNK);
  return (
    <FocusScope>
      {/* A screen-sized box around the scroller, exactly as every browse screen
          has it (`<Box fill>`): without a bounded height a scroller does not
          clip, and the bench would measure a page that cannot scroll. */}
      <Box fill bg="bg">
        <FocusScroll
          style={{ flex: 1, minHeight: 0 }}
          contentStyle={{ paddingTop: 24 }}
          offsetFromStart={120}
        >
          {GRID.slice(0, count).map((rail, row) => (
            <FocusSlot key={rail.id} onActive={isNearEnd(row) ? grow : undefined}>
              <Box mb={8} mt={18}>
                <Rail title={rail.title}>
                  {rail.tiles.map((tile) => (
                    <MediaCard
                      key={tile.id}
                      autoFocus={tile.autoFocus}
                      title={tile.title}
                      overline="Movie"
                      art={artFor(tile.seed)}
                      tint={tint(tile.seed)}
                      width={330}
                      onPress={() => {}}
                    />
                  ))}
                </Rail>
              </Box>
            </FocusSlot>
          ))}
          <Loaders count={LOADERS} />
          <Txt color="textDim">{`${RAILS} rows x ${TILES} tiles`}</Txt>
        </FocusScroll>
      </Box>
    </FocusScope>
  );
}

/** `count` busy rings and pulsing placeholders, running for the whole walk. */
function Loaders({ count }: Readonly<{ count: number }>) {
  if (count <= 0) return null;
  return (
    <Box row wrap gap={12} mt={24}>
      {Array.from({ length: count }, (_, n) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the identity - these are N copies of one thing.
        <Box key={n} row align="center" gap={8}>
          <Spinner size={28} />
          <Skeleton w={90} h={14} />
        </Box>
      ))}
    </Box>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Bench />);
