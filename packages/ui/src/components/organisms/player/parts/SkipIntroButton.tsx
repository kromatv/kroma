import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { colors } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';

/**
 * Skip-intro pill (§13): a bottom-right "Passer l'intro" button shown only
 * during the detected intro window. Focus is state-driven (controlled kit
 * button - `focused` is ALWAYS passed, see ../lib/virtual-focus.ts), so on
 * focus the scrim pill flips to the primary variant: accent fill, ink label,
 * the kit's ring and scale. The variant swap is what expresses the design's
 * "amber when focused" without a bespoke control.
 * Sits above where the control bar mounts, so the two never overlap.
 */
export interface SkipIntroButtonProps {
  visible: boolean;
  focused: boolean;
  onSkip: () => void;
}

export function SkipIntroButton({ visible, focused, onSkip }: Readonly<SkipIntroButtonProps>) {
  const t = useT();
  if (!visible) return null;
  return (
    <Box absolute bottom={214} right={34} z={30}>
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
