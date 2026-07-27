import { memo } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { BackButton } from '#ui/components/molecules/back-button';
import { gradient } from '#ui/lib/css';
import { fonts } from '#ui/lib/tokens';
import { useT } from '#ui/services/i18n';

/**
 * Player top chrome (§ top chrome): a gradient bar holding the round back
 * button, the title + subtitle, and an optional warning pill on the right (a
 * transcode / unsupported-codec notice, say). Rendered over the video, so the
 * bar itself is click-through and only the back button captures the pointer.
 */
export interface TopBarProps {
  title: string;
  subtitle?: string;
  /** Pre-translated warning message, or null to hide the pill. */
  warn?: string | null;
  onBack: () => void;
  /** Whether the nav machine currently rests on the back button. */
  backFocused?: boolean;
}

const SCRIM = 'linear-gradient(180deg, rgba(0,0,0,0.65), transparent)';

/** Memoized: its props never change on a playback tick, so the bar skips the
 * ~4 Hz timeupdate re-renders of the surrounding chrome. */
export const TopBar = memo(function TopBar({
  title,
  subtitle,
  warn,
  onBack,
  backFocused,
}: Readonly<TopBarProps>) {
  const t = useT();
  return (
    <Box
      absolute
      left={0}
      right={0}
      top={0}
      row
      align="center"
      gap={18}
      px={34}
      py={26}
      pointerEvents="box-none"
      style={gradient(SCRIM)}
    >
      {/* Controlled focus (`focused` is ALWAYS passed): the button must never
          become a platform / navigator focus target inside the player - see
          ../lib/virtual-focus.ts. */}
      <BackButton
        variant="glass"
        size={42}
        focused={backFocused ?? false}
        onPress={onBack}
        label={t('player.back')}
      />
      <Box style={{ minWidth: 0 }}>
        <Txt lines={1} style={TITLE}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt lines={1} style={SUBTITLE} color="rgba(244, 243, 240, 0.6)">
            {subtitle}
          </Txt>
        ) : null}
      </Box>
      {warn ? (
        <Box shrink={0} ml="auto" radius="pill" bg="accentSoft" px={14} py={8}>
          <Txt style={{ fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' }} color="accent">
            {warn}
          </Txt>
        </Box>
      ) : null}
    </Box>
  );
});

const TITLE = {
  fontFamily: fonts.display,
  fontSize: 19,
  fontWeight: '700' as const,
  color: '#FFFFFF',
};
const SUBTITLE = { fontFamily: fonts.ui, fontSize: 13, fontWeight: '500' as const };
