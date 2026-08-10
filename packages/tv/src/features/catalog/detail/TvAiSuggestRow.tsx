import { posterColors, type SectionItem } from '@kroma/core';
import { useAiSuggest, useT } from '@kroma/ui';
import { Box, MediaCard, ProgressRing, RAIL_GAP, Rail, styles, Txt } from '@kroma/ui/kit';
import { useClient, useNav } from '#tv/app/router';

// The "Suggestions IA" rail on a TV detail screen. `useAiSuggest` polls the
// lazily-generated section; a progress ring shows while it generates and
// cards render once items arrive (empty items or a timeout -> nothing).

// `item.width` is the tile pitch, not the card width: same recipe as TvHome's ROW_TILE.
const ROW_TILE = { width: 300 + RAIL_GAP, height: Math.round((300 * 9) / 16) };

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
        <Txt style={s.label}>{section.title}</Txt>
        {section.reason ? (
          <Txt style={{ fontSize: 16, lineHeight: 22, maxWidth: 680 }} color="textMuted">
            {section.reason}
          </Txt>
        ) : null}
        {/* The rail pads itself by the 10-foot gutter by default; this one
            sits inside a detail column with its own padding, so it opts out. */}
        <Rail inset={0} item={ROW_TILE}>
          {section.items.map(card)}
        </Rail>
      </Box>
    );
  }

  // Still generating -> a subtle hint; terminal-empty or gave up -> nothing.
  if (pending) {
    return (
      <Box mt={40} gap={16}>
        <Txt style={s.label}>{t('content.aiSuggestions')}</Txt>
        <Box row align="center" gap={16}>
          <ProgressRing
            value={progress}
            size={26}
            stroke={3}
            track="rgba(244, 243, 240, 0.15)"
            fill="rgba(244, 243, 240, 0.7)"
          />
          <Txt style={{ fontSize: 16 }} color="textDim">
            {t('content.aiSuggestionsLoading')}
          </Txt>
        </Box>
      </Box>
    );
  }
  return null;
}
