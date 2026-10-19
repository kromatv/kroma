import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { sharedStyle, useStyleScope } from '#ui/core';
import { ease } from './ease';
import type { GlideBoxProps, GlideRect } from './glide-box-types';

function travelOf(slideX: boolean): string {
  return slideX ? 'transform, width, opacity' : 'left, top, width, height, opacity';
}

/** A box that travels to each rect it is given and fades out on null. */
export function GlideBox({ rect, durationMs, slideX = false, style }: Readonly<GlideBoxProps>) {
  const scope = useStyleScope();
  const [last, setLast] = useState<GlideRect | null>(null);
  const [entering, setEntering] = useState(true);
  if (rect && last && rect !== last && entering) setEntering(false);
  if (rect && rect !== last) setLast(rect);
  const box = rect ?? last;
  if (!box) return null;
  const motion = sharedStyle(
    `glide-box:${entering}:${slideX}:${durationMs}`,
    {
      transitionProperty: entering ? 'opacity' : travelOf(slideX),
      transitionDuration: `${durationMs}ms`,
      transitionTimingFunction: ease.spring.css,
    },
    scope,
  );
  const place = slideX
    ? ({ transform: `translateX(${box.x}px)` } as unknown as ViewStyle)
    : { left: box.x };
  return (
    <View
      style={[
        style,
        motion,
        place,
        { top: box.y, width: box.width, height: box.height, opacity: rect ? 1 : 0 },
      ]}
    />
  );
}
