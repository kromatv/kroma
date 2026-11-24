import type { ArtKind, ArtRole } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  Cropper,
  classes,
  color,
  Dialog,
  Img,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { type ChangeEvent, useRef, useState } from 'react';
import { createCallable } from 'react-call';

import { ArtLinkForm } from '#web/features/catalog/art-link-form.component';
import {
  ArtworkFramingPanel,
  artworkFramingBand,
  frameShapeOf,
} from '#web/features/catalog/artwork-framing-panel.component';
import { TitleDialogHeading } from '#web/features/catalog/title-dialog-heading.component';
import type { TitleShown } from '#web/features/catalog/title-shown';
import { useArtworkFraming } from '#web/features/catalog/use-artwork-framing.hook';
import { type Slots, useChosenArt } from '#web/features/catalog/use-chosen-art.hook';
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
  shown?: TitleShown;
}>;

const shownArt = (shown: TitleShown | undefined, role: ArtRole) =>
  role === 'poster' || role === 'backdrop' ? (shown?.[role] ?? null) : null;

function ArtPreview({
  role,
  chosen,
  shown,
}: Readonly<{ role: ArtRole; chosen: string | null; shown: string | null }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  const { client } = useAuth();
  const width = role === 'poster' ? 360 : 640;
  const src = chosen ? client.media.artwork.resolve(chosen, width) : shown;
  return (
    <Img
      src={src}
      alt=""
      radius="md"
      background={WASH}
      fit={role === 'logo' ? 'contain' : 'cover'}
      style={s[role]}
      fallback={
        <Box fill center>
          <Text variant="meta" color="white/45">
            {t('artwork.none')}
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

type Pick = (role: ArtRole, file: File) => void;

const pickFor =
  (slots: Slots, frame: Pick): Pick =>
  (role, file) => {
    if (frameShapeOf(role)) {
      frame(role, file);
    } else {
      slots.upload(role, file);
    }
  };

type Actions = Readonly<{
  role: ArtRole;
  slots: Slots;
  chosen: boolean;
  onPick: Pick;
  onLink: () => void;
}>;

function SlotActions({ role, slots, chosen, onPick, onLink }: Actions) {
  const t = useT();
  const busy = slots.busy === role;
  return (
    <Box gap={8} align="flex-start">
      <PickButton
        busy={busy}
        disabled={slots.busy !== null && !busy}
        onFile={(file) => onPick(role, file)}
      />
      <Button
        variant="ghost"
        size="sm"
        icon="link"
        label={t('artwork.fromLink')}
        disabled={slots.busy !== null}
        onPress={onLink}
      />
      {chosen ? (
        <Button
          variant="ghost"
          size="sm"
          label={t('artwork.reset')}
          disabled={slots.busy !== null}
          onPress={() => slots.reset(role)}
        />
      ) : null}
    </Box>
  );
}

type SlotProps = Readonly<{ role: ArtRole; slots: Slots; shown: string | null; onPick: Pick }>;

function useSlotLink(role: ArtRole, slots: Slots) {
  const [linking, setLinking] = useState(false);
  const link = (url: string) => {
    void slots.link(role, url).then((kept) => {
      if (kept) {
        setLinking(false);
      }
    });
  };
  return { linking, link, toggle: () => setLinking(!linking) };
}

function ArtSlot({ role, slots, shown, onPick }: SlotProps) {
  const t = useT();
  const s = useStyles(sDefinition);
  const { linking, link, toggle } = useSlotLink(role, slots);
  const chosen = slots.chosen?.[role] ?? null;
  return (
    <Box gap={12} style={s.slot}>
      <Text variant="label">{t(`artwork.${role}`)}</Text>
      <ArtPreview role={role} chosen={chosen} shown={shown} />
      <Text variant="meta" color="white/45">
        {t(chosen ? 'artwork.uploaded' : 'artwork.automatic')}
      </Text>
      <SlotActions
        role={role}
        slots={slots}
        chosen={chosen !== null}
        onPick={onPick}
        onLink={toggle}
      />
      {linking ? (
        <ArtLinkForm busy={slots.busy === role} disabled={slots.busy !== null} onLink={link} />
      ) : null}
    </Box>
  );
}

type Panel = Readonly<{
  slots: Slots;
  roles: readonly ArtRole[];
  shown: TitleShown | undefined;
  onPick: Pick;
}>;

function ArtPanel({ slots, roles, shown, onPick }: Panel) {
  const t = useT();
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
          <ArtSlot
            key={role}
            role={role}
            slots={slots}
            shown={shownArt(shown, role)}
            onPick={onPick}
          />
        ))}
      </Row>
    </Box>
  );
}

type Framing = ReturnType<typeof useArtworkFraming>;

type Steps = Props & Readonly<{ step: Framing; onClose: () => void }>;

function ArtworkSteps({ step, onClose, ...props }: Steps) {
  const { kind, id, title, shown, roles = TITLE_ROLES } = props;
  const t = useT();
  const slots = useChosenArt(kind, id);
  const { framing, begin, end } = step;
  const keep = (role: ArtRole) => (picture: Blob) => {
    slots.upload(role, picture);
    end();
  };
  return (
    <Dialog.Root open title={title} width={roles.length > 1 ? 'lg' : 'md'} onClose={onClose}>
      <Dialog.Header>
        <TitleDialogHeading overline={t('artwork.title')} title={title} onClose={onClose} />
      </Dialog.Header>
      <Dialog.Panel>
        {framing ? (
          <ArtworkFramingPanel role={framing.role} />
        ) : (
          <ArtPanel slots={slots} roles={roles} shown={shown} onPick={pickFor(slots, begin)} />
        )}
      </Dialog.Panel>
      {framing
        ? artworkFramingBand({ framing, onCancel: end, onFramed: keep(framing.role) })
        : null}
    </Dialog.Root>
  );
}

/** The pictures an admin uploads for a title: the poster, the backdrop and the
 * logo of a film or a show unless `roles` names others, such as an episode's
 * `still` or a season's `poster`. Each slot shows the picture in place while
 * none is uploaded (`shown`), and a picked poster, backdrop or still is framed
 * to its slot's shape before it is sent. Open with `await ArtworkDialog.call({
 * kind, id, title, roles, shown })`; it resolves on dismiss. */
export const ArtworkDialog = createCallable<Props>(({ call, ...props }) => {
  const step = useArtworkFraming();
  return (
    <Cropper.Root
      src={step.framing?.src ?? null}
      aspect={step.framing ? frameShapeOf(step.framing.role)?.aspect : undefined}
      value={step.transform}
      onValueChange={step.setTransform}
    >
      <ArtworkSteps {...props} step={step} onClose={() => call.end()} />
    </Cropper.Root>
  );
});
