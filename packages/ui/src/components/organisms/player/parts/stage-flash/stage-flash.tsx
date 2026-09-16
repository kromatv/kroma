import { useEffect, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import {
  IconBack10,
  IconFwd10,
  IconMute,
  IconVolHigh,
  IconVolLow,
} from '#ui/components/organisms/player/parts/icons';
import { sharedStyle, styles } from '#ui/core';
import { backdropBlur } from '#ui/lib/css';
import { ease } from '#ui/lib/ease';
import { formatTimecode } from '#ui/lib/intl';
import { WEB } from '#ui/lib/platform';
import { useT } from '#ui/services/i18n';

/** What a keyboard or remote shortcut just did to the film, for the stage to
 *  echo: a seek burst adding up as the presses land, or the level a volume key
 *  set. `null` once nothing is being shown. */
export type StageFlash =
  | { kind: 'seek'; dir: -1 | 1; deltaSec: number }
  | { kind: 'volume'; level: number };

export interface StageFlashProps {
  flash: StageFlash | null;
  /** The chrome's scale (see ../lib/metrics). 1 on a television stage. */
  scale?: number;
}

const FLASH_FADE_MS = 180;

function useLinger<T>(value: T | null): T | null {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    if (value) {
      setHeld(value);
      return;
    }
    const out = setTimeout(() => setHeld(null), FLASH_FADE_MS);
    return () => clearTimeout(out);
  }, [value]);
  return held;
}

function webFade(shown: boolean): ViewStyle {
  return {
    opacity: shown ? 1 : 0,
    transform: [{ scale: shown ? 1 : 0.9 }],
    transitionProperty: 'opacity, transform',
    transitionDuration: `${FLASH_FADE_MS}ms`,
    transitionTimingFunction: ease.out.css,
  } as ViewStyle;
}

function useNativeFade(shown: boolean) {
  const [run] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (WEB) return;
    const anim = Animated.timing(run, {
      toValue: shown ? 1 : 0,
      duration: FLASH_FADE_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, run]);
  return {
    opacity: run,
    transform: [{ scale: run.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
  };
}

function useFade(shown: boolean) {
  const native = useNativeFade(shown);
  return WEB ? webFade(shown) : native;
}

function seekLabel(deltaSec: number, t: ReturnType<typeof useT>): string {
  const whole = Math.round(Math.abs(deltaSec));
  return whole < 60 ? t('player.seekSeconds', { n: whole }) : formatTimecode(whole);
}

function seekGlyph(seek: { dir: -1 | 1; deltaSec: number }, size: number) {
  const back = seek.deltaSec < 0 || (seek.deltaSec === 0 && seek.dir < 0);
  return back ? <IconBack10 size={size} /> : <IconFwd10 size={size} />;
}

function volumeGlyph(level: number, size: number) {
  if (level <= 0) return <IconMute size={size} />;
  if (level < 0.5) return <IconVolLow size={size} />;
  return <IconVolHigh size={size} />;
}

const padOf = (x: number, y: number) =>
  sharedStyle(`flash:pad:${x}:${y}`, { paddingHorizontal: x, paddingVertical: y });
const sizeOf = (fontSize: number) => sharedStyle(`flash:size:${fontSize}`, { fontSize });

/**
 * A transient pill over the middle of the picture (YouTube's arrow feedback): the
 * seek so far with its direction, or the volume a key just set. It draws the
 * last flash while fading out, so a run of taps reads as one label counting up.
 */
export function StageFlashView({ flash, scale = 1 }: Readonly<StageFlashProps>) {
  const t = useT();
  const held = useLinger(flash);
  const fade = useFade(flash != null);
  const px = scaler(scale);
  if (!held) return null;

  const glyph = held.kind === 'seek' ? seekGlyph(held, px(44)) : volumeGlyph(held.level, px(38));
  const label =
    held.kind === 'seek'
      ? seekLabel(held.deltaSec, t)
      : t('player.volumeLevel', { percent: Math.round(held.level * 100) });

  return (
    <Box fill z={12} center style={s.inert}>
      <Animated.View style={fade}>
        <Box
          row
          align="center"
          gap={px(14)}
          radius="pill"
          bg="black/55"
          style={[s.frost, padOf(px(28), px(14))]}
        >
          {glyph}
          <Text variant="title" color="#FFFFFF" style={sizeOf(px(34))}>
            {label}
          </Text>
        </Box>
      </Animated.View>
    </Box>
  );
}

const s = styles({
  inert: { pointerEvents: 'none' },
  frost: backdropBlur(10),
});
