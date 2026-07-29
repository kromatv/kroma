import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { colors } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';
import { GUTTER, scaler } from '../lib/metrics';

/**
 * Skip-intro pill (§13): a bottom-right "Passer l'intro" button shown only
 * during the detected intro window. Focus is state-driven (controlled kit
 * button - `focused` is ALWAYS passed, see ../lib/virtual-focus.ts), so on
 * focus the scrim pill flips to the primary variant: accent fill, ink label,
 * the kit's ring and scale. The variant swap is what expresses the design's
 * "amber when focused" without a bespoke control.
 * Sits above whatever the bottom chrome is currently showing, so the two never
 * overlap - see `lift`.
 */
export interface SkipIntroButtonProps {
  visible: boolean;
  focused: boolean;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  /**
   * How high the pill sits above the bottom edge, in real pixels (already
   * scaled by the caller).
   *
   * It is passed in rather than fixed here because the thing it has to clear is
   * not a constant: the transport grows and shrinks with the stage, and the
   * up-next peek lifts it 150px further whenever there is a next episode. The
   * fixed 214 this used to be was right for exactly one of those cases and drew
   * the pill straight through the seek bar in the others - which is what the
   * player measures the transport for.
   */
  lift: number;
  onSkip: () => void;
}

export function SkipIntroButton({
  visible,
  focused,
  scale = 1,
  lift,
  onSkip,
}: Readonly<SkipIntroButtonProps>) {
  const t = useT();
  const px = scaler(scale);
  if (!visible) return null;
  // The gutter is scaled with the rest of the chrome, off the SAME constant:
  // unscaled, this sat on a 34px margin while the row beneath it had shrunk to
  // 27, so the two right edges visibly disagreed in any window narrower than
  // the design.
  return (
    <Box absolute bottom={lift} right={px(GUTTER)} z={30}>
      <Button
        variant={focused ? 'primary' : 'scrim'}
        focused={focused}
        onPress={onSkip}
        label={t('player.skipIntro')}
        iconRight="chevron-right"
        // The scrim variant carries a 1px border and primary none; pinning the
        // border on the focused state too keeps the pill's box from shifting a
        // pixel when focus lands.
        style={focused ? FOCUS_EDGE : null}
      />
    </Box>
  );
}

const FOCUS_EDGE = { borderWidth: 1, borderColor: colors.accent } as const;
