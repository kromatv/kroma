import { apiErrorText } from '@kromatv/client';
import {
  type ArtKind,
  type ArtRole,
  type ChosenArt,
  ItemId,
  ShowId,
  type SubjectId,
} from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  classes,
  color,
  Dialog,
  Img,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useRef, useState } from 'react';
import { createCallable } from 'react-call';

import { TitleDialogHeader } from '#web/features/catalog/title-dialog-header.component';
import { useAuth } from '#web/shared/lib/auth';

const sDefinition = styles({
  hidden: { display: 'none' },
  slot: { flexGrow: 1, flexBasis: 0, minWidth: 180 },
  poster: { width: '100%', maxWidth: 180, aspectRatio: 2 / 3 },
  backdrop: { width: '100%', aspectRatio: 16 / 9 },
  logo: { width: '100%', aspectRatio: 16 / 9 },
  still: { width: '100%', aspectRatio: 16 / 9 },
});

const TITLE_ROLES = ['poster', 'backdrop', 'logo'] as const satisfies readonly ArtRole[];

const WASH = color('tint/4');

type Props = Readonly<{
  kind: ArtKind;
  id: string;
  title: string;
  roles?: readonly ArtRole[];
}>;

interface Slots {
  chosen: ChosenArt | undefined;
  busy: ArtRole | null;
  error: string | null;
  upload: (role: ArtRole, file: File) => void;
  reset: (role: ArtRole) => void;
}

function useChosenArt(kind: ArtKind, id: SubjectId): Slots {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['chosen-art', kind, id] as const;
  const { data, error: loadError } = useQuery({
    queryKey,
    queryFn: () => client.media.chosenArt.get(kind, id),
  });
  const [busy, setBusy] = useState<ArtRole | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const act = (role: ArtRole, work: () => Promise<unknown>) => {
    setBusy(role);
    setFailure(null);
    work()
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch((e: unknown) => setFailure(apiErrorText(e, t('artwork.applyFailed'))))
      .finally(() => setBusy(null));
  };
  return {
    chosen: data,
    busy,
    error: failure ?? (loadError ? apiErrorText(loadError, t('artwork.loadFailed')) : null),
    upload: (role, file) =>
      act(role, () => client.media.chosenArt.choose({ kind, id, role }, file)),
    reset: (role) => act(role, () => client.media.chosenArt.reset({ kind, id, role })),
  };
}

function ArtPreview({ role, url }: Readonly<{ role: ArtRole; url: string | null }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  const { client } = useAuth();
  return (
    <Img
      src={client.media.artwork.resolve(url, role === 'poster' ? 360 : 640)}
      alt=""
      radius="md"
      background={WASH}
      fit={role === 'logo' ? 'contain' : 'cover'}
      style={s[role]}
      fallback={
        <Box fill center>
          <Text variant="meta" color="white/45">
            {t('artwork.automatic')}
          </Text>
        </Box>
      }
    />
  );
}

const takeFile = (onFile: (file: File) => void) => (e: ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    onFile(file);
  }
  e.target.value = '';
};

function PickButton({
  busy,
  disabled,
  onFile,
}: Readonly<{ busy: boolean; disabled: boolean; onFile: (file: File) => void }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={classes(s.hidden)}
        onChange={takeFile(onFile)}
      />
      <Button
        variant="glass"
        size="sm"
        icon="upload"
        label={t('artwork.upload')}
        loading={busy}
        disabled={disabled}
        onPress={() => fileRef.current?.click()}
      />
    </>
  );
}

function ArtSlot({ role, slots }: Readonly<{ role: ArtRole; slots: Slots }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  const url = slots.chosen?.[role] ?? null;
  const busy = slots.busy === role;
  return (
    <Box gap={12} style={s.slot}>
      <Text variant="label">{t(`artwork.${role}`)}</Text>
      <ArtPreview role={role} url={url} />
      <Row gap={8} wrap>
        <PickButton
          busy={busy}
          disabled={slots.busy !== null && !busy}
          onFile={(file) => slots.upload(role, file)}
        />
        {url ? (
          <Button
            variant="ghost"
            size="sm"
            label={t('artwork.reset')}
            disabled={slots.busy !== null}
            onPress={() => slots.reset(role)}
          />
        ) : null}
      </Row>
    </Box>
  );
}

function ArtSlots({
  kind,
  id,
  roles,
}: Readonly<{ kind: ArtKind; id: string; roles: readonly ArtRole[] }>) {
  const t = useT();
  const slots = useChosenArt(kind, kind === 'show' ? ShowId.parse(id) : ItemId.parse(id));
  return (
    <Box gap={20}>
      <Text variant="meta" color="white/55">
        {t('artwork.hint')}
      </Text>
      {slots.error ? (
        <Callout.Root tone="danger">
          <Callout.Title>{slots.error}</Callout.Title>
        </Callout.Root>
      ) : null}
      <Row gap={24} wrap align="flex-start">
        {roles.map((role) => (
          <ArtSlot key={role} role={role} slots={slots} />
        ))}
      </Row>
    </Box>
  );
}

/** The pictures an admin uploads for a title: the poster, the backdrop and the logo of
 * a film or a show unless `roles` names others, such as an episode's `still`. Open with
 * `await ArtworkDialog.call({ kind, id, title, roles })`; it resolves on dismiss. */
export const ArtworkDialog = createCallable<Props>(({ call, kind, id, title, roles }) => {
  const t = useT();
  const shown = roles ?? TITLE_ROLES;
  return (
    <Dialog.Root
      open
      title={title}
      width={shown.length > 1 ? 'lg' : 'md'}
      onClose={() => call.end()}
    >
      <TitleDialogHeader overline={t('artwork.title')} title={title} onClose={() => call.end()} />
      <Dialog.Panel>
        <ArtSlots kind={kind} id={id} roles={shown} />
      </Dialog.Panel>
    </Dialog.Root>
  );
});
