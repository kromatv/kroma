// Slide-in request drawer: poster + identity, requester, seasons, status,
// denial note / failure detail, and the moderation actions (approve / deny
// with optional reason / delete). The interactive release search joins with
// the indexer milestone.

import {
  apiErrorText,
  type InteractiveSearchView,
  type MediaRequest,
  type MessageKey,
  type ScoredReleaseView,
} from '@kroma/core';
import { useModuleEnabled } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  Button,
  Callout,
  color,
  Drawer,
  Field,
  IconButton,
  Row,
  Text,
} from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { createCallable } from 'react-call';
import { Pill } from '#web/features/admin/pill';
import { kindMeta, posterGrad } from '#web/features/admin/pipeline-meta';
import { ReleaseList } from '#web/features/admin/release-list';
import { useAsyncAction, usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { seasonsSummary } from '#web/shared/lib/request-status';
import { Image } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

// Shares the row like the old `flex-1` CTAs.
const FLEX_1 = { flex: 1 } as const;

interface SearchState {
  busy: boolean;
  view: InteractiveSearchView | null;
  error: string | null;
}
type GrabbedState = { title: string; error: boolean } | null;

function Poster({ req }: Readonly<{ req: MediaRequest }>) {
  return (
    <Box w={70} h={104} shrink={0} radius="xs" overflow="hidden" shadow="pop">
      <div style={{ position: 'absolute', inset: 0, background: posterGrad(req.title) }} />
      <Image src={req.posterUrl} fit="cover" fill />
    </Box>
  );
}

function Identity({ req }: Readonly<{ req: MediaRequest }>) {
  const t = useT();
  const km = kindMeta(req.kind === 'show' ? 'series' : 'film');
  const seasons = seasonsSummary(req.seasons);
  const meta = [
    req.year ? String(req.year) : '',
    req.kind === 'show' ? (seasons ?? t('requests.allSeasons')) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <Row between mb={16}>
        <Text variant="overline" color="textDim">
          {t('requests.sheet')}
        </Text>
        <Drawer.Close />
      </Row>
      <Box row gap={16}>
        <Poster req={req} />
        <Box minW={0} pt={4} align="flex-start">
          <Pill ink={km.color} bg={km.bg} variant="overline">
            {t(`pipeline.type.${km.typeKey}` as MessageKey)}
          </Pill>
          <Text variant="h2" accessibilityRole="header" mt={10}>
            {req.title}
          </Text>
          <Text variant="meta" color="textDim" mt={6}>
            {meta}
          </Text>
          <Box mt={10}>
            <RequestStatusChip status={req.status} />
          </Box>
        </Box>
      </Box>
    </>
  );
}

function RequesterCard({ req }: Readonly<{ req: MediaRequest }>) {
  const t = useT();
  return (
    <>
      <Text variant="overline" color="textDim" mb={12}>
        {t('requests.requestedBy')}
      </Text>
      <Row gap={12} px={16} py={14} radius="lg" bg="surface1" border="tint/7">
        <Avatar name={req.requestedByName ?? '?'} size={34} circle shadow={false} />
        <Box minW={0}>
          <Text variant="label" lines={1}>
            {req.requestedByName ?? t('requests.unknownUser')}
          </Text>
          <Text variant="meta" color="textDim">
            {new Date(req.createdAt).toLocaleDateString()}{' '}
            {new Date(req.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Box>
      </Row>

      {req.note ? (
        <Box mt={16}>
          <Callout.Root tone="danger">
            <Callout.Title>{req.note}</Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}
    </>
  );
}

function SearchPanel({
  canReview,
  busy,
  search,
  grabbed,
  onSearch,
  onGrab,
}: Readonly<{
  canReview: boolean;
  busy: boolean;
  search: SearchState;
  grabbed: GrabbedState;
  onSearch: () => void;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  return (
    <Box mt={20}>
      <Row between mb={12}>
        <Text variant="overline" color="textDim">
          {t('requests.interactiveSearch')}
        </Text>
        <Button
          variant="glass"
          size="sm"
          icon="search"
          label={t(search.busy ? 'requests.searching2' : 'requests.searchNow')}
          onPress={onSearch}
          loading={search.busy}
        />
      </Row>
      {search.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{search.error}</Callout.Title>
        </Callout.Root>
      ) : null}
      {grabbed ? (
        <Box mb={8}>
          <Callout.Root tone={grabbed.error ? 'danger' : 'success'}>
            <Callout.Title>
              {grabbed.error ? grabbed.title : `${t('requests.grabbed')} ${grabbed.title}`}
            </Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}
      {search.view ? (
        <ReleaseList
          releases={search.view.releases}
          errors={search.view.indexerErrors}
          canGrab={canReview}
          busy={busy}
          onGrab={onGrab}
        />
      ) : null}
    </Box>
  );
}

function DenyForm({
  busy,
  note,
  onNote,
  onDeny,
  onCancel,
}: Readonly<{
  busy: boolean;
  note: string;
  onNote: (v: string) => void;
  onDeny: (note: string) => void;
  onCancel: () => void;
}>) {
  const t = useT();
  return (
    <Box gap={10}>
      <Field.Root label={t('requests.denyNote')} hideLabel>
        <Field.Input
          icon="note"
          value={note}
          onValueChange={onNote}
          placeholder={t('requests.denyNote')}
        />
      </Field.Root>
      <Row gap={10}>
        <Button
          variant="danger"
          icon="x"
          label={t('requests.confirmDeny')}
          onPress={() => onDeny(note.trim())}
          loading={busy}
          style={FLEX_1}
        />
        <Button variant="glass" label={t('common.cancel')} onPress={onCancel} />
      </Row>
    </Box>
  );
}

function ModerationButtons({
  req,
  busy,
  onApprove,
  onStartDeny,
  onDelete,
}: Readonly<{
  req: MediaRequest;
  busy: boolean;
  onApprove: () => void;
  onStartDeny: () => void;
  onDelete: () => void;
}>) {
  const t = useT();
  return (
    <Row gap={10}>
      {req.status === 'pending' || req.status === 'failed' ? (
        <Button
          icon="check"
          label={t(req.status === 'failed' ? 'requests.retry' : 'requests.approve')}
          onPress={onApprove}
          loading={busy}
          style={FLEX_1}
        />
      ) : null}
      {req.status === 'pending' ? (
        <Button
          variant="danger"
          icon="x"
          label={t('requests.deny')}
          onPress={onStartDeny}
          style={FLEX_1}
        />
      ) : null}
      <IconButton
        control="md"
        icon="trash"
        label={t('requests.delete')}
        onPress={onDelete}
        disabled={busy}
      />
    </Row>
  );
}

// Open with `RequestDrawer.call({ req, canReview, onApprove, onDeny, onDelete })`.
// Actions run through those callbacks so the queue's toast + list refresh keep
// working while the drawer is open; it closes itself when the request leaves the list.
export const RequestDrawer = createCallable<
  {
    req: MediaRequest;
    canReview: boolean;
    onApprove: (req: MediaRequest) => Promise<unknown>;
    onDeny: (req: MediaRequest, note: string) => Promise<unknown>;
    onDelete: (req: MediaRequest) => void;
  },
  void
>(({ call, req: initialReq, canReview, onApprove, onDeny, onDelete }) => {
  const t = useT();
  const { client } = useAuth();
  // The interactive release search + grab are the Acquisition module's feature;
  // hide the whole panel when it is disabled (its routes 404 too).
  const acqEnabled = useModuleEnabled('tv.kroma.acquisition');
  // Track the request live off the shared queue query (same key + fetcher), so an
  // action or WS-driven reload refreshes the open drawer just like the table.
  const { data } = usePoll(['admin', 'requests', 'all'], () => client.listRequests(), 30000);
  // Falls back to the row it was opened on so the sheet keeps its contents
  // through the slide-out once the request has left the list.
  const req = data?.requests.find((r) => r.id === initialReq.id) ?? initialReq;

  const { busy, run } = useAsyncAction();
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState<SearchState>({ busy: false, view: null, error: null });
  const [grabbed, setGrabbed] = useState<GrabbedState>(null);

  // Close when this request drops out of the list (deleted here or elsewhere).
  const gone = !!data && !data.requests.some((r) => r.id === initialReq.id);
  useEffect(() => {
    if (gone) call.end();
  }, [gone, call.end]);

  const submitApprove = () =>
    void run(async () => {
      await onApprove(req);
    });
  const submitDeny = (n: string) =>
    void run(async () => {
      await onDeny(req, n);
    });
  const submitDelete = () => {
    onDelete(req);
    call.end();
  };

  const runSearch = () => {
    setGrabbed(null);
    setSearch({ busy: true, view: null, error: null });
    client
      .searchReleases(req.id)
      .then((view) => setSearch({ busy: false, view, error: null }))
      .catch((e) =>
        setSearch({ busy: false, view: null, error: apiErrorText(e, t('requests.searchFailed')) }),
      );
  };
  const grab = (release: ScoredReleaseView) => {
    client
      .grabRelease(req.id, { guid: release.guid, indexerId: release.indexerId })
      .then(() => setGrabbed({ title: release.title, error: false }))
      .catch((e) =>
        setGrabbed({ title: apiErrorText(e, t('requests.actionFailed')), error: true }),
      );
  };

  const showSearch =
    acqEnabled && canReview && req.status !== 'denied' && req.status !== 'available';

  return (
    <Drawer.Root
      open={!call.ended}
      onClose={() => call.end()}
      title={req.title}
      panelStyle={DRAWER_FILL}
    >
      <Drawer.Header>
        <Identity req={req} />
      </Drawer.Header>

      <Drawer.Panel>
        <RequesterCard req={req} />
        {showSearch ? (
          <SearchPanel
            canReview={canReview}
            busy={busy}
            search={search}
            grabbed={grabbed}
            onSearch={runSearch}
            onGrab={grab}
          />
        ) : null}
      </Drawer.Panel>

      {canReview ? (
        <Drawer.Footer>
          {denying ? (
            <DenyForm
              busy={busy}
              note={note}
              onNote={setNote}
              onDeny={submitDeny}
              onCancel={() => setDenying(false)}
            />
          ) : (
            <ModerationButtons
              req={req}
              busy={busy}
              onApprove={submitApprove}
              onStartDeny={() => setDenying(true)}
              onDelete={submitDelete}
            />
          )}
        </Drawer.Footer>
      ) : null}
    </Drawer.Root>
  );
}, 400);

// The drawers' darker fill, kept from the hand-rolled asides they replace.
const DRAWER_FILL = { backgroundColor: color('bg') } as const;
