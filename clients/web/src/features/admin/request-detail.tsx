// The admin request page (`/admin/requests/:id`): identity, requester, the
// moderation actions, and the acquisition panel. A page rather than a drawer,
// so a search survives a reload and can be linked to.

import { hasPermission, type MediaRequest, type MessageKey } from '@kroma/core';
import { ModuleSlot } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, Button, EmptyState, Row, Surface } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  DenyForm,
  DetailSkeleton,
  IdentityCard,
  Moderation,
  RequesterCard,
} from '#web/features/admin/request-cards';
import { PageHeader, useAsyncAction, useCap, usePoll } from '#web/features/admin/shell';
import { ConsoleToast, useConsoleToast } from '#web/features/admin/table-console';
import { useRequestLedger } from '#web/features/admin/use-request-ledger';
import { useAuth } from '#web/shared/lib/auth';
import { seasonsSummary } from '#web/shared/lib/request-status';

export function RequestDetailPage({ id }: Readonly<{ id: string }>) {
  const t = useT();
  const navigate = useNavigate();
  const { client, user } = useAuth();
  const canReview = useCap('requests.manage');
  const { toast, flash } = useConsoleToast();

  // Shares the queue's key + fetcher, so a WS-driven reload there refreshes
  // this page and vice versa.
  const { data, reload } = usePoll(
    ['admin', 'requests', 'all'],
    () => client.listRequests(),
    30000,
  );
  const req = data?.requests.find((r) => r.id === id) ?? null;

  const ledger = useRequestLedger(id, canReview);
  const { busy, run } = useAsyncAction();
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');

  const backToQueue = () => navigate({ to: '/admin/requests' });
  // Resolves to whether it worked: a caller that closes a form on success must
  // not close it on a 403, and `run` swallows the rejection.
  const act = (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
    let ok = false;
    return run(async () => {
      await fn();
      ok = true;
      flash(label);
      await reload();
    }).then(() => {
      if (!ok) flash(t('requests.actionFailed'));
      return ok;
    });
  };

  if (data && !req) {
    return (
      <>
        <PageHeader.Root>
          <PageHeader.Title>{t('admin.requestsTitle')}</PageHeader.Title>
        </PageHeader.Root>
        <EmptyState.Root layout="fill" icon="inbox">
          <EmptyState.Title>{t('requests.gone')}</EmptyState.Title>
          <EmptyState.Actions>
            <Button
              variant="glass"
              size="sm"
              icon="chevron-left"
              label={t('requests.backToQueue')}
              onPress={backToQueue}
            />
          </EmptyState.Actions>
        </EmptyState.Root>
      </>
    );
  }
  if (!req) return <DetailSkeleton />;

  const canModerate = canReview && !!user && hasPermission(user, 'requests.manage');
  // A denied request has nothing to acquire, so the slot is not even offered.
  const showAcquisition = canReview && req.status !== 'denied';

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Back label={t('admin.requestsTitle')} onPress={backToQueue} />
        <PageHeader.Title>{req.title}</PageHeader.Title>
        <PageHeader.Subtitle>{metaLine(req, t)}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Row wrap gap={8}>
            {canModerate ? (
              <Moderation
                req={req}
                busy={busy}
                onApprove={() =>
                  act(`« ${req.title} » ${t('requests.toastApproved')}`, () =>
                    client.approveRequest(req.id),
                  )
                }
                onStartDeny={() => setDenying(true)}
                onDelete={() => {
                  void act(`« ${req.title} » ${t('requests.toastDeleted')}`, () =>
                    client.deleteRequest(req.id),
                  ).then((ok) => {
                    if (ok) backToQueue();
                  });
                }}
              />
            ) : null}
          </Row>
        </PageHeader.Actions>
      </PageHeader.Root>

      {denying ? (
        <Box mb={16}>
          <DenyForm
            busy={busy}
            note={note}
            onNote={setNote}
            onCancel={() => setDenying(false)}
            onDeny={(n) => {
              void act(`« ${req.title} » ${t('requests.toastDenied')}`, () =>
                client.denyRequest(req.id, n || undefined),
              ).then((ok) => {
                if (ok) setDenying(false);
              });
            }}
          />
        </Box>
      ) : null}

      <Box row={{ base: false, lg: true }} gap={16} align="flex-start">
        <Box w={{ base: '100%', lg: 320 }} shrink={0} gap={16}>
          <IdentityCard
            req={req}
            overview={ledger.data?.overview}
            posterUrl={ledger.data?.posterUrl}
            localId={ledger.data?.localId}
          />
          <RequesterCard req={req} />
        </Box>
        <Box flex minW={0} w={{ base: '100%', lg: 'auto' }}>
          {showAcquisition ? (
            <ModuleSlot
              name="requests.detail"
              requestId={req.id}
              kind={req.kind}
              title={req.title}
              canGrab={canModerate}
              fallback={<NoAcquisition />}
            />
          ) : (
            <NoAcquisition />
          )}
        </Box>
      </Box>

      <ConsoleToast toast={toast} />
    </>
  );
}

// What the page shows where the acquisition module would have been: with no
// module installed, or with it turned off, there is nothing to search with.
function NoAcquisition() {
  const t = useT();
  return (
    <Surface elevated radius="xl" pad="none" px={28}>
      <EmptyState.Root layout="fill" icon="search">
        <EmptyState.Title>{t('requests.searchUnavailable')}</EmptyState.Title>
        <EmptyState.Hint>{t('requests.searchUnavailableHint')}</EmptyState.Hint>
      </EmptyState.Root>
    </Surface>
  );
}

function metaLine(req: MediaRequest, t: (key: MessageKey) => string): string {
  const seasons = seasonsSummary(req.seasons);
  return [
    req.year ? String(req.year) : '',
    req.kind === 'show' ? (seasons ?? t('requests.allSeasons')) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
