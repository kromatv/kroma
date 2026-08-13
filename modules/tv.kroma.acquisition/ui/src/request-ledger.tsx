// The requested title as TMDB knows it: every season, every episode, and which
// of them the library is actually short of.
//
// A list rather than a table: this panel sits in a column beside the identity
// card, so its width is whatever is left over, and a grid of fixed columns spent
// that width on headings until the episode title had none.

import {
  datedDayLabel,
  type LedgerEpisode,
  type LedgerSeason,
  type MessageKey,
  qualityBadgeForVideo,
} from '@kroma/core';
import { ModuleSlot, TABULAR, Table, useT } from '@kroma/module-sdk';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  EmptyState,
  Img,
  Row,
  Select,
  Skeleton,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { type CoverageDraft, covers, type SeasonCoverage, seasonCoverage } from './coverage-draft';
import { type EpisodeState, episodeState, isRequested } from './request-ledger-state';

// Past this many, a wrapping strip of chips is a wall rather than a picker.
const MAX_CHIPS = 8;

const STATE_LABEL: Record<EpisodeState, MessageKey> = {
  onDisk: 'requests.stateOnDisk',
  queued: 'requests.stateQueued',
  unaired: 'requests.stateUnaired',
  missing: 'requests.stateMissing',
  untracked: 'requests.stateUntracked',
};

const STATE_TONE: Record<EpisodeState, 'success' | 'info' | 'accentText' | 'textDim'> = {
  onDisk: 'success',
  queued: 'info',
  unaired: 'textDim',
  missing: 'accentText',
  untracked: 'textDim',
};

export function RequestLedger({
  seasons,
  season,
  episodes,
  today,
  locale,
  loading,
  requestId,
  draft,
  onToggleSeason,
  onToggleEpisode,
  onSeason,
  onSearchSeason,
  onSearchEpisode,
  onOpenTitle,
  onFileInfo,
}: Readonly<{
  seasons: LedgerSeason[];
  season: number | null;
  /** The open season's rows; null while they are still being fetched. */
  episodes: LedgerEpisode[] | null;
  today: string;
  locale: string;
  loading: boolean;
  requestId: string;
  /** While editing what the request covers: the pick in progress. Absent when
   *  the catalogue is just being read. */
  draft: CoverageDraft | null;
  onToggleSeason: (season: number, on: boolean) => void;
  onToggleEpisode: (season: number, episode: number) => void;
  onSeason: (season: number) => void;
  onSearchSeason: (season: number) => void;
  onSearchEpisode: (season: number, episode: number) => void;
  /** Open the catalog page of the title an on-disk episode belongs to; absent
   *  when the library does not hold the title at all. */
  onOpenTitle: (() => void) | null;
  onFileInfo: (episode: LedgerEpisode) => void;
}>) {
  const t = useT();

  if (loading) return <Skeleton w="100%" h={220} radius="xl" />;
  if (seasons.length === 0) {
    return (
      <EmptyState.Root icon="inbox">
        <EmptyState.Title>{t('requests.ledgerEmpty')}</EmptyState.Title>
        <EmptyState.Hint>{t('requests.ledgerEmptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }

  return (
    <Box gap={14}>
      <Row wrap between gap={10} align="center">
        <Box flex minW={160}>
          <SeasonPicker
            seasons={seasons}
            season={season}
            draft={draft}
            episodes={episodes}
            onSeason={onSeason}
            onToggleSeason={onToggleSeason}
          />
        </Box>
        {season != null && draft == null ? (
          <Button
            variant="ghost"
            size="sm"
            icon="search"
            label={t('requests.searchThisSeason', { number: season })}
            onPress={() => onSearchSeason(season)}
          />
        ) : null}
      </Row>

      {episodes == null ? <Skeleton w="100%" h={180} radius="xl" /> : null}
      {episodes?.length === 0 ? (
        <EmptyState.Root icon="inbox">
          <EmptyState.Title>{t('requests.ledgerEmpty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : null}
      {episodes != null && episodes.length > 0 ? (
        <Surface elevated radius="xl" pad="none" overflow="hidden">
          {episodes.map((ep, index) => (
            <Box key={`${ep.season}-${ep.episode}`}>
              {index > 0 ? <Divider color="tint/5" /> : null}
              <EpisodeRow
                ep={ep}
                today={today}
                locale={locale}
                requestId={requestId}
                picked={draft ? covers(draft, ep.season, ep.episode) : null}
                onToggle={() => onToggleEpisode(ep.season, ep.episode)}
                onSearch={() => onSearchEpisode(ep.season, ep.episode)}
                onOpen={onOpenTitle}
                onFileInfo={() => onFileInfo(ep)}
              />
            </Box>
          ))}
        </Surface>
      ) : null}
    </Box>
  );
}

/** Chips while they fit on a line or two, a select once a long-running show
 *  would turn them into a wall. */
function SeasonPicker({
  seasons,
  season,
  draft,
  episodes,
  onSeason,
  onToggleSeason,
}: Readonly<{
  seasons: LedgerSeason[];
  season: number | null;
  draft: CoverageDraft | null;
  episodes: LedgerEpisode[] | null;
  onSeason: (season: number) => void;
  onToggleSeason: (season: number, on: boolean) => void;
}>) {
  const t = useT();
  // Editing turns the strip into the coverage control: a chip says how much of
  // its season is wanted, and pressing it takes or drops the whole thing.
  if (draft) {
    return (
      <Row wrap gap={8}>
        {seasons.map((s) => {
          const state = seasonCoverage(draft, s.season, s.season === season ? episodes : null);
          return (
            <Chip
              key={s.season}
              label={seasonLabel(s, t)}
              dot={coverageDot(state)}
              active={state !== 'none'}
              onPress={() => onToggleSeason(s.season, state !== 'all')}
            />
          );
        })}
      </Row>
    );
  }
  if (seasons.length > MAX_CHIPS) {
    return (
      <Select.Root
        value={season == null ? undefined : String(season)}
        onValueChange={(next) => onSeason(Number(next))}
        label={t('requests.colSeasonShort')}
        placeholder={t('requests.colSeasonShort')}
      >
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        {seasons.map((s) => (
          <Select.Item key={s.season} value={String(s.season)} label={seasonLabel(s, t)} />
        ))}
      </Select.Root>
    );
  }
  return (
    <Row wrap gap={8}>
      {seasons.map((s) => (
        <Chip
          key={s.season}
          label={seasonLabel(s, t)}
          dot={dotFor(s)}
          active={s.season === season}
          onPress={() => onSeason(s.season)}
        />
      ))}
    </Row>
  );
}

function seasonLabel(s: LedgerSeason, t: (key: MessageKey, vars: { number: number }) => string) {
  return `${t('content.seasonShort', { number: s.season })} · ${s.onDisk}/${s.episodeCount}`;
}

function coverageDot(state: SeasonCoverage): 'success' | 'accent' | 'textDim' {
  if (state === 'all') return 'success';
  return state === 'some' ? 'accent' : 'textDim';
}

function dotFor(s: LedgerSeason): 'success' | 'accent' | 'textDim' {
  if (s.onDisk >= s.episodeCount && s.episodeCount > 0) return 'success';
  return isRequested(s) ? 'accent' : 'textDim';
}

function EpisodeRow({
  ep,
  today,
  locale,
  requestId,
  picked,
  onToggle,
  onSearch,
  onOpen,
  onFileInfo,
}: Readonly<{
  ep: LedgerEpisode;
  today: string;
  locale: string;
  requestId: string;
  /** Whether the draft covers this episode; null when not editing. */
  picked: boolean | null;
  onToggle: () => void;
  onSearch: () => void;
  onOpen: (() => void) | null;
  onFileInfo: () => void;
}>) {
  const t = useT();
  const state = episodeState(ep, today);
  const quality = qualityBadgeForVideo(ep.video);
  const openTitle = ep.itemId != null ? onOpen : null;
  const editing = picked != null;
  const label = `E${String(ep.episode).padStart(2, '0')} ${ep.name ?? ''}`.trim();
  return (
    <Row gap={12} align="center" px={12} py={10}>
      {picked != null ? (
        <Checkbox checked={picked} onCheckedChange={onToggle} label={label} />
      ) : null}
      <Box w={78} h={44} shrink={0} radius="sm" overflow="hidden" bg="surface2">
        <Img src={ep.stillUrl} fit="cover" fill />
      </Box>

      <Box flex minW={0} gap={3}>
        <Row gap={7} align="baseline" minW={0}>
          <Text variant="meta" color="accentText" shrink={0} style={TABULAR}>
            {`E${String(ep.episode).padStart(2, '0')}`}
          </Text>
          <Text variant="label" lines={1} minW={0}>
            {ep.name ?? t('requests.episodeUnnamed')}
          </Text>
        </Row>
        <Row gap={6} align="center" wrap>
          <Box w={6} h={6} shrink={0} radius="circle" bg={STATE_TONE[state]} />
          <Text variant="meta" color={STATE_TONE[state]}>
            {t(STATE_LABEL[state])}
          </Text>
          <Text variant="meta" color="text/25">
            ·
          </Text>
          <Text variant="meta" color="textDim" style={TABULAR}>
            {ep.airDate ? datedDayLabel(ep.airDate, locale) : '—'}
          </Text>
          {quality ? (
            <>
              <Text variant="meta" color="text/25">
                ·
              </Text>
              <Text variant="meta" color="hdr">
                {quality}
              </Text>
            </>
          ) : null}
        </Row>
        <ModuleSlot
          name="requests.episode.progress"
          requestId={requestId}
          season={ep.season}
          episode={ep.episode}
        />
      </Box>

      <Row gap={6} shrink={0}>
        {editing || !ep.itemId ? null : (
          <Table.Action
            tone="info"
            icon="info-circle"
            label={t('mediaInfo.title')}
            onPress={onFileInfo}
          />
        )}
        {!editing && openTitle ? (
          <Table.Action
            tone="success"
            icon="external-link"
            label={t('requests.openEpisodePage')}
            onPress={openTitle}
          />
        ) : null}
        {editing || state === 'unaired' ? null : (
          <Table.Action
            tone={state === 'onDisk' ? 'hdr' : 'accent'}
            icon="search"
            label={t(state === 'onDisk' ? 'requests.searchBetter' : 'requests.searchThisEpisode')}
            onPress={onSearch}
          />
        )}
      </Row>
    </Row>
  );
}
