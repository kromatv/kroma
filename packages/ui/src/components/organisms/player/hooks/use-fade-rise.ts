import { useEffect, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { ease } from '#ui/lib/ease';
import { WEB } from '#ui/lib/platform';
import { useReducedMotion } from '#ui/lib/reduced-motion';

export const FADE_MS = 180;

const RISE = 8;

export interface FadeRise {
  mounted: boolean;
  style: ViewStyle;
}

// react-native-web drops `useNativeDriver`, leaving a JS timer that writes an
// inline style every frame (see lib/progress-motion.web.tsx), so a browser gets
// a CSS transition. It needs one frame at the arriving style to run from.
function useSettled(shown: boolean): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!shown) {
      setSettled(false);
      return;
    }
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [shown]);
  return settled;
}

function webStyle(at: boolean, ms: number, rise: number): ViewStyle {
  return {
    opacity: at ? 1 : 0,
    transform: [{ translateY: at ? 0 : rise }],
    transitionProperty: 'opacity, transform',
    transitionDuration: `${ms}ms`,
    transitionTimingFunction: ease.out.css,
  } as ViewStyle;
}

function useNativeStyle(shown: boolean, ms: number, rise: number) {
  const [run] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (WEB) return;
    const anim = Animated.timing(run, {
      toValue: shown ? 1 : 0,
      duration: ms,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, ms, run]);
  return {
    opacity: run,
    transform: [{ translateY: run.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
  } as unknown as ViewStyle;
}

function useMounted(shown: boolean, ms: number): boolean {
  const [mounted, setMounted] = useState(shown);
  useEffect(() => {
    if (shown) {
      setMounted(true);
      return;
    }
    const out = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(out);
  }, [shown, ms]);
  return mounted;
}

/**
 * A short fade with a small rise, cut to nothing where the platform asks for less
 * motion. `mounted` stays true through the exit, so a caller stops drawing once it
 * is false rather than holding an invisible surface over the stage.
 */
export function useFadeRise(shown: boolean): FadeRise {
  const reduced = useReducedMotion();
  const ms = reduced ? 0 : FADE_MS;
  const rise = reduced ? 0 : RISE;
  const settled = useSettled(shown);
  const native = useNativeStyle(shown, ms, rise);
  const mounted = useMounted(shown, ms);
  return { mounted, style: WEB ? webStyle(shown && settled, ms, rise) : native };
}
