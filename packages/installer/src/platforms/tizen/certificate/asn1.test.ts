import { describe, expect, it } from 'vitest';
import { integer } from './asn1';

const hex = (bytes: Buffer) => bytes.toString('hex');

describe('integer', () => {
  it('drops the leading zero a random serial can start with', () => {
    expect(hex(integer(Buffer.from([0x00, 0x01, 0x02])))).toBe('02020102');
  });

  it('keeps one zero in front of a byte whose top bit would read as negative', () => {
    expect(hex(integer(Buffer.from([0x00, 0x00, 0x80])))).toBe('02020080');
    expect(hex(integer(Buffer.from([0x80])))).toBe('02020080');
  });

  it('encodes zero as a single zero byte, however it was spelled', () => {
    expect(hex(integer(Buffer.from([0x00, 0x00])))).toBe('020100');
    expect(hex(integer(Buffer.alloc(0)))).toBe('020100');
  });

  it('leaves a minimal value alone', () => {
    expect(hex(integer(2))).toBe('020102');
    expect(hex(integer(Buffer.from([0x7f, 0xff])))).toBe('02027fff');
  });
});
