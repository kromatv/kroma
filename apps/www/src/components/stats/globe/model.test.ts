import { describe, expect, it } from 'vitest';
import { PIN_ALTITUDE, SPHERE_RADIUS } from './model';

describe('the globe shell', () => {
  it('sits under the dots and over nothing, so the far side stays hidden', () => {
    expect(SPHERE_RADIUS).toBeLessThan(1);
    expect(PIN_ALTITUDE).toBeGreaterThan(1);
  });
});
