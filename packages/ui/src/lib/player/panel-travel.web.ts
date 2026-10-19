import type { ViewStyle } from 'react-native';
import { CARD_MS } from '#ui/components/organisms/player/lib/panel-slide';
import { ease } from '#ui/lib/ease';

/** The settings panel's entrance and exit: on screen when `shown`, `width`
 * pixels off its edge and transparent when not. The browsers have no native
 * driver, so the panel travels on a CSS transition owned by the compositor. */
export function usePanelTravel(shown: boolean, width: number): ViewStyle {
  return {
    opacity: shown ? 1 : 0,
    transform: `translateX(${shown ? 0 : width}px)`,
    transitionProperty: 'transform, opacity',
    transitionDuration: `${CARD_MS}ms`,
    transitionTimingFunction: ease.out.css,
    willChange: 'transform',
  } as ViewStyle;
}
