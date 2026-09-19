import { useFrame } from '@react-three/fiber';
import type { ReactNode, RefObject } from 'react';
import type { Group } from 'three';
import { advance, type Motion, restless, START_YAW, TILT, type Tour } from './motion';

const MAX_FRAME_SECONDS = 0.1;

export interface RotatingProps {
  group: RefObject<Group | null>;
  motion: RefObject<Motion>;
  /** Radians per second once nobody is touching it and there is no tour; 0
   * for a reader who asked for less motion, which also stops the tour. */
  rest: number;
  /** The loop the globe travels when left alone, or null to spin in place. */
  tour: Tour | null;
  children: ReactNode;
}

export function Rotating({ group, motion, rest, tour, children }: Readonly<RotatingProps>) {
  useFrame((state, delta) => {
    const current = motion.current;
    advance(current, Math.min(delta, MAX_FRAME_SECONDS), rest, tour);
    group.current?.rotation.set(current.pitch, current.yaw, 0);
    if (state.frameloop === 'demand' && restless(current)) state.invalidate();
  });

  return (
    <group ref={group} rotation={[TILT, START_YAW, 0]}>
      {children}
    </group>
  );
}
