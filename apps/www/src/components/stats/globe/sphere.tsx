import { SPHERE_RADIUS } from './model';

export function Sphere({ color }: Readonly<{ color: string }>) {
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 64, 48]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
    </mesh>
  );
}
