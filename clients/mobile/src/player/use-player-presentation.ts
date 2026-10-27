import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, useWindowDimensions } from 'react-native';
import { isTablet } from '#mobile/lib/layout';
import {
  allowPlayerRotation,
  lockPlayerOrientation,
  lockUpright,
  playerOrientation,
} from '#mobile/lib/orientation';
import type { PhysicalOrientation } from './physical-orientation';
import { usePhysicalOrientation } from './use-physical-orientation';

export function usePlayerPresentation() {
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const physical = usePhysicalOrientation(!isTablet);
  const landscape = width > height;
  const [requested, setRequested] = useState<boolean | null>(null);
  const physicalLandscape =
    physical.orientation === null ? landscape : physical.orientation === 'landscape';
  const fullscreen = requested ?? (!isTablet && physicalLandscape);
  const manualRevision = useRef(0);
  const previousPhysical = useRef<PhysicalOrientation | null>(null);
  const choose = useCallback((value: boolean) => {
    manualRevision.current += 1;
    setRequested(value);
  }, []);
  const collapse = useCallback(() => choose(false), [choose]);
  const toggle = useCallback(() => choose(!fullscreen), [choose, fullscreen]);
  const automaticInterface = physical.available === false && requested === null;
  const orientation = automaticInterface ? 'default' : playerOrientation(fullscreen);

  useLayoutEffect(() => {
    navigation.setOptions({ orientation, autoHideHomeIndicator: fullscreen });
  }, [navigation, orientation, fullscreen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (automaticInterface || isTablet) void allowPlayerRotation();
      else void lockPlayerOrientation(fullscreen);
    });
    return () => cancelAnimationFrame(frame);
  }, [automaticInterface, fullscreen]);

  useEffect(() => {
    const current = physical.orientation;
    if (current === null) return;
    const previous = previousPhysical.current;
    previousPhysical.current = current;
    if (previous === null || current === previous) return;
    const revision = manualRevision.current;
    const frame = requestAnimationFrame(() => {
      if (revision === manualRevision.current) setRequested(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [physical.orientation]);

  useEffect(() => {
    if (physical.available !== false || requested !== false || landscape) return;
    const frame = requestAnimationFrame(() => setRequested(null));
    return () => cancelAnimationFrame(frame);
  }, [physical.available, requested, landscape]);

  useEffect(() => () => lockUpright(), []);

  useEffect(() => {
    if (!fullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      collapse();
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen, collapse]);

  return { fullscreen, collapse, toggle };
}
