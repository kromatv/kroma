import type { CropTransform } from './crop-geometry';

/** The crop to export: the image, where it sits, and the frame's width over its height. */
export interface CropSource {
  src: string;
  transform: CropTransform;
  aspect: number;
}

/**
 * The file a crop is written as. Both sides are taken as given, one side takes
 * the other from the aspect, and neither keeps the image's own resolution.
 * `type` defaults to `image/webp` and `quality` to 0.9; an engine that cannot
 * encode `type` answers with a PNG, so read the blob's own `type`.
 */
export interface CropOutput {
  width?: number;
  height?: number;
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
}
