import { posterColors, type SectionItem } from '@kroma/core';
import { useAiSuggest, useT } from '@kroma/ui';
import { Box, MediaCard, ProgressRing, RAIL_GAP, Rail, styles, Text } from '@kroma/ui/kit';
import { useClient, useNav } from '#tv/app/router';

// The "Suggestions IA" rail on a TV detail screen. `useAiSuggest` polls the
// lazily-generated section; a progress ring shows while it generates and
// cards render once items arrive (empty items or a timeout -> nothing).

// `pitch` is the tile pitch, not the card width: same recipe as TvHome's ROW_TILE.
const ROW_TILE = { pitch: 300 + RAIL_GAP, height: Math.round((300 * 9) / 16) };

// The CARD is 300 wide; the tile pitch above includes the gap, and asking for
// the pitch would over-fetch every tile in the row.
const TILE_ART_W = 300;

const s = styles({
  label: {
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'text/55',
  },
});

export function TvAiSuggestRow({ id }: Readonly<{ id: string }>) {
  const t = useT();
  const client = useClient();
  const { go } = useNav();
  const { section, pending, progress } = useAiSuggest(client, id);

  const card = (e: SectionItem) => {
    if (e.type === 'show') {
      const show = e.show;
      return (
        <MediaCard
          key={show.id}
          title={show.title}
          overline={show.metadata?.genres?.[0] ?? t('content.series')}
          art={client.backdropFor(show, TILE_ART_W) ?? client.showPosterFor(show, TILE_ART_W)}
          tint={posterColors(show.id)}
          onPress={() => go('show', { show })}
        />
      );
    }
    const m = e.item;
    return (
      <MediaCard
        key={m.id}
        title={m.title}
        overline={m.metadata?.genres?.[0] ?? t('content.film')}
        art={client.backdropFor(m, TILE_ART_W) ?? client.posterFor(m, TILE_ART_W)}
        tint={posterColors(m.id)}
        onPress={() => go('movie', { item: m })}
      />
    );
  };

  if (section && section.items.length > 0) {
    return (
      <Box mt={40} gap={16}>
        <Text style={s.label}>{section.title}</Text>
        {section.reason ? (
          <Text maxW={680} color="textMuted">
            {section.reason}
          </Text>
        ) : null}
        {/* The rail pads itself by the 10-foot gutter by default; this one
            sits inside a detail column with its own padding, so it opts out. */}
        <Rail.Root inset={0}>
          <Rail.List {...ROW_TILE}>{section.items.map(card)}</Rail.List>
        </Rail.Root>
      </Box>
    );
  }

  // Still generating -> a subtle hint; terminal-empty or gave up -> nothing.
  if (pending) {
    return (
      <Box mt={40} gap={16}>
        <Text style={s.label}>{t('content.aiSuggestions')}</Text>
        <Box row align="center" gap={16}>
          <ProgressRing value={progress} size={26} thickness={3} track="text/15" fill="text/70" />
          <Text color="textDim">{t('content.aiSuggestionsLoading')}</Text>
        </Box>
      </Box>
    );
  }
  return null;
}
