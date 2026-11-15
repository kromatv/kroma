import { describe, expect, it } from 'vitest';
import { PairingCipher } from './cipher';

const material = Buffer.alloc(64, 7);

describe('PairingCipher', () => {
  it('opens what the other side sealed with the same key material', () => {
    const ours = new PairingCipher(material);
    const theirs = new PairingCipher(material);

    const sealed = ours.seal(Buffer.from('adb-FAKE'));

    expect(sealed).toHaveLength(8 + 16);
    expect(theirs.open(sealed)?.toString()).toBe('adb-FAKE');
  });

  it('counts the messages of each direction on their own', () => {
    const ours = new PairingCipher(material);
    const theirs = new PairingCipher(material);

    const first = ours.seal(Buffer.from('one'));
    const second = ours.seal(Buffer.from('one'));
    const answer = theirs.seal(Buffer.from('one'));

    expect(second).not.toEqual(first);
    expect(answer).toEqual(first);
    expect(theirs.open(first)?.toString()).toBe('one');
    expect(theirs.open(second)?.toString()).toBe('one');
  });

  it('opens nothing sealed from other key material', () => {
    const sealed = new PairingCipher(Buffer.alloc(64, 8)).seal(Buffer.from('adb-FAKE'));

    expect(new PairingCipher(material).open(sealed)).toBeNull();
  });

  it('opens nothing out of bytes that were tampered with, or too few to be sealed', () => {
    const sealed = new PairingCipher(material).seal(Buffer.from('adb-FAKE'));
    sealed[0] = (sealed[0] ?? 0) ^ 1;

    expect(new PairingCipher(material).open(sealed)).toBeNull();
    expect(new PairingCipher(material).open(Buffer.alloc(4))).toBeNull();
  });

  it('still opens the next message after one it could not open', () => {
    const ours = new PairingCipher(material);
    const theirs = new PairingCipher(material);

    theirs.open(Buffer.alloc(32));

    expect(theirs.open(ours.seal(Buffer.from('first')))?.toString()).toBe('first');
  });
});
