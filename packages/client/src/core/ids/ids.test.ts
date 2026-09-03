import { describe, expect, it } from 'vitest';
import { brandedId, DeviceId } from './ids';

const ProbeId = brandedId('ProbeId');

describe('branded ids', () => {
  it('parses a raw string and returns it unchanged (the brand is compile-time)', () => {
    expect(ProbeId.parse('p_123')).toBe('p_123');
  });

  it('rejects non-string input', () => {
    expect(ProbeId.safeParse(42).success).toBe(false);
    expect(ProbeId.safeParse(null).success).toBe(false);
  });

  it('rejects an empty id rather than carrying it into a URL', () => {
    expect(ProbeId.safeParse('').success).toBe(false);
    expect(ProbeId.parse('anything at all')).toBe('anything at all');
  });

  it('holds a device id to the shape the server demands of one', () => {
    expect(DeviceId.parse('tv-salon-01')).toBe('tv-salon-01');
    expect(DeviceId.safeParse('short').success).toBe(false);
    expect(DeviceId.safeParse('y'.repeat(65)).success).toBe(false);
    expect(DeviceId.safeParse('../escape').success).toBe(false);
  });
});
