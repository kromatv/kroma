import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { sv } from '#ui/core';
import { useT } from '#ui/services/i18n';
import { GUTTER, scaler } from '../../lib/metrics';

// The scrim variant carries a 1px border and primary none; pinning the border on
// the focused state too keeps the pill's box from shifting a pixel when focus
// lands.
const skipPill = sv({ base: { _focus: { border: 'accent' } } });

/**
 * Skip-intro pill (§13): a bottom-right "Passer l'intro" button shown only
 * during the detected intro window. Focus is state-driven (`focused` is ALWAYS
 * passed, see ../lib/virtual-focus.ts): on focus the variant swaps from scrim to
 * primary, giving the design's "amber when focused" without a bespoke control.
 * Sits above the bottom chrome via `lift`, so the two never overlap.
 */
export interface SkipIntroButtonProps {
  visible: boolean;
  focused: boolean;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  /**
   * How high the pill sits above the bottom edge, in real pixels (already
   * scaled). Passed in because what it must clear isn't constant: the transport
   * resizes with the stage, and the up-next peek lifts it 150px further — a
   * fixed value drew the pill through the seek bar in the other case.
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
  // Scaled off the SAME constant as the row beneath it: unscaled, the two right
  // edges would disagree below the design width.
  return (
    <Box absolute bottom={lift} right={px(GUTTER)} z={30}>
      <Button
        variant={focused ? 'primary' : 'scrim'}
        focused={focused}
        onPress={onSkip}
        label={t('player.skipIntro')}
        iconRight="chevron-right"
        style={skipPill(undefined, { focus: focused }).root}
      />
    </Box>
  );
}
