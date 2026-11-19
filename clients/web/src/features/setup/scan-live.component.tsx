import { useT } from '@kromatv/ui';
import { Box, classes, Progress, Row, styles, Text, useStyles } from '@kromatv/ui/kit';
import type { ScanFeed, ScanPhase } from '#web/features/setup/scan-feed';

const EMPTY_SLOTS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const SHOWN = EMPTY_SLOTS.length;

const PHASE_LINE = {
  reading: 'setup.scanReading',
  matching: 'setup.scanMatching',
  ready: 'setup.scanReady',
} as const satisfies Record<ScanPhase, string>;

const sDefinition = styles({
  pulse: {
    width: 8,
    height: 8,
    radius: 'pill',
    bg: 'accent',
    animationKeyframes: 'kroma-breathe',
    animationDuration: '1400ms',
    animationIterationCount: 'infinite',
  },
  still: { width: 8, height: 8, radius: 'pill', bg: 'success' },
  strip: { display: 'grid', gridTemplateColumns: `repeat(${SHOWN}, minmax(0, 1fr))`, gap: 8 },
  poster: {
    display: 'block',
    width: '100%',
    aspectRatio: '2 / 3',
    radius: 'md',
    objectFit: 'cover',
    bg: 'surface2',
    animationKeyframes: 'fade-in',
    animationDuration: '700ms',
    animationTimingFunction: 'var(--ease-out)',
    animationFillMode: 'both',
  },
  empty: { aspectRatio: '2 / 3', radius: 'md', bg: 'surface2' },
});

function Posters({ posters }: Readonly<{ posters: readonly string[] }>) {
  const s = useStyles(sDefinition);
  const shown = posters.slice(0, SHOWN);
  return (
    <div className={classes(s.strip)}>
      {shown.map((poster) => (
        <img key={poster} alt="" src={poster} className={classes(s.poster)} />
      ))}
      {EMPTY_SLOTS.slice(shown.length).map((slot) => (
        <div key={slot} className={classes(s.empty)} />
      ))}
    </div>
  );
}

/** The scan as it happens: how many titles the library holds, how many are
 * matched, and the newest posters as they arrive. */
export function ScanLive({ feed }: Readonly<{ feed: ScanFeed }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const line = t(PHASE_LINE[feed.phase]);
  const share = feed.found > 0 ? feed.matched / feed.found : 0;
  return (
    <Box gap={16} p={20} radius="xl" bg="surface2" border="border">
      <Row between align="center" gap={12}>
        <Row align="center" gap={10}>
          <div className={classes(feed.phase === 'ready' ? s.still : s.pulse)} />
          <Text variant="label">{line}</Text>
        </Row>
        <Text variant="meta" color="textMuted">
          {t('setup.scanMatched', { matched: feed.matched, found: feed.found })}
        </Text>
      </Row>
      <Row align="flex-end" gap={10}>
        <Text variant="hero">{feed.found.toLocaleString()}</Text>
        <Text color="textMuted" mb={10}>
          {t('setup.scanFound')}
        </Text>
      </Row>
      <Progress value={share} waiting={feed.phase === 'reading'} label={line} />
      <Posters posters={feed.posters} />
    </Box>
  );
}
