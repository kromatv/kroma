import { describe, expect, it } from 'vitest';
import { mb, platformLabel, shortHash } from './ui';

describe('mb', () => {
  it('stays in kilobytes below a megabyte and never rounds down to nothing', () => {
    expect(mb(1024)).toBe('1 KB');
    expect(mb(400)).toBe('1 KB');
    expect(mb(1048575)).toBe('1024 KB');
  });

  it('switches to one decimal of megabytes at a megabyte', () => {
    expect(mb(1048576)).toBe('1.0 MB');
    expect(mb(1572864)).toBe('1.5 MB');
  });

  it('says nothing at all for a size the catalog did not report', () => {
    expect(mb(0)).toBe('');
    expect(mb(null)).toBe('');
    expect(mb(undefined)).toBe('');
  });
});

describe('platformLabel', () => {
  it('names the four published targets the way a reader recognises them', () => {
    expect(platformLabel('aarch64-apple-darwin')).toBe('macOS arm64');
    expect(platformLabel('x86_64-apple-darwin')).toBe('macOS x64');
    expect(platformLabel('aarch64-unknown-linux-musl')).toBe('Linux arm64');
    expect(platformLabel('x86_64-unknown-linux-musl')).toBe('Linux x64');
  });

  it('passes an unmapped triple through rather than hiding it', () => {
    expect(platformLabel('riscv64-unknown-linux-gnu')).toBe('riscv64-unknown-linux-gnu');
  });

  it('calls a module built for no target universal', () => {
    expect(platformLabel(null)).toBe('Universal');
    expect(platformLabel(undefined)).toBe('Universal');
    expect(platformLabel('')).toBe('Universal');
  });
});

describe('shortHash', () => {
  it('keeps the two ends a checksum is compared by', () => {
    const digest = `0123abcd${'f'.repeat(48)}deadbeef`;
    expect(shortHash(digest)).toBe('0123abcd…deadbeef');
  });

  it('leaves anything short enough to read whole alone', () => {
    expect(shortHash('a'.repeat(20))).toBe('a'.repeat(20));
    expect(shortHash('')).toBe('');
  });
});
