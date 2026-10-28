import { useEffect, useRef, useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import type { FocusHandle } from '#ui/components/atoms/focusable';
import { GUTTER, scaler } from '#ui/components/organisms/player/lib/metrics';
import { sv, useSv } from '#ui/core';
import { useT } from '#ui/services/i18n';

// The scrim variant carries a 1px border and primary none; pinning the border on
// the focused state too keeps the pill's box from shifting a pixel when focus
// lands.
const skipPill = sv({ base: { _focus: { border: 'accent' } } });

/**
 * Skip-intro pill (§13): a bottom-right "Passer l'intro" button shown only
 * during the detected intro window. It takes the focus as it appears, so OK
 * skips; on focus the variant swaps from scrim to primary, giving the design's
 * "amber when focused" without a bespoke control. Sits above the bottom chrome
 * via `lift`, so the two never overlap.
 */
export interface SkipIntroButtonProps {
  visible: boolean;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
  /**
   * How high the pill sits above the bottom edge, in real pixels (already
   * scaled). Passed in because what it must clear isn't constant: the transport
   * resizes with the stage, and the up-next peek lifts it 150px further. A
   * fixed value drew the pill through the seek bar in the other case.
   */
  lift: number;
  onSkip: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function SkipIntroButton({
  visible,
  scale = 1,
  lift,
  onSkip,
  onFocus,
  onBlur,
}: Readonly<SkipIntroButtonProps>) {
  const skipPillScoped = useSv(skipPill);
  const [focused, setFocused] = useState(false);
  const handle = useRef<FocusHandle>(null);
  useEffect(() => {
    if (visible) handle.current?.focus();
  }, [visible]);

  const t = useT();
  const px = scaler(scale);
  if (!visible) return null;
  // Scaled off the SAME constant as the row beneath it: unscaled, the two right
  // edges would disagree below the design width.
  return (
    <Box absolute bottom={lift} right={px(GUTTER)} z={30}>
      <Button
        variant={focused ? 'primary' : 'scrim'}
        focusHandle={handle}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onPress={onSkip}
        label={t('player.skipIntro')}
        iconRight="chevron-right"
        style={skipPillScoped(undefined, { focus: focused }).root}
      />
    </Box>
  );
}
