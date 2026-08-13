// The request page's side panel and moderation chrome: who asked, what for, the
// approve/deny/delete controls and the deny note. Pure presentation, so the page
// itself stays data + layout.

import type { MediaRequest } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  Button,
  Callout,
  Divider,
  Field,
  IconButton,
  Row,
  Skeleton,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { Pill } from '#web/features/admin/pill';
import { kindMeta, posterGrad } from '#web/features/admin/pipeline-meta';
import { Image } from '#web/shared/ui';
import { RequestStatusChip } from '#web/shared/ui/request-status-chip';

export function IdentityCard({
  req,
  overview,
  posterUrl,
  localId,
}: Readonly<{
  req: MediaRequest;
  /** TMDB's synopsis, once the ledger has answered. */
  overview?: string | null;
  /** TMDB's poster, which is sharper than the one stored on the request. */
  posterUrl?: string | null;
  /** The catalog entry this title already is, when the library holds it. */
  localId?: string | null;
}>) {
  const t = useT();
  const navigate = useNavigate();
  const km = kindMeta(req.kind === 'show' ? 'series' : 'film');
  return (
    <Surface elevated radius="xl" pad="lg">
      <Box row gap={16}>
        <Box w={70} h={104} shrink={0} radius="xs" overflow="hidden" shadow="pop">
          <div style={{ position: 'absolute', inset: 0, background: posterGrad(req.title) }} />
          <Image src={posterUrl ?? req.posterUrl} fit="cover" fill />
        </Box>
        <Box minW={0} pt={4} align="flex-start" gap={10}>
          <Pill ink={km.color} bg={km.bg} variant="overline">
            {t(`pipeline.type.${km.typeKey}` as Parameters<typeof t>[0])}
          </Pill>
          <RequestStatusChip status={req.status} />
          {localId ? (
            <Button
              variant="ghost"
              size="sm"
              icon="external-link"
              label={t('requests.openInLibrary')}
              onPress={() =>
                navigate({
                  to: req.kind === 'show' ? '/show/$id' : '/movie/$id',
                  params: { id: localId },
                })
              }
            />
          ) : null}
        </Box>
      </Box>
      {overview ? (
        <Text variant="meta" color="textDim" mt={14} lines={5}>
          {overview}
        </Text>
      ) : null}
      {req.note ? (
        <Box mt={14}>
          <Callout.Root tone="danger">
            <Callout.Title>{req.note}</Callout.Title>
          </Callout.Root>
        </Box>
      ) : null}
    </Surface>
  );
}

export function RequesterCard({ req }: Readonly<{ req: MediaRequest }>) {
  const t = useT();
  return (
    <Surface elevated radius="xl" pad="lg">
      <Text variant="overline" color="textDim" mb={12}>
        {t('requests.requestedBy')}
      </Text>
      <Row gap={12}>
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
    </Surface>
  );
}

export function Moderation({
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
    <>
      {req.status === 'pending' || req.status === 'failed' ? (
        <Button
          size="sm"
          icon="check"
          label={t(req.status === 'failed' ? 'requests.retry' : 'requests.approve')}
          onPress={onApprove}
          loading={busy}
        />
      ) : null}
      {req.status === 'pending' ? (
        <Button
          variant="danger"
          size="sm"
          icon="x"
          label={t('requests.deny')}
          onPress={onStartDeny}
        />
      ) : null}
      <IconButton
        control="sm"
        icon="trash"
        label={t('requests.delete')}
        onPress={onDelete}
        disabled={busy}
      />
    </>
  );
}

export function DenyForm({
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
    <Surface elevated radius="xl" pad="lg">
      <Box gap={10}>
        <Field.Root label={t('requests.denyNote')} value={note} onValueChange={onNote}>
          <Field.Input icon="note" placeholder={t('requests.denyNote')} />
        </Field.Root>
        <Row gap={10}>
          <Button
            variant="danger"
            icon="x"
            label={t('requests.confirmDeny')}
            onPress={() => onDeny(note.trim())}
            loading={busy}
          />
          <Button variant="ghost" label={t('common.cancel')} onPress={onCancel} />
        </Row>
      </Box>
    </Surface>
  );
}

export function DetailSkeleton() {
  return (
    <Box gap={16} aria-busy>
      <Skeleton w={280} h={28} radius="sm" />
      <Divider color="tint/6" />
      <Box row={{ base: false, lg: true }} gap={16} align="flex-start">
        <Box w={{ base: '100%', lg: 320 }} shrink={0}>
          <Skeleton w="100%" h={168} radius="xl" />
        </Box>
        <Box flex minW={0}>
          <Skeleton w="100%" h={320} radius="xl" />
        </Box>
      </Box>
    </Box>
  );
}
