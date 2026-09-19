import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { toVector } from '#site/lib/geo';
import type { Ground } from '#site/lib/ground';
import { LabelProjector } from './label-projector';
import { type LabelNode, Labels } from './labels';
import { LandDots } from './land-dots';
import { type GlobePin, PIN_ALTITUDE, type PlacedPin } from './model';
import { initialMotion, REST_SPIN, tourOf } from './motion';
import { globePalette } from './palette';
import { Pins } from './pins';
import { Rotating } from './rotating';
import { Sphere } from './sphere';
import { useDrag } from './use-drag';
import { useReducedMotion } from './use-reduced-motion';
import { useVisible } from './use-visible';

export interface GlobeProps {
  pins: readonly GlobePin[];
  ground: Ground;
  /** What a screen reader is told the picture is. */
  label: string;
}

// Far enough back that the ball spans 86% of the canvas, which leaves room for
// a label above a pin near the top.
const CAMERA = { position: [0, 0, 3.7] as [number, number, number], fov: 35 };

// Every country gets a pin; only the heaviest get a pill, or a full map reads
// as a wall of names. The collector sorts them heaviest first.
const MAX_LABELS = 12;

function place(pins: readonly GlobePin[]): PlacedPin[] {
  return pins.map((pin) => ({ ...pin, position: toVector(pin.lat, pin.lng, PIN_ALTITUDE) }));
}

function frameloopFor(visible: boolean, reduced: boolean): 'always' | 'demand' | 'never' {
  if (!visible) return 'never';
  return reduced ? 'demand' : 'always';
}

export function Globe({ pins, ground, label }: Readonly<GlobeProps>) {
  const wrapper = useRef<HTMLDivElement>(null);
  const group = useRef<Group>(null);
  const nodes = useRef(new Map<string, LabelNode>());
  const motion = useRef(initialMotion());
  const invalidate = useRef<() => void>(() => {});
  const reduced = useReducedMotion();
  const visible = useVisible(wrapper);
  const { handlers, dragging } = useDrag(motion, () => invalidate.current());
  const palette = globePalette(ground);
  const placed = place(pins);
  const labelled = placed.slice(0, MAX_LABELS);
  const tour = tourOf(placed);

  return (
    <div
      ref={wrapper}
      role="img"
      aria-label={label}
      className={`relative aspect-square w-full touch-pan-y select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      {...handlers}
    >
      {ground === 'light' && (
        <div
          aria-hidden
          className="absolute inset-[7%] rounded-full shadow-[0_32px_70px_-24px_color-mix(in_srgb,var(--kroma-tint)_45%,transparent)]"
        />
      )}
      <Canvas
        flat
        dpr={[1, 2]}
        frameloop={frameloopFor(visible, reduced)}
        camera={CAMERA}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={(state) => {
          invalidate.current = state.invalidate;
        }}
      >
        <ambientLight intensity={2.8} />
        <directionalLight position={[-4, 5, 6]} intensity={0.9} />
        <Rotating group={group} motion={motion} rest={reduced ? 0 : REST_SPIN} tour={tour}>
          <Sphere color={palette.sphere} />
          <LandDots color={palette.dots} />
          <Pins pins={placed} color={palette.pin} pulse={!reduced} />
        </Rotating>
        <LabelProjector pins={labelled} nodes={nodes} group={group} />
      </Canvas>
      <Labels pins={labelled} nodes={nodes} />
    </div>
  );
}
