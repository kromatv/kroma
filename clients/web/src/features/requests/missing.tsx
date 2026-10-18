import { hasPermission } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  Row,
  Section,
  Text,
} from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { MissingGroupCard } from '#web/features/requests/missing-group';
import {
  groupByTitle,
  type MissingGroup,
  splitByFollowing,
  unitCount,
} from '#web/features/requests/missing-model';
import { MissingSkeleton } from '#web/features/requests/missing-skeleton';
import { type MissingActions, useMissingActions } from '#web/features/requests/use-missing-actions';
import { useAuth } from '#web/shared/lib/auth';
import { userQueries } from '#web/shared/lib/queries';
import { PageFrame } from '#web/shared/ui';
import { RouteLink } from '#web/shared/ui/route-link';

type SearchAllState = 'idle' | 'busy' | 'started';

export function MissingPage() {
  const t = useT();
  const { user, client } = useAuth();
  const query = userQueries.missing();
  const { data: entries, isPending } = useQuery({ ...query, refetchInterval: 30_000 });
  const canManage = !!user && hasPermission(user, 'requests.manage');

  const groups = useMemo(() => groupByTitle(entries ?? []), [entries]);
  const { followed, unfollowed } = useMemo(() => splitByFollowing(groups), [groups]);
  const actions = useMissingActions(groups);
  const [searchAll, setSearchAll] = useState<SearchAllState>('idle');

  const followedCount = unitCount(followed);
  const onSearchAll = () => {
    setSearchAll('busy');
    client.requests
      .searchAllMissing()
      .then(() => setSearchAll('started'))
      .catch(() => setSearchAll('idle'));
  };

  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title suffix={followedCount > 0 ? String(followedCount) : undefined}>
          {t('requests.missingTitle')}
        </PageHeader.Title>
        <PageHeader.Subtitle>{t('requests.missingSubtitle')}</PageHeader.Subtitle>
        {actions.selectedCount > 0 ? (
          <PageHeader.Actions>
            <SelectionActions actions={actions} />
          </PageHeader.Actions>
        ) : null}
      </PageHeader.Root>

      {isPending ? <MissingSkeleton /> : null}

      {entries?.length === 0 ? (
        <EmptyState.Root icon="circle-check">
          <EmptyState.Title>{t('requests.missingEmpty')}</EmptyState.Title>
          <EmptyState.Hint>{t('requests.missingEmptyHint')}</EmptyState.Hint>
          <EmptyState.Actions>
            <Button
              variant="glass"
              size="sm"
              icon="search"
              label={t('requests.myEmptyCta')}
              asChild
            >
              <RouteLink to="/search" search={{ q: '', type: 'all' }} />
            </Button>
          </EmptyState.Actions>
        </EmptyState.Root>
      ) : null}

      {followed.length > 0 ? (
        <Section.Root mt={24}>
          <Section.Header>
            <Section.Title>{t('requests.missingFollowed')}</Section.Title>
            {canManage && followedCount > 0 ? (
              <Section.Actions>
                <SearchAllButton state={searchAll} count={followedCount} onPress={onSearchAll} />
              </Section.Actions>
            ) : null}
          </Section.Header>
          <GroupList groups={followed} actions={actions} />
        </Section.Root>
      ) : null}

      {unfollowed.length > 0 ? (
        <Section.Root mt={32}>
          <Section.Header>
            <Section.Title>{t('requests.missingUnfollowed')}</Section.Title>
          </Section.Header>
          <Text variant="meta" color="textDim">
            {t('requests.missingUnfollowedHint')}
          </Text>
          <GroupList groups={unfollowed} actions={actions} />
        </Section.Root>
      ) : null}
    </PageFrame>
  );
}

function GroupList({
  groups,
  actions,
}: Readonly<{ groups: readonly MissingGroup[]; actions: MissingActions }>) {
  return (
    <Box gap={12}>
      {groups.map((group) => (
        <MissingGroupCard
          key={group.requestId ?? `tmdb:${group.tmdbId}`}
          group={group}
          action={actions.actionOf(group)}
          canMonitor={actions.canMonitor}
          busyKeys={actions.busyKeys}
          startedKeys={actions.startedKeys}
          selected={actions.selected}
          onToggleRow={actions.toggleRow}
          onToggleGroup={(pick) => actions.toggleGroup(group, pick)}
          onRun={(items) => actions.run(group, items)}
        />
      ))}
    </Box>
  );
}

const SELECTION_KEY = {
  search: 'requests.searchSelectedCount',
  follow: 'requests.followSelectedCount',
  request: 'requests.askSelectedCount',
  none: 'requests.applySelectedCount',
  mixed: 'requests.applySelectedCount',
} as const;

function SelectionActions({ actions }: Readonly<{ actions: MissingActions }>) {
  const t = useT();
  return (
    <Row wrap gap={8}>
      <Button
        variant="outline"
        active
        size="sm"
        icon={actions.selectedAction === 'search' ? 'search' : 'check'}
        onPress={actions.runSelected}
        label={t(SELECTION_KEY[actions.selectedAction], { count: actions.selectedCount })}
      />
      <IconButton
        variant="ghost"
        control="sm"
        icon="x"
        label={t('common.clear')}
        onPress={actions.clearSelection}
      />
    </Row>
  );
}

function SearchAllButton({
  state,
  count,
  onPress,
}: Readonly<{ state: SearchAllState; count: number; onPress: () => void }>) {
  const t = useT();
  return (
    <Button
      size="sm"
      icon={state === 'started' ? 'check' : 'search'}
      label={
        state === 'started'
          ? t('requests.searchStarted')
          : t('requests.searchMissingCount', { count })
      }
      onPress={onPress}
      loading={state === 'busy'}
      disabled={state === 'started'}
    />
  );
}
