import { memo, type ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { BackButton } from '#ui/components/molecules/back-button';
import { GUTTER, scaler } from '#ui/components/organisms/player/lib/metrics';
import { styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
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
  /** Host-supplied controls for the right edge (the web's "play on TV"). The
   * TV passes none: it is the screen things are cast TO. */
  actions?: ReactNode;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
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
  actions,
  scale = 1,
}: Readonly<TopBarProps>) {
  const t = useT();
  const px = scaler(scale);
  return (
    <Box
      absolute
      left={0}
      right={0}
      top={0}
      row
      align="center"
      gap={px(18)}
      px={px(GUTTER)}
      py={px(26)}
      style={[s.bar, gradient(SCRIM)]}
    >
      {/* Controlled focus (`focused` is ALWAYS passed): the button must never
          become a platform / navigator focus target inside the player - see
          ../lib/virtual-focus.ts. */}
      <BackButton
        variant="glass"
        diameter={px(42)}
        focused={backFocused ?? false}
        onPress={onBack}
        label={t('player.back')}
      />
      {/* `shrink`: a long film title truncates (it is already clamped to one
          line) rather than pushing the warning pill and the host's own actions
          off the right edge of a narrow window. */}
      <Box shrink={1} minW={0}>
        <Text lines={1} style={[s.title, { fontSize: px(TITLE_SIZE) }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text lines={1} style={[s.subtitle, { fontSize: px(SUBTITLE_SIZE) }]} color="text/60">
            {subtitle}
          </Text>
        ) : null}
      </Box>
      {warn || actions ? (
        <Box shrink={1} ml="auto" row align="center" gap={px(12)}>
          {warn ? (
            // The pill is the one thing here that may lose width before the
            // title does: a codec notice is a sentence, and it wraps to two
            // lines sooner than it crowds out what is playing.
            <Box shrink={1} radius="pill" bg="accentSoft" px={px(14)} py={px(8)}>
              <Text lines={2} style={[s.warn, { fontSize: px(WARN_SIZE) }]} color="accentText">
                {warn}
              </Text>
            </Box>
          ) : null}
          {actions}
        </Box>
      ) : null}
    </Box>
  );
});

// The design's sizes; the styles below carry what doesn't vary with them, so
// neither number is written twice.
const TITLE_SIZE = 19;
const SUBTITLE_SIZE = 13;
const WARN_SIZE = 13;

const s = styles({
  bar: { pointerEvents: 'box-none' },
  title: { font: 'display', fontWeight: '700', color: 'white' },
  subtitle: { font: 'ui', fontWeight: '500' },
  warn: { font: 'ui', fontWeight: '600' },
});
