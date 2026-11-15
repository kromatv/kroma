import type { CropOutput, CropSource } from './crop-image-types';

/** The crop as an encoded file. Null off the web, where there is no canvas to draw it on. */
export function cropImage(_crop: CropSource, _output: CropOutput = {}): Promise<Blob | null> {
  return Promise.resolve(null);
}
