import {
  type CropTransform,
  coverScale,
  naturalCropSize,
  outputSize,
  type PixelSize,
} from './crop-geometry';
import type { CropOutput, CropSource } from './crop-image-types';
import { webDocument } from './dom';

const DEFAULT_TYPE = 'image/webp';
const DEFAULT_QUALITY = 0.9;
const OTHER_ORIGIN = /^https?:/i;

function decoded(doc: Document, src: string): Promise<HTMLImageElement | null> {
  const image = doc.createElement('img');
  if (OTHER_ORIGIN.test(src)) {
    image.crossOrigin = 'anonymous';
  }
  return new Promise((resolve) => {
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function paint(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  transform: CropTransform,
  size: PixelSize,
): void {
  const { naturalWidth: width, naturalHeight: height } = image;
  const scale = coverScale({ width, height }, transform.rotation, size) * transform.zoom;
  context.imageSmoothingQuality = 'high';
  context.translate(
    size.width / 2 + transform.x * size.width,
    size.height / 2 + transform.y * size.height,
  );
  context.rotate((transform.rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(image, -width / 2, -height / 2, width, height);
}

function encoded(canvas: HTMLCanvasElement, output: CropOutput): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, output.type ?? DEFAULT_TYPE, output.quality ?? DEFAULT_QUALITY);
    } catch {
      resolve(null);
    }
  });
}

/** The crop as an encoded file. Null when the image cannot be decoded, drawn or read back. */
export async function cropImage(crop: CropSource, output: CropOutput = {}): Promise<Blob | null> {
  const doc = webDocument();
  if (!doc) {
    return null;
  }
  const image = await decoded(doc, crop.src);
  if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return null;
  }
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  const size = outputSize(
    output,
    naturalCropSize(natural, crop.transform, crop.aspect),
    crop.aspect,
  );
  const canvas = doc.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  paint(context, image, crop.transform, size);
  return encoded(canvas, output);
}
