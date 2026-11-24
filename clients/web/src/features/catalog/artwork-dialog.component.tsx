import { apiErrorText } from '@kromatv/client';
import {
  type ArtKind,
  type ArtRole,
  type ChosenArt,
  ItemId,
  SeasonId,
  ShowId,
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

import { ArtLinkForm } from '#web/features/catalog/art-link-form.component';
import { TitleDialogHeading } from '#web/features/catalog/title-dialog-heading.component';
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

const SUBJECTS = { item: ItemId, show: ShowId, season: SeasonId } as const;

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
  link: (role: ArtRole, url: string) => Promise<boolean>;
  reset: (role: ArtRole) => void;
}

function useArtAction(queryKey: readonly unknown[]) {
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<ArtRole | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const act = async (role: ArtRole, work: () => Promise<unknown>) => {
    setBusy(role);
    setFailure(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey });
      return true;
    } catch (e: unknown) {
      setFailure(apiErrorText(e, t('artwork.applyFailed')));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, failure, act };
}

function useChosenArt(kind: ArtKind, raw: string): Slots {
  const t = useT();
  const { client } = useAuth();
  const art = client.media.chosenArt;
  const id = SUBJECTS[kind].parse(raw);
  const queryKey = ['chosen-art', kind, id] as const;
  const { data, error: loadError } = useQuery({ queryKey, queryFn: () => art.get(kind, id) });
  const { busy, failure, act } = useArtAction(queryKey);
  return {
    chosen: data,
    busy,
    error: failure ?? (loadError ? apiErrorText(loadError, t('artwork.loadFailed')) : null),
    upload: (role, file) => void act(role, () => art.choose({ kind, id, role }, file)),
    link: (role, url) => act(role, () => art.chooseLink({ kind, id, role }, url)),
    reset: (role) => void act(role, () => art.reset({ kind, id, role })),
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

type SlotProps = Readonly<{ role: ArtRole; slots: Slots }>;

function SlotButtons({
  role,
  slots,
  linking,
  onLinking,
}: SlotProps & Readonly<{ linking: boolean; onLinking: (open: boolean) => void }>) {
  const t = useT();
  const busy = slots.busy === role;
  return (
    <Row gap={8} wrap>
      <PickButton
        busy={busy && !linking}
        disabled={slots.busy !== null && !busy}
        onFile={(file) => slots.upload(role, file)}
      />
      <Button
        variant="ghost"
        size="sm"
        icon="link"
        label={t('artwork.fromLink')}
        disabled={slots.busy !== null}
        onPress={() => onLinking(!linking)}
      />
      <ResetButton role={role} slots={slots} />
    </Row>
  );
}

function ResetButton({ role, slots }: SlotProps) {
  const t = useT();
  if (!slots.chosen?.[role]) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      label={t('artwork.reset')}
      disabled={slots.busy !== null}
      onPress={() => slots.reset(role)}
    />
  );
}

function ArtSlot({ role, slots }: SlotProps) {
  const t = useT();
  const s = useStyles(sDefinition);
  const [linking, setLinking] = useState(false);
  const link = (url: string) => {
    void slots.link(role, url).then((done) => {
      if (done) {
        setLinking(false);
      }
    });
  };
  return (
    <Box gap={12} style={s.slot}>
      <Text variant="label">{t(`artwork.${role}`)}</Text>
      <ArtPreview role={role} url={slots.chosen?.[role] ?? null} />
      <SlotButtons role={role} slots={slots} linking={linking} onLinking={setLinking} />
      {linking ? (
        <ArtLinkForm busy={slots.busy === role} disabled={slots.busy !== null} onLink={link} />
      ) : null}
    </Box>
  );
}

function ArtSlots({
  kind,
  id,
  roles,
}: Readonly<{ kind: ArtKind; id: string; roles: readonly ArtRole[] }>) {
  const t = useT();
  const slots = useChosenArt(kind, id);
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
 * a film or a show unless `roles` names others, such as an episode's `still` or a
 * season's `poster`. Open with `await ArtworkDialog.call({ kind, id, title, roles })`;
 * it resolves on dismiss. */
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
      <Dialog.Header>
        <TitleDialogHeading
          overline={t('artwork.title')}
          title={title}
          onClose={() => call.end()}
        />
      </Dialog.Header>
      <Dialog.Panel>
        <ArtSlots kind={kind} id={id} roles={shown} />
      </Dialog.Panel>
    </Dialog.Root>
  );
});
