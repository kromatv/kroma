import type { ArtRole } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import {
  Box,
  Cropper,
  type CropOutput,
  Dialog,
  styles,
  Text,
  useCropper,
  useStyles,
} from '@kromatv/ui/kit';
import { useState } from 'react';

import type { ArtworkFraming } from '#web/features/catalog/use-artwork-framing.hook';

const sDefinition = styles({
  poster: { width: 260, maxWidth: '100%', alignSelf: 'center' },
  backdrop: { width: '100%' },
});

interface FrameShape {
  aspect: number;
  output: CropOutput;
}

const SHAPES: Readonly<Partial<Record<ArtRole, FrameShape>>> = {
  poster: { aspect: 2 / 3, output: { width: 780, type: 'image/jpeg', quality: 0.95 } },
  backdrop: { aspect: 16 / 9, output: { width: 1920, type: 'image/jpeg', quality: 0.95 } },
  still: { aspect: 16 / 9, output: { width: 780, type: 'image/jpeg', quality: 0.95 } },
};

/** The frame a slot's picture is cropped to before it is sent: its width over
 * its height and the file written. Null for a slot sent as picked, the logo,
 * which keeps its own shape and its transparency. */
export function frameShapeOf(role: ArtRole): FrameShape | null {
  return SHAPES[role] ?? null;
}

interface Band {
  framing: ArtworkFraming;
  onCancel: () => void;
  onFramed: (picture: Blob) => void;
}

/** The picked picture behind a frame of its slot's shape, with the zoom, turn
 * and reset tools. It renders inside the `Cropper.Root` holding the picture. */
export function ArtworkFramingPanel({ role }: Readonly<{ role: ArtRole }>) {
  const t = useT();
  const s = useStyles(sDefinition);
  return (
    <Box gap={16}>
      <Text variant="meta" color="white/55">
        {t('artwork.frameHint')}
      </Text>
      <Box gap={14} style={role === 'poster' ? s.poster : s.backdrop}>
        <Text variant="label">{t(`artwork.${role}`)}</Text>
        <Cropper.Frame label={t('artwork.frame')} />
        <Box row align="center" gap={8}>
          <Cropper.Zoom outLabel={t('artwork.zoomOut')} inLabel={t('artwork.zoomIn')} />
          <Box flex />
          <Cropper.Rotate label={t('artwork.rotate')} />
          <Cropper.Reset label={t('artwork.resetFrame')} />
        </Box>
      </Box>
    </Box>
  );
}

function FramingActions({ framing, onCancel, onFramed }: Readonly<Band>) {
  const t = useT();
  const { crop } = useCropper();
  const [busy, setBusy] = useState(false);
  const keep = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    void crop(frameShapeOf(framing.role)?.output)
      .catch(() => null)
      .then((framed) => onFramed(framed ?? framing.file));
  };
  return (
    <Dialog.Actions
      onCancel={onCancel}
      cancelLabel={t('common.cancel')}
      onConfirm={keep}
      confirmLabel={t('artwork.useFramed')}
      busy={busy}
    />
  );
}

/** The framing step's footer: go back to the slots, or keep what is in the
 * frame. A browser that cannot draw the crop keeps the picture as picked. */
export function artworkFramingBand(band: Readonly<Band>) {
  return (
    <Dialog.Footer>
      <FramingActions {...band} />
    </Dialog.Footer>
  );
}
