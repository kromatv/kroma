import { useEffectEvent, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type GestureResponderHandlers,
  PanResponder,
  type PanResponderGestureState,
} from 'react-native';
import { type CropTransform, type PixelSize, zoomTo } from '#ui/lib/crop-geometry';
import { panHandlers } from '#ui/lib/pan-gestures';
import type { CropperState } from './cropper-context';

interface Grip {
  from: CropTransform;
  dx: number;
  dy: number;
  spread: number | null;
}

function fingerSpread(event: GestureResponderEvent): number | null {
  const [first, second] = event.nativeEvent.touches;
  if (!first || !second) return null;
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
}

function gripAt(
  from: CropTransform,
  event: GestureResponderEvent,
  gesture: PanResponderGestureState,
): Grip {
  return { from, dx: gesture.dx, dy: gesture.dy, spread: fingerSpread(event) };
}

interface CropGestures {
  handlers: GestureResponderHandlers | null;
  dragging: boolean;
}

/** A drag pans and two fingers pinch, both measured from where the gesture took hold. */
function useCropGestures(cropper: CropperState, box: PixelSize | null): CropGestures {
  const grip = useRef<Grip | null>(null);
  const [dragging, setDragging] = useState(false);

  const grab = useEffectEvent((event: GestureResponderEvent, gesture: PanResponderGestureState) => {
    grip.current = gripAt(cropper.transform, event, gesture);
    setDragging(true);
  });
  const move = useEffectEvent((event: GestureResponderEvent, gesture: PanResponderGestureState) => {
    const held = grip.current;
    if (!held || !box) return;
    const spread = fingerSpread(event);
    if ((spread === null) !== (held.spread === null)) {
      grip.current = gripAt(cropper.transform, event, gesture);
      return;
    }
    const pinch = spread !== null && held.spread ? spread / held.spread : 1;
    const scaled = zoomTo(held.from, held.from.zoom * pinch, cropper);
    cropper.setTransform({
      ...scaled,
      x: scaled.x + (gesture.dx - held.dx) / box.width,
      y: scaled.y + (gesture.dy - held.dy) / box.height,
    });
  });
  const release = useEffectEvent(() => {
    grip.current = null;
    setDragging(false);
  });

  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event, gesture) => grab(event, gesture),
      onPanResponderMove: (event, gesture) => move(event, gesture),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => release(),
      onPanResponderTerminate: () => release(),
    }),
  );

  return { handlers: panHandlers(pan), dragging };
}

export { useCropGestures };
