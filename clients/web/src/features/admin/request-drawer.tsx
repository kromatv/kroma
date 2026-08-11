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
import { Avatar, Button, Callout, color, Drawer, Field, IconButton } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { createCallable } from 'react-call';
import { kindMeta, posterGrad } from '#web/features/admin/pipeline-meta';
import { ReleaseList } from '#web/features/admin/release-list';
import { useAsyncAction, usePoll } from '#web/features/admin/shell';
import { RequestStatusChip } from '#web/features/requests/request-status-chip';
import { seasonsSummary } from '#web/features/requests/status';
import { useAuth } from '#web/shared/lib/auth';
import { Image } from '#web/shared/ui';

// Shares the row like the old `flex-1` CTAs.
const FLEX_1 = { flex: 1 } as const;

interface SearchState {
  busy: boolean;
  view: InteractiveSearchView | null;
  error: string | null;
}
type GrabbedState = { title: string; error: boolean } | null;

function DrawerPoster({ req }: Readonly<{ req: MediaRequest }>) {
  return (
    <div
      className="relative h-[104px] w-[70px] flex-[0_0_70px] overflow-hidden rounded-md shadow-[0_10px_24px_rgba(0,0,0,.5)]"
      style={{ background: posterGrad(req.title) }}
    >
      <Image src={req.posterUrl} fit="cover" fill />
    </div>
  );
}

function DrawerHeader({ req, onClose }: Readonly<{ req: MediaRequest; onClose: () => void }>) {
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
    <div className="border-b border-white/[0.07] px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
          {t('requests.sheet')}
        </span>
        <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={onClose} />
      </div>
      <div className="flex gap-4">
        <DrawerPoster req={req} />
        <div className="min-w-0 pt-1">
          <span
            className="rounded-full px-[9px] py-[3px] text-[9.5px] font-bold uppercase tracking-widest"
            style={{ color: km.color, background: km.bg }}
          >
            {t(`pipeline.type.${km.typeKey}` as MessageKey)}
          </span>
          <h2 className="mt-2.5 font-display text-[21px] font-bold leading-[1.12]">{req.title}</h2>
          <div className="mt-1.5 text-[12.5px] font-medium text-white/50">{meta}</div>
          <div className="mt-2.5">
            <RequestStatusChip status={req.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RequesterCard({ req }: Readonly<{ req: MediaRequest }>) {
  const t = useT();
  return (
    <>
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
        {t('requests.requestedBy')}
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-surface-1 px-4 py-3.5">
        <Avatar name={req.requestedByName ?? '?'} size={34} circle shadow={false} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold">
            {req.requestedByName ?? t('requests.unknownUser')}
          </div>
          <div className="text-[12px] font-medium text-white/45">
            {new Date(req.createdAt).toLocaleDateString()}{' '}
            {new Date(req.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>

      {req.note ? (
        <div className="mt-4">
          <Callout.Root tone="danger" title={req.note} />
        </div>
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
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
          {t('requests.interactiveSearch')}
        </span>
        <Button
          variant="glass"
          size="sm"
          icon="search"
          label={t(search.busy ? 'requests.searching2' : 'requests.searchNow')}
          onPress={onSearch}
          loading={search.busy}
        />
      </div>
      {search.error ? <Callout.Root tone="danger" title={search.error} /> : null}
      {grabbed ? (
        <div className="mb-2">
          <Callout.Root
            tone={grabbed.error ? 'danger' : 'success'}
            title={grabbed.error ? grabbed.title : `${t('requests.grabbed')} ${grabbed.title}`}
          />
        </div>
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
    </div>
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
    <div className="flex flex-col gap-2.5">
      <Field.Root label={t('requests.denyNote')} hideLabel>
        <Field.Input
          icon="note"
          value={note}
          onValueChange={onNote}
          placeholder={t('requests.denyNote')}
        />
      </Field.Root>
      <div className="flex gap-2.5">
        <Button
          variant="danger"
          icon="x"
          label={t('requests.confirmDeny')}
          onPress={() => onDeny(note.trim())}
          loading={busy}
          style={FLEX_1}
        />
        <Button variant="glass" label={t('common.cancel')} onPress={onCancel} />
      </div>
    </div>
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
    <div className="flex gap-2.5">
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
    </div>
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
  const req = data ? data.requests.find((r) => r.id === initialReq.id) : initialReq;

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

  const submitApprove = () => {
    const r = req;
    if (r)
      void run(async () => {
        await onApprove(r);
      });
  };
  const submitDeny = (n: string) => {
    const r = req;
    if (r)
      void run(async () => {
        await onDeny(r, n);
      });
  };
  const submitDelete = () => {
    const r = req;
    if (r) {
      onDelete(r);
      call.end();
    }
  };

  const runSearch = () => {
    if (!req) return;
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
    if (!req) return;
    client
      .grabRelease(req.id, { guid: release.guid, indexerId: release.indexerId })
      .then(() => setGrabbed({ title: release.title, error: false }))
      .catch((e) =>
        setGrabbed({ title: apiErrorText(e, t('requests.actionFailed')), error: true }),
      );
  };

  const showSearch =
    !!req && acqEnabled && canReview && req.status !== 'denied' && req.status !== 'available';

  return (
    <Drawer
      open={!call.ended}
      onClose={() => call.end()}
      title={t('requests.sheet')}
      width={460}
      panelStyle={DRAWER_FILL}
    >
      {req ? (
        <>
          <DrawerHeader req={req} onClose={() => call.end()} />

          <div className="flex-1 overflow-y-auto px-6 py-5">
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
          </div>

          {canReview ? (
            <div className="border-t border-white/[0.07] px-6 py-4.5">
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
            </div>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}, 400);

// The drawers' darker fill, kept from the hand-rolled asides they replace.
const DRAWER_FILL = { backgroundColor: color('bg') } as const;
