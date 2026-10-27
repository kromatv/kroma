import { Accelerometer, type AccelerometerMeasurement } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { physicalOrientation, type PhysicalOrientation } from './physical-orientation';

const SAMPLE_INTERVAL_MS = 100;
const STABLE_SAMPLES = 3;

export function usePhysicalOrientation(enabled = true) {
  const [available, setAvailable] = useState<boolean | null>(enabled ? null : false);
  const [orientation, setOrientation] = useState<PhysicalOrientation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let subscription: { remove(): void } | undefined;
    let candidate: PhysicalOrientation | null = null;
    let consecutive = 0;
    let last: PhysicalOrientation | null = null;
    const sample = (measurement: AccelerometerMeasurement) => {
      if (!active) return;
      const next = physicalOrientation(measurement);
      consecutive = next !== null && next === candidate ? consecutive + 1 : 1;
      candidate = next;
      if (next === null || next === last || consecutive < STABLE_SAMPLES) return;
      last = next;
      setOrientation(next);
    };
    void Accelerometer.isAvailableAsync()
      .then((supported) => {
        if (!active) return;
        setAvailable(supported);
        if (!supported) return;
        Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
        subscription = Accelerometer.addListener(sample);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled]);
  return { available, orientation };
}
