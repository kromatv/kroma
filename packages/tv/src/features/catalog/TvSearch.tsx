import type { SearchHit } from '@kroma/core';
import { posterColors, qualityBadge, qualityBadgeForVideo } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  BackButton,
  Box,
  Chip,
  Field,
  FocusColumn,
  FocusRegion,
  IconButton,
  keyRowWidth,
  styles,
  Text,
  useFocusNav,
} from '@kroma/ui/kit';
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
import { KromaMark, SearchKeyboard } from '#tv/shared/ui';

const DEBOUNCE_MS = 250;

/** Search with a live results grid, typed either on our D-pad on-screen
 * keyboard or on the platform's own where that is the better one (Apple TV,
 * whose keyboard is also the only thing that can hear dictation; see
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
    <Box mt={28} gap={12} minH={0}>
      <Text variant="overlineTv" color="textDim">
        {t('search.recent')}
      </Text>
      {/* A row to the navigator too, or Left/Right do nothing between the pills
          and Down walks them one by one. */}
      <FocusRegion style={s.recentRow}>
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
      </FocusRegion>
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
    <Box fill z={10} bg="bg" px={SCREEN_PAD} py={44}>
      <Box row align="center" gap={14} mb={28}>
        {/* Back (mouse users); the remote's Back key is wired via useFocusNav. */}
        {nav.canGoBack ? <BackButton onPress={nav.back} label={t('common.back')} /> : null}
        <KromaMark size={28} />
        <Box flex />
        <Text variant="label" color="textDim">
          {t('search.backHint')}
        </Text>
      </Box>

      {/* Two columns to the NAVIGATOR, not only to the eye: a plain box is
          transparent to it, so without these the keys, the recent searches and
          the posters are one vertical chain - Right at the end of a key row
          reaches nothing, and the grid beside the keyboard is only reachable by
          walking Down past every row and every pill. */}
      <FocusRegion style={s.columns}>
        <FocusColumn style={s.keyboardColumn}>
          <Field.Root
            // No label drawn: a full-width search box under a screen titled
            // "Search" does not need one. It still names the input for VoiceOver.
            label={t('nav.search')}
            hideLabel
            value={query}
            onValueChange={setQuery}
            mb={26}
          >
            <Field.Input
              icon="search"
              physicalKeyboard={physicalKeyboard}
              trailing={
                voice ? (
                  <IconButton
                    icon="microphone"
                    control="tv"
                    glyph={24}
                    variant="ghost"
                    label={t('search.voice')}
                    onPress={() => setSpeaking(true)}
                  />
                ) : null
              }
            />
          </Field.Root>
          <SearchKeyboard value={query} onValueChange={setQuery} onClose={nav.back} />

          {/* recent searches: focusable pills that re-run the query */}
          {recentPills}
        </FocusColumn>

        <TvSearchResults hits={hits} query={query} width={RESULTS_WIDTH} onOpen={openHit} />
      </FocusRegion>

      {/* Spoken words land in the same `query` typing feeds, so the grid behind
          fills in while the user is still talking. */}
      {speaking && voice ? (
        <TvVoiceSearch backend={voice} onText={setQuery} onDone={stopSpeaking} />
      ) : null}
    </Box>
  );
}

// The keyboard is a ten-key row of television keys, and it is the wider of the
// two columns: the screen is measured FROM it, not the other way round. Taking
// the width from the kit is what keeps the results pane beside the keys instead
// of on top of them the next time a key grows.
const KEYBOARD_W = keyRowWidth('tv');
const SCREEN_PAD = 64;
const COLUMN_GAP = 52;
// The scroller's own horizontal padding, which the grid does not get to use.
const RESULTS_PADDING = 40;
// The 1920x1080 stage makes the rest static arithmetic: what the screen's own
// padding, the keyboard and the gap leave is the results pane.
const RESULTS_WIDTH = 1920 - SCREEN_PAD * 2 - KEYBOARD_W - COLUMN_GAP - RESULTS_PADDING;

const s = styles({
  columns: { row: true, flex: true, gap: COLUMN_GAP, minH: 0 },
  keyboardColumn: { w: KEYBOARD_W, shrink: 0 },
  recentRow: { row: true, wrap: true, gap: 10 },
});

// The results grid draws 254pt posters, served from the server's 320 bucket.
const RESULT_W = 320;
