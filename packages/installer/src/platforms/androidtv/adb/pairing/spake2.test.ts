import { describe, expect, it } from 'vitest';
import { Spake2 } from './spake2';

const client = { mine: Buffer.from('adb pair client\0'), theirs: Buffer.from('adb pair server\0') };
const server = { mine: client.theirs, theirs: client.mine };
const code = Buffer.from('701965');

describe('Spake2', () => {
  it('gives both sides the same 64-byte key when they hold the same password', () => {
    const alice = new Spake2('alice', client, code);
    const bob = new Spake2('bob', server, code);

    const key = alice.key(bob.message);

    expect(key).toHaveLength(64);
    expect(bob.key(alice.message)).toEqual(key);
  });

  it('gives the two sides different keys when their passwords differ', () => {
    const alice = new Spake2('alice', client, code);
    const bob = new Spake2('bob', server, Buffer.from('701966'));

    expect(alice.key(bob.message)).not.toEqual(bob.key(alice.message));
  });

  it('gives the two sides different keys when they disagree on who they are', () => {
    const alice = new Spake2('alice', client, code);
    const bob = new Spake2('bob', { mine: Buffer.from('someone else'), theirs: client.mine }, code);

    expect(alice.key(bob.message)).not.toEqual(bob.key(alice.message));
  });

  it('sends the message and reaches the key an Android 14 pairing server agreed with', () => {
    const alice = new Spake2('alice', client, code, Buffer.alloc(64, 1));
    const bob = new Spake2('bob', server, code, Buffer.alloc(64, 2));

    const key = alice.key(bob.message);

    expect(alice.message.toString('hex')).toBe(
      'd423276ed91364f664af740225a0bee26f37b1d5d9c104ec3ecc75ff77a7cfb7',
    );
    expect(bob.message.toString('hex')).toBe(
      'e79ec56d32a72bcdb1333a8708a3386cc43c93943c3ff6062c185586ce27cd1e',
    );
    expect(key.toString('hex')).toBe(
      '0cf6cc2b63e666d35e2a1cd07e8dd92de2a90cedf4db5c829cc887b8862099ab' +
        '81043edca7282b41cee136dfa39fc015f2928315a822eab3390be385fbbc7650',
    );
  });

  it('draws a new private key for every exchange', () => {
    expect(new Spake2('alice', client, code).message).not.toEqual(
      new Spake2('alice', client, code).message,
    );
  });

  it('refuses a message that is not a point of the curve', () => {
    const alice = new Spake2('alice', client, code);
    const offCurve = Buffer.alloc(32);
    offCurve[0] = 2;

    expect(() => alice.key(offCurve)).toThrow('not a point');
    expect(() => alice.key(Buffer.alloc(31))).toThrow('not a point');
  });
});
