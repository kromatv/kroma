import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { CARD_MS } from '#ui/components/organisms/player/lib/panel-slide';
import { ease } from '#ui/lib/ease';

/** The settings panel's entrance and exit: on screen when `shown`, `width`
 * pixels off its edge and transparent when not. Driven by Animated with the
 * native driver; the result belongs on an `Animated.View`. */
export function usePanelTravel(shown: boolean, width: number) {
  const [slide] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const anim = Animated.timing(slide, {
      toValue: shown ? 0 : 1,
      duration: CARD_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [shown, slide]);
  return {
    opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }],
  };
}
