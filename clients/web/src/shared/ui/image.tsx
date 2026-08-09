// Web adapter over the kit's <Img>: Tailwind classes size the box, the kit
// fills it and owns the fade, cross-fade, fallback and sanitising. `fill`
// stretches the box itself to a positioned parent.

import { Img, type ImgProps } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

export interface ImageProps extends Omit<ImgProps, 'fill' | 'style'> {
  className?: string;
  style?: CSSProperties;
  fill?: boolean;
}

export function Image({ className, style, fill = false, ...img }: Readonly<ImageProps>) {
  return (
    <div
      className={className}
      style={{
        position: fill ? 'absolute' : 'relative',
        ...(fill ? { top: 0, right: 0, bottom: 0, left: 0 } : null),
        overflow: 'hidden',
        ...style,
      }}
    >
      <Img fill {...img} />
    </div>
  );
}
