import { describe, expect, it } from 'vitest';
import { isSupportedPython, pickPython } from './python';

describe('isSupportedPython', () => {
  it('accepts 3.11 and anything newer', () => {
    expect(isSupportedPython('3.11.0')).toBe(true);
    expect(isSupportedPython('3.13.13')).toBe(true);
    expect(isSupportedPython('4.0.1')).toBe(true);
  });

  it('refuses 3.10 and anything older', () => {
    expect(isSupportedPython('3.10.10')).toBe(false);
    expect(isSupportedPython('2.7.18')).toBe(false);
  });

  it('refuses a version it cannot read', () => {
    expect(isSupportedPython('')).toBe(false);
    expect(isSupportedPython('three')).toBe(false);
    expect(isSupportedPython('3')).toBe(false);
  });
});

describe('pickPython', () => {
  it('takes the first interpreter that is new enough, not the first one found', () => {
    const python = pickPython([
      { command: 'python3', version: '3.10.10' },
      { command: 'python3.13', version: '3.13.13' },
      { command: 'python3.12', version: '3.12.4' },
    ]);

    expect(python).toBe('python3.13');
  });

  it('says what it found when nothing is new enough', () => {
    const probes = [
      { command: 'python3', version: '3.10.10' },
      { command: 'python3.13', version: undefined },
    ];

    expect(() => pickPython(probes)).toThrow(/need Python 3\.11 or newer/);
    expect(() => pickPython(probes)).toThrow(/python3: 3\.10\.10/);
    expect(() => pickPython(probes)).toThrow(/python3\.13: not found/);
    expect(() => pickPython(probes)).toThrow(/quality:setup/);
  });
});
