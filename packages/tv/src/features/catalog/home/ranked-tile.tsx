import { useT } from '@kromatv/ui';
import { Box, Numeral, PosterCard, type PosterCardProps, styles, useStyles } from '@kromatv/ui/kit';
import { RANK_COLUMN, RANK_H, RANK_TUCK } from '#tv/features/catalog/home/tile-metrics';

const sDefinition = styles({
  rank: { w: RANK_COLUMN, mr: -RANK_TUCK, align: 'flex-end' },
});

interface RankedTileProps extends PosterCardProps {
  rank: number;
}

/** A top-ten tile: the rank as a numeral beside the title's poster, in one cell
 * of the rail. The poster is the control; the numeral only says where it stands. */
export function RankedTile({ rank, ...poster }: Readonly<RankedTileProps>) {
  const s = useStyles(sDefinition);

  const t = useT();
  return (
    <Box row align="flex-end">
      <Box style={s.rank}>
        <Numeral
          value={rank}
          height={RANK_H}
          maxWidth={RANK_COLUMN}
          color="textMuted"
          thickness={4}
          label={t('content.rankOf', { rank })}
        />
      </Box>
      <Box flex>
        <PosterCard {...poster} />
      </Box>
    </Box>
  );
}
