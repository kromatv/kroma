import { posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Box,
  color,
  Focusable,
  motion,
  Numeral,
  numeralColumn,
  rhythm,
  styles,
  useStyles,
  VirtualRail,
} from '@kromatv/ui/kit';
import { memo, useState } from 'react';
import {
  entryId,
  entryPoster,
  entryTitle,
  type HomeEntry,
  type HomeSection,
} from '#web/features/catalog/home/entries';
import { entryLink } from '#web/features/catalog/home/entry-link';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

const RANKED_CAP = 9;

const POSTER_W = Math.round(rhythm.cardWidth * 0.78);
const POSTER_H = Math.round(POSTER_W * 1.5);
const NUMERAL_H = Math.round(POSTER_H * 0.72);
const TUCK = 22;
const COLUMN = numeralColumn(NUMERAL_H);
const NUMERAL_W = COLUMN - TUCK;
const CELL_W = NUMERAL_W + POSTER_W;
const GAP = 10;
const PAD = 12;

const sDefinition = styles({
  rail: { height: POSTER_H + PAD * 2 },
  content: { py: PAD },
  cell: { w: '100%', maxW: CELL_W, h: POSTER_H, self: 'center' },
  hit: { w: '100%', h: '100%', radius: 'xl', row: true, align: 'flex-end' },
  numeral: { w: COLUMN, mr: -TUCK, align: 'flex-end' },
  poster: {
    w: POSTER_W,
    aspect: 2 / 3,
    radius: 'xl',
    overflow: 'hidden',
    outlineStyle: 'solid',
    outlineWidth: 3,
    outlineColor: 'transparent',
    transitionProperty: 'outline-color, transform',
    transitionDuration: `${motion.duration.base}ms`,
  },
  posterLit: { outlineColor: color('accent'), transform: [{ translateY: motion.focusLift }] },
});

interface RankedFaceProps {
  entry: HomeEntry;
  rank: number;
  hovered: boolean;
}

function RankedFace({ entry, rank, hovered }: Readonly<RankedFaceProps>) {
  const s = useStyles(sDefinition);
  const { client } = useAuth();

  return (
    <>
      <Box style={s.numeral}>
        <Numeral
          value={rank}
          height={NUMERAL_H}
          maxWidth={COLUMN}
          color={hovered ? 'accent' : 'textDim'}
        />
      </Box>
      <Box style={[s.poster, hovered ? s.posterLit : null]}>
        <Image
          src={entryPoster(client, entry, POSTER_W * 2)}
          background={`linear-gradient(158deg, ${posterColors(entryId(entry)).join(', ')})`}
          alt={entryTitle(entry)}
          fit="cover"
          fill
        />
      </Box>
    </>
  );
}

const RankedCard = memo(function RankedCard({
  entry,
  rank,
}: Readonly<{ entry: HomeEntry; rank: number }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const [hovered, setHovered] = useState(false);

  return (
    <Box
      style={s.cell}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Focusable
        label={`${t('content.rankOf', { rank })}, ${entryTitle(entry)}`}
        style={s.hit}
        asChild
      >
        {entryLink(entry, <RankedFace entry={entry} rank={rank} hovered={hovered} />)}
      </Focusable>
    </Box>
  );
});

/** A row whose order is the point: each poster stands beside its rank. */
export function RankedRail({ section }: Readonly<{ section: HomeSection }>) {
  const s = useStyles(sDefinition);
  return (
    <VirtualRail
      data={section.items.slice(0, RANKED_CAP)}
      itemWidth={CELL_W + GAP}
      gap={GAP}
      style={s.rail}
      contentStyle={s.content}
      renderItem={(entry, index) => <RankedCard entry={entry} rank={index + 1} />}
    />
  );
}
