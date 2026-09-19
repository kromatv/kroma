import { points } from 'virtual:kroma-land';
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { Color } from 'three';
import { decodeLand } from '#site/lib/geo';

// CSS pixels for a dot facing the camera, on a globe this tall; a smaller globe
// gets proportionally smaller dots so the lattice keeps its spacing.
const DOT_PX = 3.4;
const REFERENCE_HEIGHT = 560;

const VERTEX = /* glsl */ `
uniform float uSize;
varying float vFacing;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec3 normal = normalize(normalMatrix * position);
  vFacing = clamp(dot(normal, normalize(-mvPosition.xyz)), 0.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * mix(0.6, 1.0, vFacing);
}`;

// The colorspace include is what every built-in material ends with; without it
// a raw shader writes linear values into an sRGB canvas and the ink goes dark.
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vFacing;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = 0.96 * (1.0 - smoothstep(0.4, 0.5, d)) * smoothstep(0.0, 0.3, vFacing);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}`;

export function LandDots({ color }: Readonly<{ color: string }>) {
  const [positions] = useState(() => decodeLand(points));
  const [uniforms] = useState(() => ({
    uColor: { value: new Color(color) },
    uSize: { value: DOT_PX },
  }));
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    uniforms.uColor.value.set(color);
    const scale = Math.min(1.2, Math.max(0.6, height / REFERENCE_HEIGHT));
    uniforms.uSize.value = DOT_PX * dpr * scale;
    invalidate();
  }, [color, dpr, height, uniforms, invalidate]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
      />
    </points>
  );
}
