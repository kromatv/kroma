import { useContext } from 'react';
import type { CropTransform, PixelSize } from '#ui/lib/crop-geometry';
import type { CropOutput } from '#ui/lib/crop-image-types';
import { partContext } from '#ui/lib/part-context';

/** A rectangle, or the largest circle in it with the rest dimmed. */
type CropperShape = 'rect' | 'circle';

/**
 * What a `<Cropper.Root>` holds. `image` is the picture's own size, null until
 * it has loaded. `setTransform`, `panBy` (fractions of the frame) and `zoomBy`
 * clamp what they are given, so the image always covers the frame. `crop`
 * resolves null where the crop cannot be drawn: off the web, with no image, or
 * with one the browser may not read back.
 */
interface CropperState {
  src: string | null;
  image: PixelSize | null;
  transform: CropTransform;
  aspect: number;
  shape: CropperShape;
  minZoom: number;
  maxZoom: number;
  setTransform: (next: CropTransform) => void;
  panBy: (x: number, y: number) => void;
  zoomBy: (delta: number) => void;
  rotate: (direction: 'left' | 'right') => void;
  reset: () => void;
  crop: (output?: CropOutput) => Promise<Blob | null>;
}

const [CropperContext, useCropperPart] = partContext<CropperState>('Cropper.Root');

/**
 * The cropper's state, for a control of the caller's own inside a
 * `<Cropper.Root>`: a confirm button that calls `crop`, a readout of the zoom.
 * Throws outside one.
 */
function useCropper(): CropperState {
  const state = useContext(CropperContext);
  if (!state) throw new Error('useCropper() must be used inside <Cropper.Root>');
  return state;
}

export type { CropperShape, CropperState };
export { CropperContext, useCropper, useCropperPart };
