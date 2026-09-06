// Web adapter over the kit's <Img>: a style sizes the box, the kit fills it
// and owns the fade, cross-fade, fallback and sanitising. `fill` stretches the
// box itself to a positioned parent.

import { Box, Img, type ImgProps, styles } from '@kroma/ui/kit';
import type { StyleProp, ViewStyle } from 'react-native';

export interface ImageProps extends Omit<ImgProps, 'fill' | 'style'> {
  style?: StyleProp<ViewStyle>;
  fill?: boolean;
}

const s = styles({
  box: { position: 'relative', overflow: 'hidden' },
  fill: { fill: true, overflow: 'hidden' },
});

export function Image({ style, fill = false, ...img }: Readonly<ImageProps>) {
  return (
    <Box style={[fill ? s.fill : s.box, style]}>
      <Img fill {...img} />
    </Box>
  );
}
