import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { FADE_MS, useFadeRise } from '#ui/components/organisms/player/hooks/use-fade-rise';
import { scaler } from '#ui/components/organisms/player/lib/metrics';
import {
  IconBack10,
  IconFwd10,
  IconMute,
  IconVolHigh,
  IconVolLow,
} from '#ui/components/organisms/player/parts/icons';
import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { backdropBlur } from '#ui/lib/css';
import { formatTimecode } from '#ui/lib/intl';
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
  /** How high the pill sits above the bottom edge, in real pixels (already
   *  scaled): clear of the transport while the chrome is up, close to the edge
   *  once it has gone. The same number the skip-intro pill takes. */
  lift: number;
}

function useLinger<T>(value: T | null): T | null {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    if (value) {
      setHeld(value);
      return;
    }
    const out = setTimeout(() => setHeld(null), FADE_MS);
    return () => clearTimeout(out);
  }, [value]);
  return held;
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

const padOf = (x: number, y: number, scope: StyleScope) =>
  sharedStyle(`flash:pad:${x}:${y}`, { paddingHorizontal: x, paddingVertical: y }, scope);
const sizeOf = (fontSize: number, scope: StyleScope) =>
  sharedStyle(`flash:size:${fontSize}`, { fontSize }, scope);

/**
 * A transient pill low on the picture, just above the seek bar it describes:
 * the seek so far with its direction, or the volume a key just set. It keeps
 * out of the frame's middle, and draws the last flash while fading out so a
 * run of taps reads as one label counting up.
 */
export function StageFlashView({ flash, scale = 1, lift }: Readonly<StageFlashProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const t = useT();
  const held = useLinger(flash);
  const fade = useFadeRise(flash != null);
  const px = scaler(scale);
  if (!held) return null;

  const glyph = held.kind === 'seek' ? seekGlyph(held, px(30)) : volumeGlyph(held.level, px(26));
  const label =
    held.kind === 'seek'
      ? seekLabel(held.deltaSec, t)
      : t('player.volumeLevel', { percent: Math.round(held.level * 100) });

  return (
    <Box absolute left={0} right={0} bottom={lift} z={12} align="center" style={s.inert}>
      <Animated.View style={fade.style}>
        <Box
          row
          align="center"
          gap={px(10)}
          radius="pill"
          bg="black/55"
          style={[s.frost, padOf(px(20), px(10), scope)]}
        >
          {glyph}
          <Text variant="title" color="white" style={sizeOf(px(24), scope)}>
            {label}
          </Text>
        </Box>
      </Animated.View>
    </Box>
  );
}

const sDefinition = styles({
  inert: { pointerEvents: 'none' },
  frost: backdropBlur(10),
});
