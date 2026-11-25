import type { Season } from '@kromatv/client/media';
import { posterColors } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Box,
  PosterCard,
  Rail,
  styles,
  Text,
  typeSpec as textRoles,
  useStyles,
} from '@kromatv/ui/kit';

const POSTER_W = 180;

type SeasonRowProps = Readonly<{
  seasons: readonly Season[];
  current: number | undefined;
  posterFor: (season: Season, width: number) => string | null;
  onPick: (number: number) => void;
}>;

/** A show's seasons as a row of posters, the one on screen picked. `posterFor`
 * resolves a season's poster at the width it is drawn. */
export function SeasonRow(row: SeasonRowProps) {
  const s = useStyles(sDefinition);
  const t = useT();

  return (
    <Box gap={18} mt={30}>
      <Text style={s.label} color="textMuted">
        {t('content.seasonsHeader')}
      </Text>
      <Rail.Root inset={12} gap={20}>
        {row.seasons.map((season) => (
          <SeasonPoster key={season.number} season={season} row={row} />
        ))}
      </Rail.Root>
    </Box>
  );
}

function SeasonPoster({ season, row }: Readonly<{ season: Season; row: SeasonRowProps }>) {
  const t = useT();
  return (
    <PosterCard
      width={POSTER_W}
      title={t('content.season', { number: season.number })}
      art={row.posterFor(season, POSTER_W)}
      tint={posterColors(String(season.number))}
      selected={season.number === row.current}
      onPress={() => row.onPick(season.number)}
    />
  );
}

const sDefinition = styles({
  label: { fontSize: textRoles.label.size, fontWeight: '700', letterSpacing: 0.6 },
});
