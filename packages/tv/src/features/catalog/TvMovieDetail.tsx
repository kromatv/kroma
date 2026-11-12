import { formatRuntime, genreLabels, qualityBadge } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button, FocusRegion, FocusSlot, styles, useFocusNav, useStyles } from '@kromatv/ui/kit';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav, useParams } from '#tv/app/router';
import { TvDetailScaffold } from '#tv/features/catalog/detail/DetailScaffold';
import {
  CastRow,
  EndsAtHint,
  ListButton,
  ReportButton,
  WatchedButton,
} from '#tv/features/catalog/detail/parts';
import { LeadActions } from '#tv/features/catalog/detail/TrailerButton';
import { TvAiSuggestRow } from '#tv/features/catalog/detail/TvAiSuggestRow';
import { useFullItem, usePlayTitle } from '#tv/features/catalog/full-item';

/** Film detail backdrop, synopsis, metadata, a Lecture button, my-list, an
 * "ends at" hint and the cast. The page draws from the catalogue card at once;
 * the cast arrives with the full item. */
// The backdrop fills the stage and no more: the original is several times
// this on a modern release.
const STAGE_W = 1920;

export function TvMovieDetail() {
  const s = useStyles(sDefinition);

  const nav = useNav();
  const { item } = useParams('movie');
  const full = useFullItem(item);
  const play = usePlayTitle();
  const client = useClient();
  const t = useT();
  const myList = useMyList();
  const watched = useWatched();
  useFocusNav({ onBack: nav.back });

  const meta = item.metadata;
  const metaLong = [
    item.year ? String(item.year) : null,
    formatRuntime(item.durationMs),
    meta?.certification,
    genreLabels(t, meta)[0],
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TvDetailScaffold
      id={item.id}
      kind={t('content.film')}
      title={item.title}
      backdrop={
        client.media.artwork.backdropFor(item, STAGE_W) ??
        client.media.artwork.posterFor(item, STAGE_W)
      }
      rating={meta?.rating}
      meta={metaLong}
      badge={qualityBadge(item)}
      overview={meta?.overview}
      // The action row: Left and Right move between the buttons. It belongs to
      // the header rather than to the rows below it, which is why the scaffold
      // takes it as a prop (see TvDetailScaffold).
      actions={
        <FocusRegion style={s.actionRow}>
          <LeadActions trailer={{ kind: 'movie', tmdbId: meta?.tmdbId, title: item.title }}>
            <Button
              size="lg"
              autoFocus
              icon="player-play-filled"
              label={t('player.play')}
              onPress={() => play(full ?? item)}
            />
          </LeadActions>
          <ListButton inList={myList.has(item.id)} onToggle={() => myList.toggle(item.id)} />
          <WatchedButton watched={watched.has(item.id)} onToggle={() => watched.toggle(item.id)} />
          <ReportButton
            onPress={() => nav.go('report', { kind: 'movie', id: item.id, title: item.title })}
          />
        </FocusRegion>
      }
    >
      <EndsAtHint runtimeMs={item.durationMs} />
      <FocusSlot>
        <CastRow cast={full?.metadata?.cast} crew={full?.metadata?.crew} />
      </FocusSlot>
      <FocusSlot>
        <TvAiSuggestRow id={item.id} />
      </FocusSlot>
    </TvDetailScaffold>
  );
}

const sDefinition = styles({
  actionRow: { row: true, align: 'center', gap: 16 },
});
