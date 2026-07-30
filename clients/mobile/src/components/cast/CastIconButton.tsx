// The cast control, deliberately always present once signed in rather than
// gated on a TV being up: the empty picker explains itself, an absent button
// does not.

import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCast } from '@kroma/ui';
import { Icon, IconButton } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { useT } from '#mobile/lib/i18n';
import { colors } from '#mobile/lib/theme';

export function CastIconButton({
  size = 40,
  glyph = 22,
}: Readonly<{ size?: number; glyph?: number }>) {
  const t = useT();
  const router = useRouter();
  const { active, select } = useCast();
  const devices = useRef<BottomSheetModal>(null);

  return (
    <>
      <IconButton
        variant="ghost"
        size={size}
        glyph={glyph}
        hitSlop={10}
        label={active ? t('cast.playingOn', { device: active.name }) : t('cast.title')}
        onPress={() => devices.current?.present()}
      >
        <Icon name="cast" size={glyph} stroke={2} color={active ? colors.accent : colors.text} />
      </IconButton>
      <CastSheet
        ref={devices}
        onPick={(id) => {
          devices.current?.dismiss();
          select(id);
          // Picking a TV means "drive that one", so open the remote; picking
          // this device hands control back and stays where the viewer was.
          if (id) router.push('/cast' as never);
        }}
      />
    </>
  );
}
