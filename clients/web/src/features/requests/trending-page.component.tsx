import { hasPermission } from '@kromatv/client/accounts';
import type { TmdbKind } from '@kromatv/client/discovery';
import { useT } from '@kromatv/ui';
import {
  Box,
  classes,
  EmptyState,
  Icon,
  PageHeader,
  Pagination,
  Row,
  SegmentGroup,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { Link } from '@tanstack/react-router';
import { DiscoverCard } from '#web/features/requests/discover-card.component';
import {
  type TrendingPageState,
  useTrendingPage,
} from '#web/features/requests/use-discover-search.hook';
import { useAuth } from '#web/shared/lib/auth';
import { PageFrame, SkeletonRow } from '#web/shared/ui';
import { TileGrid } from '#web/shared/ui/tile-grid.component';

const KINDS: { value: TmdbKind; labelKey: 'discover.movies' | 'discover.shows' }[] = [
  { value: 'movie', labelKey: 'discover.movies' },
  { value: 'tv', labelKey: 'discover.shows' },
];

const sDefinition = styles({
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    mb: 24,
    textDecorationLine: 'none',
  },
});

interface TrendingPageProps {
  kind: TmdbKind;
  page: number;
  onKindChange: (next: TmdbKind) => void;
  onPageChange: (next: number) => void;
}

/** This week's trending films or shows, a page at a time. Gated on `requests.create`. */
export function TrendingPage({
  kind,
  page,
  onKindChange,
  onPageChange,
}: Readonly<TrendingPageProps>) {
  const t = useT();
  const { user } = useAuth();
  const canDiscover = !!user && hasPermission(user, 'requests.create');
  const title = kind === 'movie' ? t('discover.trendingMovies') : t('discover.trendingShows');

  return (
    <PageFrame>
      <BackToSearch />
      <PageHeader.Root>
        <PageHeader.Title icon="flame">{title}</PageHeader.Title>
        {canDiscover ? (
          <PageHeader.Actions>
            <KindSwitch kind={kind} onKindChange={onKindChange} />
          </PageHeader.Actions>
        ) : null}
      </PageHeader.Root>
      {canDiscover ? (
        <Listing kind={kind} page={page} title={title} onPageChange={onPageChange} />
      ) : (
        <NothingToDiscover />
      )}
    </PageFrame>
  );
}

function NothingToDiscover() {
  const t = useT();
  return (
    <EmptyState.Root icon="mood-empty">
      <EmptyState.Title>{t('discover.empty')}</EmptyState.Title>
    </EmptyState.Root>
  );
}

function BackToSearch() {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <Link to="/search" search={{ q: '', type: 'all' }} className={classes(s.backLink)}>
      <Icon name="arrow-left" size={16} thickness={2.2} color="textDim" />
      <Text variant="meta" color="textDim">
        {t('discover.back')}
      </Text>
    </Link>
  );
}

function KindSwitch({
  kind,
  onKindChange,
}: Readonly<{ kind: TmdbKind; onKindChange: (next: TmdbKind) => void }>) {
  const t = useT();
  return (
    <SegmentGroup.Root
      size="md"
      label={t('discover.trending')}
      value={kind}
      onValueChange={onKindChange}
    >
      {KINDS.map((option) => (
        <SegmentGroup.Item key={option.value} value={option.value}>
          <SegmentGroup.Label>{t(option.labelKey)}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

interface ListingProps {
  kind: TmdbKind;
  page: number;
  title: string;
  onPageChange: (next: number) => void;
}

function Listing({ kind, page, title, onPageChange }: Readonly<ListingProps>) {
  const state = useTrendingPage(kind, page);
  return (
    <>
      <Body state={state} />
      <Pager title={title} page={page} pageCount={state.totalPages} onPageChange={onPageChange} />
    </>
  );
}

function Body({ state }: Readonly<{ state: TrendingPageState }>) {
  const t = useT();
  if (state.loading) {
    return (
      <Box mt={32}>
        <SkeletonRow count={18} />
      </Box>
    );
  }
  if (state.entries.length === 0) {
    return (
      <EmptyState.Root icon="mood-empty">
        <EmptyState.Title>{t('discover.noResults')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <Box mt={32}>
      <TileGrid>
        {(width) =>
          state.entries.map((entry) => (
            <DiscoverCard key={`${entry.kind}-${entry.tmdbId}`} entry={entry} width={width} />
          ))
        }
      </TileGrid>
    </Box>
  );
}

interface PagerProps {
  title: string;
  page: number;
  pageCount: number;
  onPageChange: (next: number) => void;
}

function Pager({ title, page, pageCount, onPageChange }: Readonly<PagerProps>) {
  const t = useT();
  if (pageCount <= 1) {
    return null;
  }
  const pageLabel = (at: number) =>
    t('discover.pageOf', { page: String(at), total: String(pageCount) });
  return (
    <Row justify="center" mt={40}>
      <Pagination.Root
        page={page}
        pageCount={pageCount}
        onPageChange={onPageChange}
        label={title}
        pageLabel={pageLabel}
      >
        <Pagination.Previous label={t('discover.prev')} />
        <Pagination.Pages />
        <Pagination.Next label={t('discover.next')} />
      </Pagination.Root>
    </Row>
  );
}
