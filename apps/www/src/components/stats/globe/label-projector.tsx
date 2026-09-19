import { useFrame } from '@react-three/fiber';
import { type RefObject, useState } from 'react';
import { type Group, Vector3 } from 'three';
import { type LabelNode, STEM_PX } from './labels';
import type { PlacedPin } from './model';

const FADE_TO = 0.12;
const GAP_PX = 4;
const EDGE_PX = 2;
const MAX_STACK = 8;

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Placement {
  rect: Rect;
  below: boolean;
}

function fade(facing: number): number {
  const t = Math.min(1, Math.max(0, facing / FADE_TO));
  return t * t * (3 - 2 * t);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectAt(label: LabelNode, x: number, top: number): Rect {
  return { left: x - label.width / 2, right: x + label.width / 2, top, bottom: top + label.height };
}

// Climb on a longer stem past every pill already placed, until clear of them.
function above(label: LabelNode, x: number, y: number, placed: readonly Rect[]): Rect {
  let rect = rectAt(label, x, y - STEM_PX - label.height);
  for (let attempt = 0; attempt < MAX_STACK; attempt++) {
    const blocking = placed.find((other) => overlaps(rect, other));
    if (!blocking) break;
    rect = rectAt(label, x, blocking.top - GAP_PX - label.height);
  }
  return rect;
}

function below(label: LabelNode, x: number, y: number, placed: readonly Rect[]): Rect {
  let rect = rectAt(label, x, y + STEM_PX);
  for (let attempt = 0; attempt < MAX_STACK; attempt++) {
    const blocking = placed.find((other) => overlaps(rect, other));
    if (!blocking) break;
    rect = rectAt(label, x, blocking.bottom + GAP_PX);
  }
  return rect;
}

// A pill hangs above its pin unless the stack would leave the top of the
// canvas, in which case it hangs below instead: a label is never clipped.
function place(label: LabelNode, x: number, y: number, placed: readonly Rect[]): Placement {
  const up = above(label, x, y, placed);
  if (up.top >= 0) return { rect: up, below: false };
  return { rect: below(label, x, y, placed), below: true };
}

export interface LabelProjectorProps {
  pins: readonly PlacedPin[];
  nodes: RefObject<Map<string, LabelNode>>;
  group: RefObject<Group | null>;
}

/**
 * Every frame, moves each label's DOM node over its pin, keeps it inside the
 * canvas and clear of the other labels, and fades it only as the pin slips over
 * the horizon. Writes styles directly: nothing here goes through React, which
 * is what keeps it at a few writes per label per frame.
 */
export function LabelProjector({ pins, nodes, group }: Readonly<LabelProjectorProps>) {
  const [scratch] = useState(() => ({
    world: new Vector3(),
    normal: new Vector3(),
    toCamera: new Vector3(),
  }));

  useFrame(({ camera, size }) => {
    const globe = group.current;
    if (!globe) return;
    globe.updateMatrixWorld();
    const placed: Rect[] = [];
    for (const pin of pins) {
      const label = nodes.current.get(pin.code);
      if (!label) continue;
      const { world, normal, toCamera } = scratch;
      globe.localToWorld(world.set(pin.position[0], pin.position[1], pin.position[2]));
      normal.copy(world).normalize();
      toCamera.copy(camera.position).sub(world).normalize();
      const facing = normal.dot(toCamera);
      if (facing <= 0) {
        label.node.style.visibility = 'hidden';
        continue;
      }
      world.project(camera);
      const x = (world.x * 0.5 + 0.5) * size.width;
      const y = (0.5 - world.y * 0.5) * size.height;
      const half = label.width / 2 + EDGE_PX;
      const inside = Math.min(size.width - half, Math.max(half, x));
      const { rect, below: hangs } = place(label, inside, y, placed);
      placed.push(rect);
      label.node.style.flexDirection = hangs ? 'column-reverse' : 'column';
      label.node.style.transform = `translate(-50%, ${hangs ? '0' : '-100%'}) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      label.pill.style.transform = `translateX(${(inside - x).toFixed(1)}px)`;
      label.stem.style.height = `${(hangs ? rect.top - y : y - rect.bottom).toFixed(1)}px`;
      label.node.style.opacity = fade(facing).toFixed(3);
      label.node.style.visibility = 'visible';
    }
  });

  return null;
}
