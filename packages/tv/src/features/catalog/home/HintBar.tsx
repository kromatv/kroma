// The bottom hint strip shared by Home and the browse grids: three short remote
// hints over a gradient that fades into the page. Purely decorative, so it never
// takes pointer events and never joins the focus set.

import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, gradient, Hint, shade, styles, Text } from '@kromatv/ui/kit';

const s = styles({
  hint: { fontSize: 13, fontWeight: '600' },
  hintKey: { fontSize: 13, fontWeight: '700' },
});

/** `strength` matches the design: Home fades from 0.8, the grids from 0.85
 * (they have a denser field of tiles running under the strip). */
export function HintBar({
  browseKey,
  strength = 0.8,
}: Readonly<{ browseKey: MessageKey; strength?: number }>) {
  const t = useT();
  return (
    <Box
      absolute
      left={0}
      right={0}
      bottom={0}
      row
      center
      gap={30}
      p={16}
      pointerEvents="none"
      style={gradient(`linear-gradient(0deg, ${shade(strength)}, transparent)`)}
    >
      <Hint text={t(browseKey)} size={13} gap={3} color="textDim" textStyle={s.hint} />
      <Hint text={t('content.hintRows')} size={13} gap={3} color="textDim" textStyle={s.hint} />
      <KeyHint button={t('content.hintOk')} action={t('content.hintOpen')} />
      <KeyHint button={t('content.hintHold')} action={t('content.moreActions')} />
    </Box>
  );
}

function KeyHint({ button, action }: Readonly<{ button: string; action: string }>) {
  return (
    <Text style={s.hint} color="textDim">
      <Text style={s.hintKey} color="accentText">
        {button}
      </Text>
      {` ${action}`}
    </Text>
  );
}
