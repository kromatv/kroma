/** Quarter turns only: every pixel stays on the grid. */
export type CropRotation = 0 | 90 | 180 | 270;

/**
 * Where an image sits behind its crop frame. `zoom` 1 is the smallest scale at
 * which the image still covers the frame; `x` and `y` offset the image's centre
 * from the frame's as fractions of the frame's width and height (right and down
 * are positive), so one transform draws the same crop at any size.
 */
export interface CropTransform {
  zoom: number;
  x: number;
  y: number;
  rotation: CropRotation;
}

export interface PixelSize {
  width: number;
  height: number;
}

/** What a transform is kept within. `aspect` is the frame's width over its height. */
export interface CropBounds {
  aspect: number;
  minZoom: number;
  maxZoom: number;
}

/** A box in fractions of the frame: `left` 0.5 is half the frame's width. */
export interface CropPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const CROP_IDENTITY: CropTransform = { zoom: 1, x: 0, y: 0, rotation: 0 };

/** The image's size once turned: a quarter turn swaps its sides. */
export function turnedSize(image: PixelSize, rotation: CropRotation): PixelSize {
  return rotation % 180 === 0 ? image : { width: image.height, height: image.width };
}

/** Frame pixels per image pixel at zoom 1, where the turned image just covers the frame. */
export function coverScale(image: PixelSize, rotation: CropRotation, frame: PixelSize): number {
  const turned = turnedSize(image, rotation);
  return Math.max(frame.width / turned.width, frame.height / turned.height);
}

const CLOCKWISE: Record<CropRotation, CropRotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };
const COUNTERCLOCKWISE: Record<CropRotation, CropRotation> = { 0: 270, 90: 0, 180: 90, 270: 180 };

/** The next quarter turn, as the viewer sees it. */
export function turn(rotation: CropRotation, direction: 'left' | 'right'): CropRotation {
  return (direction === 'right' ? CLOCKWISE : COUNTERCLOCKWISE)[rotation];
}

function within(value: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
}

function clampZoom(zoom: number, bounds: CropBounds): number {
  return Math.min(Math.max(zoom, bounds.minZoom, 1), Math.max(bounds.maxZoom, 1));
}

/**
 * The transform brought back within bounds: a zoom inside the range and never
 * under 1, and offsets small enough that no edge of the image comes inside the
 * frame.
 */
export function clampTransform(
  image: PixelSize,
  transform: CropTransform,
  bounds: CropBounds,
): CropTransform {
  const zoom = clampZoom(transform.zoom, bounds);
  const frame = { width: bounds.aspect, height: 1 };
  const turned = turnedSize(image, transform.rotation);
  const scale = coverScale(image, transform.rotation, frame) * zoom;
  const maxX = Math.max(0, (turned.width * scale) / frame.width - 1) / 2;
  const maxY = Math.max(0, (turned.height * scale) / frame.height - 1) / 2;
  return { ...transform, zoom, x: within(transform.x, maxX), y: within(transform.y, maxY) };
}

/** The transform at another zoom, scaled about the frame's centre so what is in the middle stays there. */
export function zoomTo(transform: CropTransform, zoom: number, bounds: CropBounds): CropTransform {
  const next = clampZoom(zoom, bounds);
  const ratio = next / clampZoom(transform.zoom, bounds);
  return { ...transform, zoom: next, x: transform.x * ratio, y: transform.y * ratio };
}

/** The image's unturned box behind the frame; a quarter turn then spins it about its own centre. */
export function placeImage(
  image: PixelSize,
  transform: CropTransform,
  aspect: number,
): CropPlacement {
  const scale =
    coverScale(image, transform.rotation, { width: aspect, height: 1 }) * transform.zoom;
  const width = (image.width * scale) / aspect;
  const height = image.height * scale;
  return {
    left: 0.5 + transform.x - width / 2,
    top: 0.5 + transform.y - height / 2,
    width,
    height,
  };
}

/** How many image pixels the frame spans at this zoom: the output size that neither upscales nor wastes detail. */
export function naturalCropSize(
  image: PixelSize,
  transform: CropTransform,
  aspect: number,
): PixelSize {
  const scale =
    coverScale(image, transform.rotation, { width: aspect, height: 1 }) * transform.zoom;
  return {
    width: Math.max(1, Math.round(aspect / scale)),
    height: Math.max(1, Math.round(1 / scale)),
  };
}

function side(length: number): number {
  return Math.max(1, Math.round(length));
}

/** The output size asked for: both sides as given, one side with the other from `aspect`, or neither for `natural`. */
export function outputSize(
  requested: Partial<PixelSize>,
  natural: PixelSize,
  aspect: number,
): PixelSize {
  const { width, height } = requested;
  if (width !== undefined && height !== undefined)
    return { width: side(width), height: side(height) };
  if (width !== undefined) return { width: side(width), height: side(width / aspect) };
  if (height !== undefined) return { width: side(height * aspect), height: side(height) };
  return natural;
}
