import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import {
  Color,
  type Mesh,
  type MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { PlacedPin } from './model';

const DOT_RADIUS = 0.012;
const HALO_RADIUS = 3.4;
const HALO_STRENGTH = 0.45;
const RING_INNER = 1;
const RING_OUTER = 1.14;
const RING_REACH = 4.2;
const RING_OPACITY = 0.75;
const PULSE_SECONDS = 3.2;
const STILL_RING = 0.45;
const GOLDEN = 0.618;

const OUTWARD = new Vector3(0, 0, 1);

const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float alpha = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uStrength;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}`;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export interface PinsProps {
  pins: readonly PlacedPin[];
  color: string;
  pulse: boolean;
}

export function Pins({ pins, color, pulse }: Readonly<PinsProps>) {
  const [halo] = useState(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color(color) }, uStrength: { value: HALO_STRENGTH } },
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
  );

  useEffect(() => {
    halo.uniforms.uColor?.value.set(color);
  }, [color, halo]);

  return (
    <>
      {pins.map((pin, i) => (
        <Pin
          key={pin.code}
          pin={pin}
          color={color}
          halo={halo}
          pulse={pulse}
          phase={(i * GOLDEN) % 1}
        />
      ))}
    </>
  );
}

interface PinProps {
  pin: PlacedPin;
  color: string;
  halo: ShaderMaterial;
  pulse: boolean;
  phase: number;
}

interface Ring {
  mesh: Mesh | null;
  material: MeshBasicMaterial | null;
}

function pose(ring: Ring, t: number): void {
  if (!ring.mesh || !ring.material) return;
  ring.mesh.scale.setScalar(1 + easeOut(t) * (RING_REACH - 1));
  ring.material.opacity = (1 - t) ** 1.6 * RING_OPACITY;
}

// Two sonar rings half a cycle apart: one is always mid-flight, so a pin never
// goes quiet between pulses.
function Pin({ pin, color, halo, pulse, phase }: Readonly<PinProps>) {
  const first = useRef<Ring>({ mesh: null, material: null });
  const second = useRef<Ring>({ mesh: null, material: null });
  const [facing] = useState(() =>
    new Quaternion().setFromUnitVectors(OUTWARD, new Vector3(...pin.position).normalize()),
  );

  useFrame(({ clock }) => {
    const t = pulse ? (clock.elapsedTime / PULSE_SECONDS + phase) % 1 : STILL_RING;
    pose(first.current, t);
    pose(second.current, pulse ? (t + 0.5) % 1 : 1);
  });

  const radius = DOT_RADIUS + Math.min(0.01, 0.0015 * Math.log2(pin.n));

  return (
    <group position={pin.position} quaternion={facing}>
      <mesh material={halo}>
        <circleGeometry args={[radius * HALO_RADIUS, 40]} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh
        ref={(mesh) => {
          first.current.mesh = mesh;
        }}
      >
        <ringGeometry args={[radius * RING_INNER, radius * RING_OUTER, 48]} />
        <meshBasicMaterial
          ref={(material) => {
            first.current.material = material;
          }}
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={(mesh) => {
          second.current.mesh = mesh;
        }}
      >
        <ringGeometry args={[radius * RING_INNER, radius * RING_OUTER, 48]} />
        <meshBasicMaterial
          ref={(material) => {
            second.current.material = material;
          }}
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
