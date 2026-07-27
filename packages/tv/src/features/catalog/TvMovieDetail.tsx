import { formatRuntime, qualityBadge } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, FocusRegion, useFocusNav } from '@kroma/ui/kit';
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
import { TvAiSuggestRow } from '#tv/features/catalog/detail/TvAiSuggestRow';

/** Film detail backdrop, synopsis, metadata, a Lecture button, my-list, an
 * "ends at" hint and the cast. The movie already carries its TMDB metadata from
 * the catalog list, so no extra fetch. */
export function TvMovieDetail() {
  const nav = useNav();
  const { item } = useParams('movie');
  const client = useClient();
  const t = useT();
  const myList = useMyList();
  const watched = useWatched();
  useFocusNav({ onBack: nav.back });

  const meta = item.metadata;
  const metaLong = [
    item.year ? String(item.year) : null,
    formatRuntime(item.durationMs),
    meta?.genres?.[0],
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TvDetailScaffold
      id={item.id}
      kind={t('content.film')}
      title={item.title}
      backdrop={client.backdropFor(item) ?? client.posterFor(item)}
      rating={meta?.rating}
      meta={metaLong}
      badge={qualityBadge(item)}
      overview={meta?.overview}
      // The action row: Left and Right move between the buttons. It belongs to
      // the header rather than to the rows below it, which is why the scaffold
      // takes it as a prop (see TvDetailScaffold).
      actions={
        <FocusRegion style={ACTION_ROW}>
          <Button
            size="lg"
            autoFocus
            icon="player-play-filled"
            label={t('player.play')}
            onPress={() => nav.go('player', { item })}
          />
          <ListButton inList={myList.has(item.id)} onToggle={() => myList.toggle(item.id)} />
          <WatchedButton watched={watched.has(item.id)} onToggle={() => watched.toggle(item.id)} />
          <ReportButton
            onPress={() => nav.go('report', { kind: 'movie', id: item.id, title: item.title })}
          />
        </FocusRegion>
      }
    >
      <EndsAtHint runtimeMs={item.durationMs} />
      <CastRow cast={item.metadata?.cast} />
      <TvAiSuggestRow id={item.id} />
    </TvDetailScaffold>
  );
}

const ACTION_ROW = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 };
