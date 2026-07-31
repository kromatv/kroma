// The scrub-bar preview thumbnail: a storyboard is ONE sprite sheet, and a
// thumbnail is a window onto it (position + clip). `background-position`, the
// obvious approach, draws nothing on Apple TV — RN's
// `experimental_backgroundImage` only takes gradients, not `url()` — so this
// uses an offset child in an `overflow: hidden` parent instead, which works on
// both platforms.

import { Image } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
import type { StoryboardTile } from '#ui/services/storyboard';

const s = styles({
  tileShadow: { boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)' },
});
const TILE_VIGNETTE = 'radial-gradient(120% 120% at 50% 35%, transparent, rgba(0,0,0,0.5))';

export function StoryboardThumb({ tile }: Readonly<{ tile: StoryboardTile }>) {
  return (
    <Box
      w={tile.width}
      h={tile.height}
      radius="md"
      overflow="hidden"
      borderWidth={2}
      border="rgba(255, 255, 255, 0.3)"
      bg="#000000"
      style={s.tileShadow}
    >
      <Image
        source={{ uri: tile.sheet }}
        // `stretch`: the sheet is drawn at exactly the size asked for. Any
        // fitting mode would letterbox it and every frame would land off-window.
        resizeMode="stretch"
        style={{
          position: 'absolute',
          left: tile.offsetX,
          top: tile.offsetY,
          // The sheet's OWN size, scaled as a layer: asking the image view for
          // `sheetWidth * scale` pixels instead can exceed the GPU's texture
          // limit on a television, drawing nothing with no error.
          width: tile.sheetWidth,
          height: tile.sheetHeight,
          transformOrigin: '0 0',
          transform: [{ scale: tile.scale }],
        }}
      />
      <Box fill pointerEvents="none" style={gradient(TILE_VIGNETTE)} />
    </Box>
  );
}
