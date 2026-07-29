// The cast control, in the app's chrome.
//
// Always present once signed in - not gated on a TV being up. A button that
// appears only when a set happens to be awake is a button nobody learns is
// there, and "why can't I see it" is a worse failure than an empty picker that
// says, in one line, to open KROMA on the television.
//
// Pressing it always opens the device list - that is what a cast button does
// everywhere, and it is where "this device" lives, so disconnecting is one tap
// from anywhere in the app. The mini bar above the tabs is the way into the
// remote; this is the way out.

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
          // Picking a TV from the chrome is "drive that one", not "play this":
          // the remote is where you say what to play next. Picking this device
          // simply hands control back and stays where the viewer was.
          if (id) router.push('/cast' as never);
        }}
      />
    </>
  );
}
