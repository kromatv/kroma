import { Box, Numeral, numeralColumn, styles, useStyles } from '@kromatv/ui/kit';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { posterHeight, sectionCard } from '#mobile/components/cards';
import { FadeImage } from '#mobile/components/FadeImage';
import type { RowEntry } from '#mobile/lib/home-sections';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { posterWidth, radius, spacing } from '#mobile/lib/theme';

const NUMERAL_TUCK = -14;
const NUMERAL_SHARE = 0.72;

/** A countdown rail: each poster stands beside the rank the server gave it.
 *  The whole tile is the control, numeral included. */
export function RankedRail({ entries }: Readonly<{ entries: readonly RowEntry[] }>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const client = useClient();
  const router = useRouter();
  const gutters = useGutters();
  const { width: windowWidth } = useWindowDimensions();
  const width = posterWidth(windowWidth);
  const art = { width, height: posterHeight(width) };
  const numeral = Math.round(art.height * NUMERAL_SHARE);
  const column = numeralColumn(numeral);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[s.rail, gutters.style]}
    >
      {entries.map(({ entry, rank }) => {
        const card = sectionCard(entry, client, width);
        return (
          <Pressable
            key={card.key}
            onPress={() => router.push(card.route)}
            accessibilityRole="button"
            accessibilityLabel={[t('content.rankOf', { rank }), card.title].join(', ')}
            style={({ pressed }) => [s.tile, pressed && s.tilePressed]}
          >
            <Box style={[s.numeral, { width: column }]}>
              <Numeral value={rank} height={numeral} maxWidth={column} />
            </Box>
            <Box style={[art, s.art]}>
              <FadeImage
                uri={card.poster}
                seed={card.key}
                radius={radius.sm}
                style={StyleSheet.absoluteFill}
              />
            </Box>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const sDefinition = styles({
  rail: { gap: spacing.md },
  tile: { row: true, align: 'flex-end' },
  tilePressed: { opacity: 0.75 },
  numeral: { mr: NUMERAL_TUCK, align: 'flex-end' },
  art: { radius: radius.sm, overflow: 'hidden' },
});
