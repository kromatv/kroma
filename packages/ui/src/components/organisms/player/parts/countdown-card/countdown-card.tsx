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
  sv,
  useStyleScope,
  useSv,
  useTheme,
} from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles, fontSizes as textSizes } from '#ui/core/tokens';
import { gradient } from '#ui/lib/css';

export interface CountdownCardAction {
  label: string;
  icon?: IconName;
  focused: boolean;
  onPress: () => void;
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
}

const CARD_WIDTH = 392;
const COUNTDOWN_SIZE = 19;

const ART_FILL = 'linear-gradient(135deg, rgba(244,182,66,0.16), rgba(20,18,22,0.96))';
const VIGNETTE = 'radial-gradient(120% 120% at 50% 25%, transparent, rgba(0,0,0,0.5))';

const secondaryFill = sv({ base: { _focus: { bg: 'tint/16' } } });
const primaryFill = sv({ base: { flex: 1, _focus: { bg: 'accentHover' } } });

const sizeOf = (fontSize: number, scope: StyleScope) =>
  sharedStyle(`countdown-card:size:${fontSize}`, { fontSize }, scope);

/** The player's bottom-right card: artwork with a draining ring, a title, and
 * two controlled buttons the player's own key routing drives. */
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
}: Readonly<CountdownCardProps>) {
  const secondaryFillScoped = useSv(secondaryFill);
  const primaryFillScoped = useSv(primaryFill);
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
      <Box row gap={px(12)} mt={px(16)}>
        <Button
          variant="ghost"
          size="sm"
          icon={secondary.icon}
          focused={secondary.focused}
          style={secondaryFillScoped(undefined, { focus: secondary.focused }).root}
          onPress={secondary.onPress}
          label={secondary.label}
        />
        <Button
          variant="primary"
          size="sm"
          icon={primary.icon}
          focused={primary.focused}
          onPress={primary.onPress}
          label={primary.label}
          style={primaryFillScoped(undefined, { focus: primary.focused }).root}
        />
      </Box>
    </Box>
  );
}

const sDefinition = styles({
  vignette: { pointerEvents: 'none' },
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
