import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ByteReader } from './bytes';

describe('ByteReader', () => {
  it('reads exact counts out of chunks of any size, in order', async () => {
    const socket = new PassThrough();
    const bytes = new ByteReader(socket, 500);

    socket.write('ab');
    socket.write('cdef');

    expect((await bytes.read(3)).toString()).toBe('abc');
    expect((await bytes.read(3)).toString()).toBe('def');
  });

  it('waits for bytes that have not arrived yet', async () => {
    const socket = new PassThrough();
    const bytes = new ByteReader(socket, 500);

    const reading = bytes.read(4);
    socket.write('ab');
    socket.write('cd');

    expect((await reading).toString()).toBe('abcd');
  });

  it('fails a read the socket closed under', async () => {
    const socket = new PassThrough();
    const bytes = new ByteReader(socket, 500);

    const reading = bytes.read(4);
    socket.destroy();

    await expect(reading).rejects.toThrow('the connection closed');
  });

  it('fails a read with what broke the socket', async () => {
    const socket = new PassThrough();
    const bytes = new ByteReader(socket, 500);

    socket.destroy(new Error('ECONNRESET'));

    await expect(bytes.read(1)).rejects.toThrow('ECONNRESET');
  });

  it('fails a read nothing answers in time', async () => {
    const bytes = new ByteReader(new PassThrough(), 20);

    await expect(bytes.read(1)).rejects.toThrow('nothing answered in time');
  });
});
