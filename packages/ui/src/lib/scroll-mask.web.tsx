import { type ReactNode, useEffect, useRef } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

const RAMP = 160;

function scrollerOf(node: HTMLElement): HTMLElement | null {
  for (let at = node.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === 'auto' || overflowY === 'scroll') return at;
  }
  return null;
}

function paint(node: HTMLElement, scroller: HTMLElement, inset: number) {
  const edge = scroller.getBoundingClientRect().top - node.getBoundingClientRect().top + inset;
  const mask =
    edge + RAMP <= 0 ? '' : `linear-gradient(180deg, transparent ${edge}px, #000 ${edge + RAMP}px)`;
  if (node.style.maskImage === mask) return;
  node.style.maskImage = mask;
  node.style.setProperty('-webkit-mask-image', mask);
}

/** Content inside a page scroller that dissolves to transparent as it scrolls up past `inset` below the scroller's top edge, over the next 160 px: a real mask, so whatever is truly behind it shows. Nothing on native, which has no mask. */
export function ScrollMask({
  inset,
  style,
  children,
}: Readonly<{ inset: number; style?: StyleProp<ViewStyle>; children: ReactNode }>) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    const scroller = node ? scrollerOf(node) : null;
    if (!node || !scroller) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint(node, scroller, inset);
      });
    };
    paint(node, scroller, inset);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [inset]);
  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}
