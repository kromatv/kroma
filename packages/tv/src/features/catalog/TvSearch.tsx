import type { SearchHit } from '@kroma/core';
import { posterColors, qualityBadge, qualityBadgeForVideo } from '@kroma/core';
import { useT } from '@kroma/ui';
import { BackButton, Box, Chip, Field, IconButton, styles, Txt, useFocusNav } from '@kroma/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav } from '#tv/app/router';
import { onSearchRequest, takePendingSearch } from '#tv/app/searchRequest';
import { searchShell } from '#tv/app/searchShell';
import { voiceSearchBackend } from '#tv/app/voiceSearch';
import { addRecentSearch, getRecentSearches } from '#tv/features/catalog/searchHistory';
import type { SearchResult } from '#tv/features/catalog/TvSearchResults';
import { TvSearchResults } from '#tv/features/catalog/TvSearchResults';
import { TvVoiceSearch } from '#tv/features/catalog/TvVoiceSearch';
import { KromaMark, OnScreenKeyboard } from '#tv/shared/ui';

const DEBOUNCE_MS = 250;

/** Search with a live results grid, typed either on our D-pad on-screen
 * keyboard or on the platform's own where that is the better one (Apple TV,
 * whose keyboard is also the only thing that can hear dictation — see
 * `app/searchShell`). Falls back to the in-memory catalogue when the
 * server's `/api/search` request fails. */
export function TvSearch() {
  const { movies, shows } = useConnection();
  const client = useClient();
  const t = useT();
  const nav = useNav();
  // A query spoken to Siri (or handed over by any other shell) is waiting here
  // when the screen was opened BY that request; typing starts empty as usual.
  const [query, setQuery] = useState(() => takePendingSearch() ?? '');
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>(getRecentSearches);
  const { physicalKeyboard } = useEnv();
  useFocusNav({ onBack: nav.back });
  // Null on every shell that cannot hear (the browser TVs today, an Android TV
  // whose recogniser is missing): then no mic is shown at all.
  const voice = voiceSearchBackend();
  const [speaking, setSpeaking] = useState(false);
  const stopSpeaking = useCallback(() => setSpeaking(false), []);
  // Null on every shell that types on our keyboard, which is all but Apple TV.
  const shell = searchShell();

  // Asking Siri again while the screen is already open re-targets it rather than
  // reopening it, so the second request is not silently dropped.
  useEffect(() => onSearchRequest(setQuery), []);

  // A search "counts" once the user opens one of its results: remember the
  // query then, so the recent list holds real searches, not typing prefixes.
  const openHit = useCallback(
    (h: SearchResult) => {
      setRecent(addRecentSearch(query));
      h.onOpen();
    },
    [query],
  );

  const toHit = useCallback(
    (hit: SearchHit): SearchResult => {
      if (hit.type === 'show') {
        const show = hit.show;
        return {
          id: show.id,
          title: show.title,
          badge: qualityBadgeForVideo(show.video),
          poster: client.showPosterFor(show, RESULT_W),
          colors: posterColors(show.id),
          onOpen: () => nav.go('show', { show }),
        };
      }
      const m = hit.item; // movie | episode both navigate to the item detail
      return {
        id: m.id,
        title: m.episodeTitle ?? m.title,
        badge: qualityBadge(m),
        poster: client.posterFor(m, RESULT_W),
        colors: posterColors(m.id),
        onOpen: () => nav.go('movie', { item: m }),
      };
    },
    [client, nav],
  );

  // Offline fallback: filter the already-loaded catalogue by title / genre.
  const localHits = useCallback(
    (q: string): SearchResult[] => {
      const needle = q.toLowerCase();
      const match = (title: string, genres?: string[] | null) =>
        title.toLowerCase().includes(needle) ||
        (genres ?? []).some((g) => g.toLowerCase().includes(needle));
      const mv = movies
        .filter((m) => match(m.title, m.metadata?.genres))
        .map((m) => toHit({ type: 'movie', item: m }));
      const sh = shows
        .filter((show) => match(show.title, show.metadata?.genres))
        .map((show) => toHit({ type: 'show', show }));
      return [...mv, ...sh];
    },
    [movies, shows, toHit],
  );

  // Debounced server search; the latest query wins (stale responses are dropped).
  const seq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      client
        .search(q)
        .then((res) => {
          if (mine === seq.current) setHits(res.results.map(toHit));
        })
        .catch(() => {
          if (mine === seq.current) setHits(localHits(q)); // offline / server down
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, client, toHit, localHits]);

  const recentPills = recent.length ? (
    <Box mt={28} gap={12} style={{ minHeight: 0 }}>
      <Txt style={s.recentLabel} color="textDim">
        {t('search.recent')}
      </Txt>
      <Box row wrap gap={10}>
        {recent.map((term) => (
          <Chip
            key={term}
            variant="subtle"
            focusScale={1.06}
            label={term}
            onPress={() => setQuery(term)}
            style={{ maxWidth: 240, paddingHorizontal: 18, paddingVertical: 8 }}
          />
        ))}
      </Box>
    </Box>
  ) : null;

  // The platform's chrome owns the whole screen - its field, its keyboard, and
  // the room it leaves - so there is no header of ours to draw around it.
  if (shell) {
    const { Shell } = shell;
    return (
      <Shell value={query} onChange={setQuery} placeholder={t('nav.search')}>
        {({ width }) => (
          <TvSearchResults
            hits={hits}
            query={query}
            width={width - RESULTS_PADDING}
            onOpen={openHit}
            header={recentPills}
          />
        )}
      </Shell>
    );
  }

  return (
    <Box fill z={10} bg="bg" px={64} py={44}>
      <Box row align="center" gap={14} mb={28}>
        {/* Back (mouse users); the remote's Back key is wired via useFocusNav. */}
        {nav.canGoBack ? <BackButton onPress={nav.back} label={t('common.back')} /> : null}
        <KromaMark size={28} />
        <Box flex />
        <Txt style={{ fontSize: 14, fontWeight: '600' }} color="textDim">
          {t('search.backHint')}
        </Txt>
      </Box>

      <Box row flex gap={52} style={{ minHeight: 0 }}>
        <Box w={520} shrink={0}>
          <Field
            value={query}
            onChange={setQuery}
            icon="search"
            // No label drawn: a full-width search box under a screen titled
            // "Search" does not need one. It still names the input for VoiceOver.
            label={t('nav.search')}
            hideLabel
            physicalKeyboard={physicalKeyboard}
            mb={26}
            entry={{
              h: 68,
              bg: 'rgba(255, 255, 255, 0.05)',
              textStyle: { fontSize: 24, fontWeight: '600' },
            }}
            trailing={
              voice ? (
                <IconButton
                  icon="microphone"
                  size={48}
                  glyph={24}
                  variant="ghost"
                  label={t('search.voice')}
                  onPress={() => setSpeaking(true)}
                />
              ) : null
            }
          />
          <OnScreenKeyboard value={query} onChange={setQuery} onClose={nav.back} layout="search" />

          {/* recent searches: focusable pills that re-run the query */}
          {recentPills}
        </Box>

        {/* The results pane is a fixed 1180px (1792 content - 520 keyboard -
            52 gap - 40 padding), so 4 columns of 277px with 24px gaps. */}
        <TvSearchResults hits={hits} query={query} width={RESULTS_WIDTH} onOpen={openHit} />
      </Box>

      {/* Spoken words land in the same `query` typing feeds, so the grid behind
          fills in while the user is still talking. */}
      {speaking && voice ? (
        <TvVoiceSearch backend={voice} onText={setQuery} onDone={stopSpeaking} />
      ) : null}
    </Box>
  );
}

const RESULTS_WIDTH = 1180;
// The scroller's own horizontal padding, which the grid does not get to use.
const RESULTS_PADDING = 40;

const s = styles({
  recentLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.52 },
});

// The results grid draws 277pt posters, served from the server's 320 bucket.
const RESULT_W = 320;
