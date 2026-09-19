import { describe, expect, it } from 'vitest';
import { targetName } from './target-name';

describe('targetName', () => {
  it('names the operating system and the C library where that matters', () => {
    expect(targetName('linux-musl')).toBe('Linux (musl)');
    expect(targetName('linux-gnu')).toBe('Linux (glibc)');
    expect(targetName('darwin')).toBe('macOS');
    expect(targetName('windows-msvc')).toBe('Windows');
  });

  it('passes through what it cannot place, including what an older collector sent', () => {
    expect(targetName('unknown-linux-musl')).toBe('unknown-linux-musl');
    expect(targetName('constructor')).toBe('constructor');
    expect(targetName('')).toBe('');
  });
});
