import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import type { IconName } from '#ui/components/atoms/icon';
import { Img } from '#ui/components/atoms/img';
import { clamp01 } from '#ui/components/atoms/progress';
import { ProgressRing } from '#ui/components/atoms/progress-ring';
import { Text } from '#ui/components/atoms/text';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import {
  activeTheme,
  type StyleScope,
  scaledRadius,
  sharedStyle,
  styles,
  useStyleScope,
  useTheme,
} from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles, fontSizes as textSizes } from '#ui/core/tokens';
import { gradient } from '#ui/lib/css';
import { FocusRegion, FocusScope, useLockFocusBehind } from '#ui/lib/focus-scope';

export interface CountdownCardAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  /** The remote landed on this button. */
  onFocus?: () => void;
}

export interface CountdownCardProps {
  art?: string | null;
  eyebrow: string;
  title: string;
  subtitle?: string;
  secondsLeft: number | null;
  total: number;
  scale: number;
  secondary: CountdownCardAction;
  primary: CountdownCardAction;
  announce?: boolean;
  /** Whether the card holds the remote: it opens on `primary` and the chrome
   *  behind it waits, as behind a dialog. Default true. */
  active?: boolean;
}

const CARD_WIDTH = 392;
const COUNTDOWN_SIZE = 19;

const ART_FILL = 'linear-gradient(135deg, rgba(244,182,66,0.16), rgba(20,18,22,0.96))';
const VIGNETTE = 'radial-gradient(120% 120% at 50% 25%, transparent, rgba(0,0,0,0.5))';

const SECONDARY_FOCUS = { focus: { bg: 'tint/16' } } as const;
const PRIMARY_FOCUS = { focus: { bg: 'accentHover' } } as const;

const sizeOf = (fontSize: number, scope: StyleScope) =>
  sharedStyle(`countdown-card:size:${fontSize}`, { fontSize }, scope);

/** The player's bottom-right card: artwork with a draining ring, a title, and
 * two buttons the remote walks like any other. */
export function CountdownCard({
  art,
  eyebrow,
  title,
  subtitle,
  secondsLeft,
  total,
  scale,
  secondary,
  primary,
  announce = false,
  active = true,
}: Readonly<CountdownCardProps>) {
  useLockFocusBehind(active);
  const scope = useStyleScope();
  const s = useStyles(sDefinition);
  const theme = useTheme();
  const px = scaler(scale);
  const radiusOf = (size: 'lg' | '2xl') => scaledRadius(size, scale, activeTheme(scope.theme));
  const ring = px(54);
  return (
    <Box
      w={px(CARD_WIDTH)}
      maxW="100%"
      radius={radiusOf('2xl')}
      borderWidth={1}
      border="white/12"
      bg="playerSurface/90"
      p={px(20)}
      accessibilityLiveRegion={announce ? 'polite' : undefined}
    >
      <Box h={px(150)} mb={px(16)} radius={radiusOf('lg')} overflow="hidden">
        <Img src={art ?? null} background={ART_FILL} fill />
        <Box fill style={[s.vignette, gradient(VIGNETTE)]} />
        {secondsLeft == null ? null : (
          <Box absolute left={px(14)} bottom={px(14)} w={ring} h={ring} center>
            <Box absolute>
              <ProgressRing
                value={total > 0 ? clamp01(secondsLeft / total) : 0}
                size={ring}
                thickness={px(6)}
                track="rgba(255, 255, 255, 0.14)"
                fill={theme.colors.accent}
              />
            </Box>
            <Box w={px(42)} h={px(42)} center radius="circle" bg="playerSurface">
              <Text style={[s.countdown, sizeOf(px(COUNTDOWN_SIZE), scope)]}>
                {String(secondsLeft)}
              </Text>
            </Box>
          </Box>
        )}
      </Box>
      <Text style={s.eyebrow} color="text/50">
        {eyebrow}
      </Text>
      <Text lines={1} style={s.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={s.subtitle} color="accentText">
          {subtitle}
        </Text>
      ) : null}
      <FocusScope bridge={false} active={active} entryKey={active ? 'up' : 'down'}>
        <FocusRegion style={[s.actions, { gap: px(12), marginTop: px(16) }]}>
          <Button
            variant="ghost"
            size="sm"
            icon={secondary.icon}
            states={SECONDARY_FOCUS}
            onPress={secondary.onPress}
            onFocus={secondary.onFocus}
            label={secondary.label}
          />
          <Button
            variant="primary"
            size="sm"
            icon={primary.icon}
            autoFocus
            onPress={primary.onPress}
            onFocus={primary.onFocus}
            label={primary.label}
            states={PRIMARY_FOCUS}
            style={s.primary}
          />
        </FocusRegion>
      </FocusScope>
    </Box>
  );
}

const sDefinition = styles({
  vignette: { pointerEvents: 'none' },
  actions: { row: true },
  primary: { flex: 1 },
  countdown: {
    font: 'ui',
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
  },
  eyebrow: {
    font: 'ui',
    fontSize: textRoles.overline.size,
    fontWeight: '700',
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  title: {
    mt: 4,
    font: 'display',
    fontSize: textSizes.controlTitle,
    lineHeight: 23,
    fontWeight: '700',
  },
  subtitle: { mt: 3, font: 'ui', fontSize: textRoles.meta.size, fontWeight: '600' },
});
