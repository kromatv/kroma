// The scrub-bar preview thumbnail.
//
// A storyboard is ONE sprite sheet of evenly spaced frames, so a thumbnail is a
// window onto it: draw the sheet, slide it so the frame you want lands in the
// window, and clip everything else.
//
// A browser writes that as `background-position` on a fixed-size box, which is
// what this used to be, and it drew nothing on Apple TV: React Native's
// `experimental_backgroundImage` takes gradients, not `url()`. An offset child
// inside an `overflow: hidden` parent is the same picture and both platforms
// draw it, so there is one component here instead of a `.web` pair.

import { Image } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { gradient } from '#ui/lib/css';
import type { StoryboardTile } from '#ui/services/storyboard';

const TILE_SHADOW = { boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)' };
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
      style={TILE_SHADOW}
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
          // The sheet's OWN size, then scaled as a layer. Asking the image view
          // for `sheetWidth * scale` instead makes the decoder produce that many
          // points, which at 2x on a television is a texture past the GPU's
          // limit: nothing is drawn, and the preview is a black rectangle with
          // no error anywhere. Scaling the layer costs the GPU nothing.
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
