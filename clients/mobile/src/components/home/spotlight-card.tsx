import { sizedImageUrl, synopsisLead } from '@kromatv/core';
import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { Pressable, useWindowDimensions } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import {
  entryBackdrop,
  entryId,
  entryRoute,
  entryTitle,
  type RowEntry,
} from '#mobile/lib/home-sections';
import { useT } from '#mobile/lib/i18n';
import { contentWidth, useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

const SYNOPSIS_BUDGET = 160;

/** One title given the width of the page: its backdrop, why it was picked and
 *  the start of its synopsis. */
export function SpotlightCard({ row }: Readonly<{ row: RowEntry }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const router = useRouter();
  const gutters = useGutters();
  const { width: windowWidth } = useWindowDimensions();
  const { entry, note } = row;
  const width = Math.min(windowWidth - gutters.left - gutters.right, contentWidth.reading);
  const title = entryTitle(entry);
  const synopsis = synopsisLead(
    (entry.type === 'movie' ? entry.item : entry.show).metadata?.overview,
    SYNOPSIS_BUDGET,
  );

  return (
    <Pressable
      onPress={() => router.push(entryRoute(entry))}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t('content.seeDetails')}
      style={({ pressed }) => [s.card, { width }, pressed && s.cardPressed]}
    >
      <FadeImage
        uri={sizedImageUrl(entryBackdrop(entry, client), width)}
        seed={entryId(entry)}
        style={s.art}
      />
      <Box style={s.text}>
        {note ? (
          <Text lines={1} style={s.note}>
            {note}
          </Text>
        ) : null}
        <Text lines={2} style={s.title}>
          {title}
        </Text>
        {synopsis ? <Text style={s.overview}>{synopsis}</Text> : null}
      </Box>
    </Pressable>
  );
}

const sDefinition = styles({
  card: { self: 'center', bg: 'surface1', radius: radius.lg, overflow: 'hidden' },
  cardPressed: { opacity: 0.75 },
  art: { w: '100%', aspectRatio: 16 / 9 },
  text: { gap: spacing.xs, p: spacing.md },
  note: { ...type.caption, color: 'accentText', fontWeight: '700' },
  title: { ...type.heading },
  overview: { ...type.caption },
});
