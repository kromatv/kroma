import { describe, expect, it } from 'vitest';
import { awaited, parsed } from './frames';
import { scripted } from './testing';

const named = (frame: unknown) =>
  typeof frame === 'object' && frame !== null && 'name' in frame ? frame : undefined;

function refusing(): undefined {
  throw new Error('refused');
}

describe('what a frame said', () => {
  it('is its JSON, or nothing when it is not JSON', () => {
    expect(parsed('{"a":1}')).toEqual({ a: 1 });
    expect(parsed('<html>')).toBeNull();
  });
});

describe('reading frames until one is taken', () => {
  it('reads past the frames nobody takes', async () => {
    const { socket } = scripted(['noise', { other: true }, { name: 'salon' }]);

    await expect(awaited(socket, 500, named)).resolves.toEqual({ name: 'salon' });
    expect(socket.next).toHaveBeenCalledTimes(3);
    expect(socket.next).toHaveBeenCalledWith(500);
  });

  it('fails when the television stops talking first', async () => {
    const { socket } = scripted([{ other: true }]);

    await expect(awaited(socket, 500, named)).rejects.toThrow('no answer');
  });

  it('fails as the reader does', async () => {
    const { socket } = scripted([{ name: 'salon' }]);
    await expect(awaited(socket, 500, refusing)).rejects.toThrow('refused');
  });
});
