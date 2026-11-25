import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type ChangeDetails, useControl } from '#ui/lib/control';
import {
  CROP_IDENTITY,
  type CropBounds,
  type CropTransform,
  clampTransform,
  type PixelSize,
} from '#ui/lib/crop-geometry';
import { cropImage } from '#ui/lib/crop-image';
import type { CropOutput } from '#ui/lib/crop-image-types';
import { imageSize } from '#ui/lib/image-size';
import { safeImageUrl } from '#ui/lib/safe-image-url';
import { CropperContext, type CropperShape, type CropperState } from './cropper-context.hook';
import { type CropperReason, cropperControl } from './cropper-control';
import { Frame } from './cropper-frame.component';
import { Reset, Rotate, Zoom } from './cropper-tools.component';

interface CropperRootProps {
  /** The picture to frame. A new one keeps the transform: key the Root by its image to start over. */
  src: string | null;
  /** The frame's width over its height, 1 by default. */
  aspect?: number;
  /** `circle` dims everything outside the largest circle in the frame; the crop itself stays the whole frame. */
  shape?: CropperShape;
  /** 1 by default, and never under it: below 1 the image stops covering the frame. */
  minZoom?: number;
  /** 3 by default. */
  maxZoom?: number;
  /** Present: you own the transform (controlled). */
  value?: CropTransform;
  /** The transform to open on, the image centred and just covering by default. */
  defaultValue?: CropTransform;
  /** Hears a gesture's transform already clamped to the image and the zoom
   *  range; `details.cancel()` keeps the picture where it was. */
  onValueChange?: (next: CropTransform, details: ChangeDetails<CropperReason>) => void;
  children?: ReactNode;
}

interface Measured {
  src: string;
  size: PixelSize;
}

function useImageSize(src: string | null): PixelSize | null {
  const [measured, setMeasured] = useState<Measured | null>(null);
  useEffect(() => {
    if (!src) {
      return undefined;
    }
    let current = true;
    void imageSize(src).then((size) => {
      if (current && size) {
        setMeasured({ src, size });
      }
    });
    return () => {
      current = false;
    };
  }, [src]);
  return measured?.src === src ? measured.size : null;
}

/**
 * Holds a picture and where it sits behind its frame.
 *
 * ```tsx
 * <Cropper.Root src={photo} shape="circle">
 *   <Cropper.Frame label="Move the photo" />
 *   <Cropper.Zoom outLabel="Zoom out" inLabel="Zoom in" />
 *   <Cropper.Rotate label="Turn left" />
 *   <Cropper.Reset label="Start over" />
 * </Cropper.Root>
 * ```
 */
function Root({
  src: requested,
  aspect = 1,
  shape = 'rect',
  minZoom = 1,
  maxZoom = 3,
  value,
  defaultValue = CROP_IDENTITY,
  onValueChange,
  children,
}: Readonly<CropperRootProps>) {
  const src = safeImageUrl(requested);
  const image = useImageSize(src);

  const bounds = useMemo<CropBounds>(
    () => ({ aspect, minZoom, maxZoom }),
    [aspect, minZoom, maxZoom],
  );
  const covering = useMemo<PixelSize>(() => image ?? { width: aspect, height: 1 }, [image, aspect]);

  const [{ value: raw, setTransform, panBy, zoomBy, rotate, reset }] = useControl(cropperControl, {
    value,
    defaultValue,
    onValueChange,
    covering,
    ...bounds,
    disabled: src === null,
  });
  const transform = useMemo(() => clampTransform(covering, raw, bounds), [covering, raw, bounds]);

  const state = useMemo<CropperState>(
    () => ({
      src,
      image,
      transform,
      aspect,
      shape,
      minZoom,
      maxZoom,
      setTransform,
      panBy,
      zoomBy,
      rotate,
      reset,
      crop: (output?: CropOutput) =>
        src ? cropImage({ src, transform, aspect }, output) : Promise.resolve(null),
    }),
    [
      src,
      image,
      transform,
      aspect,
      shape,
      minZoom,
      maxZoom,
      setTransform,
      panBy,
      zoomBy,
      rotate,
      reset,
    ],
  );

  return <CropperContext value={state}>{children}</CropperContext>;
}

/**
 * Frames a picture before it is kept: drag it, zoom it, turn it by quarters,
 * then ask `useCropper().crop()` for the file. The frame is one D-pad stop;
 * pressed, it takes the arrow keys to pan and plus and minus to zoom.
 */
const Cropper = { Root, Frame, Zoom, Rotate, Reset };

export type { CropperRootProps };
export { Cropper };
