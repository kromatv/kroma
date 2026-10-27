import type { AccelerometerMeasurement } from 'expo-sensors';

export type PhysicalOrientation = 'portrait' | 'landscape';

export function physicalOrientation({
  x,
  y,
  z,
}: Pick<AccelerometerMeasurement, 'x' | 'y' | 'z'>): PhysicalOrientation | null {
  const horizontal = Math.abs(x);
  const vertical = Math.abs(y);
  const magnitude = Math.hypot(x, y, z);
  if (magnitude < 0.65 || magnitude > 1.35 || Math.abs(z) > 0.82) return null;
  if (horizontal >= 0.65 && horizontal > vertical + 0.18) return 'landscape';
  if (vertical >= 0.65 && vertical > horizontal + 0.18) return 'portrait';
  return null;
}
