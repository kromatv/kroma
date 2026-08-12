// The panel's top line: where it is, the way back, and the way out.
//
// The Back button appears in a sub-view only, and is lit from the open list's
// focus rather than from anything of its own (index -1 is this button - see
// ../../lib/panel-header). The close X appears only when the panel COVERS the
// stage, since then there is no scrim left to tap and a finger has no Back key.

import { Box } from '#ui/components/atoms/box';
import { IconButton } from '#ui/components/atoms/icon-button';
import { Text } from '#ui/components/atoms/text';
import { BackButton } from '#ui/components/molecules/back-button';
import { styles } from '#ui/core';
import { useT } from '#ui/services/i18n';

export function TitleBar({
  title,
  back,
  backFocused,
  onClose,
  px,
}: Readonly<{
  title: string;
  /** Absent in the menu, which has nothing above it. */
  back?: () => void;
  backFocused: boolean;
  /** Absent unless the panel covers the stage. */
  onClose?: () => void;
  px: (n: number) => number;
}>) {
  const t = useT();
  return (
    <Box row align="center" gap={px(18)} mb={px(30)}>
      {back ? (
        <BackButton
          variant="glass"
          diameter={px(46)}
          focused={backFocused}
          onPress={back}
          label={t('player.back')}
        />
      ) : null}
      <Text lines={1} variant="h1" style={{ fontSize: px(38), flexShrink: 1 }}>
        {title}
      </Text>
      {onClose ? (
        // Pointer-only, controlled at `false`: the remote leaves with Back.
        <IconButton
          variant="ghost"
          diameter={px(44)}
          icon="x"
          glyph={px(20)}
          focused={false}
          hitSlop={6}
          style={s.close}
          onPress={onClose}
          label={t('common.close')}
        />
      ) : null}
    </Box>
  );
}

const s = styles({
  close: { ml: 'auto' },
});
