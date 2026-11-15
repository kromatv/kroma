import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CROP_IDENTITY,
  type CropBounds,
  type CropTransform,
  clampTransform,
  type PixelSize,
  turn,
  zoomTo,
} from '#ui/lib/crop-geometry';
import { cropImage } from '#ui/lib/crop-image';
import type { CropOutput } from '#ui/lib/crop-image-types';
import { imageSize } from '#ui/lib/image-size';
import { safeImageUrl } from '#ui/lib/safe-image-url';
import { useControllable } from '#ui/lib/use-controllable';
import { CropperContext, type CropperShape, type CropperState } from './cropper-context';
import { Frame } from './cropper-frame';
import { Reset, Rotate, Zoom } from './cropper-tools';

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
  /** Hears the transform already clamped to the image and the zoom range. */
  onValueChange?: (next: CropTransform) => void;
  children?: ReactNode;
}

interface Measured {
  src: string;
  size: PixelSize;
}

function sameTransform(a: CropTransform, b: CropTransform): boolean {
  return a.zoom === b.zoom && a.x === b.x && a.y === b.y && a.rotation === b.rotation;
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
  const [measured, setMeasured] = useState<Measured | null>(null);
  const image = measured?.src === src ? measured.size : null;
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

  const bounds = useMemo<CropBounds>(
    () => ({ aspect, minZoom, maxZoom }),
    [aspect, minZoom, maxZoom],
  );
  const covering = useMemo<PixelSize>(() => image ?? { width: aspect, height: 1 }, [image, aspect]);

  const [raw, setRaw] = useControllable(value, defaultValue, onValueChange);
  const transform = useMemo(() => clampTransform(covering, raw, bounds), [covering, raw, bounds]);

  const latest = useRef(transform);
  useLayoutEffect(() => {
    latest.current = transform;
  });

  const setTransform = useCallback(
    (next: CropTransform) => {
      const clamped = clampTransform(covering, next, bounds);
      if (sameTransform(clamped, latest.current)) {
        return;
      }
      latest.current = clamped;
      setRaw(clamped);
    },
    [covering, bounds, setRaw],
  );

  const actions = useMemo(
    () => ({
      setTransform,
      panBy: (x: number, y: number) =>
        setTransform({ ...latest.current, x: latest.current.x + x, y: latest.current.y + y }),
      zoomBy: (delta: number) =>
        setTransform(zoomTo(latest.current, latest.current.zoom + delta, bounds)),
      rotate: (direction: 'left' | 'right') =>
        setTransform({ ...latest.current, rotation: turn(latest.current.rotation, direction) }),
      reset: () => setTransform(CROP_IDENTITY),
      crop: (output?: CropOutput) =>
        src ? cropImage({ src, transform: latest.current, aspect }, output) : Promise.resolve(null),
    }),
    [setTransform, bounds, src, aspect],
  );

  const state = useMemo<CropperState>(
    () => ({ src, image, transform, aspect, shape, minZoom, maxZoom, ...actions }),
    [src, image, transform, aspect, shape, minZoom, maxZoom, actions],
  );

  return <CropperContext.Provider value={state}>{children}</CropperContext.Provider>;
}

/**
 * Frames a picture before it is kept: drag it, zoom it, turn it by quarters,
 * then ask `useCropper().crop()` for the file. The frame is one D-pad stop;
 * pressed, it takes the arrow keys to pan and plus and minus to zoom.
 */
const Cropper = { Root, Frame, Zoom, Rotate, Reset };

export type { CropperRootProps };
export { Cropper };
