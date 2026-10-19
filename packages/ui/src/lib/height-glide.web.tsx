import type { ReactNode } from 'react';
import { View } from 'react-native';
import { sharedStyle, useStyleScope } from '#ui/core';
import { ease } from './ease';

/** A clipping box that glides to `height`; `undefined` sizes it to its content. */
export interface HeightGlideProps {
  height?: number;
  durationMs: number;
  children: ReactNode;
}

/** Glides with a compositor-side CSS transition on the box's height. */
export function HeightGlide({ height, durationMs, children }: Readonly<HeightGlideProps>) {
  const scope = useStyleScope();
  if (height === undefined) return <>{children}</>;
  const glide = sharedStyle(
    `height-glide:${durationMs}`,
    {
      overflow: 'hidden',
      transitionProperty: 'height',
      transitionDuration: `${durationMs}ms`,
      transitionTimingFunction: ease.out.css,
    },
    scope,
  );
  return <View style={[glide, { height }]}>{children}</View>;
}
