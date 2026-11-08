import {
  Box,
  radius as cornerRadius,
  styles,
  Text,
  fontSizes as textSizes,
  useStableCallback,
  useStyles,
} from '@kromatv/ui/kit';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useExclusiveGestures,
  usePinchGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import type { Transport } from '#mobile/player/engine';
import { useChromeReveal } from '#mobile/player/useChromeReveal';

const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface ChromeFrame {
  visible: boolean;
  insets: EdgeInsets;
  lift: number;
  top: number;
  width: number;
  height: number;
  poke(): void;
  hold(): () => void;
}

/** The touch surface under a phone player's chrome: a tap shows or hides the
 * controls, a double tap on an outer third skips ten seconds, a pinch switches
 * fit and fill. `children` draws the chrome from where the controls stand:
 * `lift` clears them from below, `top` from above. */
export function ChromeSurface({
  engine,
  fill,
  onZoom,
  notice,
  compact,
  children,
}: Readonly<{
  engine: Pick<Transport, 'waiting' | 'skip'>;
  fill: boolean;
  onZoom(fill: boolean): void;
  notice?: string | null;
  compact: boolean;
  children(frame: ChromeFrame): ReactNode;
}>) {
  const s = useStyles(sDefinition);

  const t = useT();
  const safeInsets = useSafeAreaInsets();
  const insets = compact ? NO_INSETS : safeInsets;
  const { shown, poke, toggle, hold } = useChromeReveal();
  const visible = shown || engine.waiting;

  const window = useWindowDimensions();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const width = bounds.width || window.width;
  const height = bounds.height || window.height;
  const [zoomNote, setZoomNote] = useState<string | null>(null);
  useEffect(() => {
    if (!zoomNote) return;
    const id = setTimeout(() => setZoomNote(null), 1100);
    return () => clearTimeout(id);
  }, [zoomNote]);

  const onTap = useStableCallback(() => toggle());
  const onDoubleTap = useStableCallback((x: number) => {
    if (x < width / 3) engine.skip(-10);
    else if (x > (width * 2) / 3) engine.skip(10);
    else return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    poke();
  });
  const onPinch = useStableCallback((scale: number) => {
    if (Math.abs(scale - 1) < 0.15) return;
    const wantFill = scale > 1;
    if (wantFill === fill) return;
    onZoom(wantFill);
    setZoomNote(wantFill ? t('player.zoomFill') : t('player.zoomFit'));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  });
  const tap = useTapGesture({
    runOnJS: true,
    onDeactivate: () => onTap(),
  });
  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    onDeactivate: (e) => {
      if (!e.canceled) onDoubleTap(e.x);
    },
  });
  const pinch = usePinchGesture({
    runOnJS: true,
    onDeactivate: (e) => onPinch(e.scale),
  });
  const taps = useExclusiveGestures(doubleTap, tap);
  const gestures = useCompetingGestures(pinch, taps);

  const controls = compact ? { lift: 16, top: 42 } : { lift: 110, top: 64 };
  const lift = (visible ? controls.lift : 20) + insets.bottom;
  const top = (visible ? controls.top : 12) + insets.top;

  return (
    <Box
      fill
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBounds((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      }}
    >
      {/* Tap layer sits BEHIND the controls: toggling visibility must not fire
          when a control is pressed. */}
      <GestureDetector gesture={gestures}>
        <Box fill />
      </GestureDetector>
      <Box style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {(zoomNote ?? notice) ? (
          <Box style={[s.zoomNote, { top: insets.top + 18 }]} pointerEvents="none">
            <Text style={s.zoomNoteText}>{zoomNote ?? notice}</Text>
          </Box>
        ) : null}
        {children({ visible, insets, lift, top, width, height, poke, hold })}
      </Box>
    </Box>
  );
}

const sDefinition = styles({
  zoomNote: {
    absolute: true,
    self: 'center',
    px: 14,
    py: 7,
    bg: 'bg/80',
    radius: cornerRadius.pill,
  },
  zoomNoteText: { color: 'text', fontSize: textSizes.caption, fontWeight: '600' },
});
