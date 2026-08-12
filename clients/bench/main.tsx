// The performance bench: the browse screens' real components over generated data.
// Served by `clients/tv-build/perf-bench.ts`; size it with `?rails=8&tiles=20`.

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
  Text,
  useGrowingCount,
} from '@kroma/ui/kit';
import { createRoot } from 'react-dom/client';

configureRemote();

const params = new URLSearchParams(location.search);
const RAILS = Number(params.get('rails') ?? 8);
const TILES = Number(params.get('tiles') ?? 20);
// Cache-busted per tile so each tile actually decodes, instead of reusing one image.
const ART = params.get('art');
const WIDTH = params.get('w');
// react-native-web has no native animation driver: each loader is a JS timer writing
// an inline style every frame, so `?loaders=N` stress-tests that cost.
const LOADERS = Number(params.get('loaders') ?? 0);

const artFor = (n: number): string | null => {
  if (!ART) return null;
  const sized = WIDTH ? `${ART}?w=${WIDTH}&v=${n}` : `${ART}?v=${n}`;
  return sized;
};

const tint = (n: number): [string, string] => [
  `hsl(${(n * 37) % 360} 30% 24%)`,
  `hsl(${(n * 37) % 360} 30% 12%)`,
];

// Same as the home screen: three rails mount, the rest arrive as focus comes down.
const ROW_CHUNK = 3;

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
      {/* Without a bounded height a scroller does not clip, and the bench would
          measure a page that cannot scroll. */}
      <Box fill bg="bg">
        <FocusScroll
          style={{ flex: 1, minHeight: 0 }}
          contentStyle={{ paddingTop: 24 }}
          offsetFromStart={120}
        >
          {GRID.slice(0, count).map((rail, row) => (
            <FocusSlot key={rail.id} onActive={isNearEnd(row) ? grow : undefined}>
              <Box mb={8} mt={18}>
                <Rail.Root>
                  <Rail.Title>{rail.title}</Rail.Title>
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
                </Rail.Root>
              </Box>
            </FocusSlot>
          ))}
          <Loaders count={LOADERS} />
          <Text color="textDim">{`${RAILS} rows x ${TILES} tiles`}</Text>
        </FocusScroll>
      </Box>
    </FocusScope>
  );
}

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
