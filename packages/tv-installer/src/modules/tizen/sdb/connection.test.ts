import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type ConnectionOptions, SdbConnection } from './connection';
import {
  type FakeDevice,
  type FakeDeviceOptions,
  fakeDevice,
  shellCommand,
} from './fake-device.fixture';
import { encodePacket, HOST_MAX_DATA, PROTOCOL_VERSION, SDB_COMMAND } from './packet';

const PATIENT_MS = 200;
const IMPATIENT_MS = 100;
const EMPTY = Buffer.alloc(0);

const televisions: FakeDevice[] = [];
const connections: SdbConnection[] = [];

const television = async (options?: FakeDeviceOptions): Promise<FakeDevice> => {
  const set = await fakeDevice(options);
  televisions.push(set);
  return set;
};

const open = async (set: FakeDevice, options?: ConnectionOptions): Promise<SdbConnection> => {
  const connection = options
    ? await SdbConnection.open(set.host, set.port, options)
    : await SdbConnection.open(set.host, set.port);
  connections.push(connection);
  return connection;
};

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  await Promise.all(televisions.splice(0).map((set) => set.close()));
});

describe('the handshake', () => {
  it("announces Samsung's protocol version rather than adb's", async () => {
    const set = await television();

    await open(set);

    expect(set.received[0]).toMatchObject({ command: SDB_COMMAND.CNXN, arg0: 0x00100000 });
    expect(PROTOCOL_VERSION).toBe(0x00100000);
  });

  it('offers the host banner and the largest payload it will take', async () => {
    const set = await television();

    await open(set);

    expect(set.received[0]?.arg1).toBe(HOST_MAX_DATA);
    expect(set.received[0]?.data.toString('utf8')).toBe('host::\0');
  });

  it('keeps the banner the device answered with', async () => {
    const set = await television();

    const connection = await open(set);

    expect(connection.banner).toBe(set.banner);
  });

  it('reassembles a banner that arrived in two reads', async () => {
    const set = await television({ handshake: 'split' });

    const connection = await open(set);

    expect(connection.banner).toBe(set.banner);
  });

  it('holds writes to the payload size the device advertised', async () => {
    const set = await television({ maxData: 4096 });

    const connection = await open(set);

    expect(connection.maxData).toBe(4096);
  });

  it('keeps its own ceiling when the device advertises none', async () => {
    const set = await television({ maxData: 0 });

    const connection = await open(set);

    expect(connection.maxData).toBe(HOST_MAX_DATA);
  });

  it('refuses a device that demands RSA authentication', async () => {
    const set = await television({ handshake: 'auth' });

    await expect(open(set)).rejects.toThrow(/RSA authentication/);
  });

  it('gives up on a device that sends no banner at all', async () => {
    const set = await television({ handshake: 'silence' });

    await expect(open(set, { timeoutMs: IMPATIENT_MS })).rejects.toThrow(/developer mode/);
  });

  it('hangs up on a host that accepted the connection and then said nothing', async () => {
    const set = await television({ handshake: 'silence' });

    await expect(open(set, { timeoutMs: IMPATIENT_MS })).rejects.toThrow(/developer mode/);

    await expect(set.hungUpOn()).resolves.toBeUndefined();
  });

  it('names the host it could not reach', async () => {
    const set = await television();
    await set.close();

    await expect(open(set)).rejects.toThrow(`sdb: could not reach 127.0.0.1:${set.port}`);
  });
});

describe('the stream table', () => {
  it('carries a service output back to the stream that asked for it', async () => {
    const set = await television();
    const said = randomBytes(16);
    set.serve('capability:', (session) => session.write(said));

    const stream = await (await open(set)).openStream('capability:', PATIENT_MS);

    expect(await stream.read(PATIENT_MS)).toEqual(said);
  });

  it('reads two packets that arrived in the same read', async () => {
    const set = await television();
    const said = randomBytes(16);
    set.serve('capability:', (session) => session.end(said));

    const stream = await (await open(set)).openStream('capability:', PATIENT_MS);

    expect(await stream.drain({ timeoutMs: PATIENT_MS })).toEqual(said);
    expect(await stream.read(PATIENT_MS)).toBeNull();
  });

  it('keeps two services open at once without crossing their output', async () => {
    const set = await television();
    const capability = randomBytes(8);
    const output = randomBytes(8);
    set.serve('capability:', (session) => session.end(capability));
    set.serve('shell:', (session) => session.end(output));
    const connection = await open(set);

    const streams = await Promise.all([
      connection.openStream('capability:', PATIENT_MS),
      connection.openStream(`shell:${shellCommand()}`, PATIENT_MS),
    ]);

    expect(await streams[0].drain({ timeoutMs: PATIENT_MS })).toEqual(capability);
    expect(await streams[1].drain({ timeoutMs: PATIENT_MS })).toEqual(output);
  });

  it('reports a service the device refuses to open', async () => {
    const set = await television();
    const connection = await open(set);

    await expect(connection.openStream('appcmd:install', PATIENT_MS)).rejects.toThrow(
      /refused appcmd:install/,
    );
  });

  it('ignores a packet addressed to a stream it has forgotten', async () => {
    const set = await television();
    const said = randomBytes(8);
    set.serve('shell:', (session) => session.end(said));
    const connection = await open(set);

    set.raw(encodePacket({ command: SDB_COMMAND.WRTE, arg0: 9, arg1: 4096, data: randomBytes(4) }));
    const stream = await connection.openStream(`shell:${shellCommand()}`, PATIENT_MS);

    expect(await stream.drain({ timeoutMs: PATIENT_MS })).toEqual(said);
  });

  it('writes nothing to a socket that is already gone', async () => {
    const set = await television();
    set.serve('shell:', () => undefined);
    const connection = await open(set);
    const stream = await connection.openStream(`shell:${shellCommand()}`, PATIENT_MS);

    connection.close();
    stream.close();

    expect(set.received.filter((packet) => packet.command === SDB_COMMAND.CLSE)).toEqual([]);
  });
});

describe('a frame the device could not have sent', () => {
  const streaming = async () => {
    const set = await television();
    set.serve('shell:', () => undefined);
    const connection = await open(set);
    const stream = await connection.openStream(`shell:${shellCommand()}`, PATIENT_MS);
    return { set, stream, reading: stream.read(PATIENT_MS) };
  };

  it('kills the connection when the magic does not invert the command', async () => {
    const { set, stream, reading } = await streaming();
    const frame = encodePacket({
      command: SDB_COMMAND.WRTE,
      arg0: 9,
      arg1: stream.localId,
      data: randomBytes(4),
    });
    frame.writeUInt32LE(0, 20);

    set.raw(frame);

    await expect(reading).rejects.toThrow(/bad frame/);
  });

  it('kills the connection when the payload does not match its checksum', async () => {
    const { set, stream, reading } = await streaming();
    const frame = encodePacket({
      command: SDB_COMMAND.WRTE,
      arg0: 9,
      arg1: stream.localId,
      data: randomBytes(4),
    });
    frame.writeUInt32LE(0, 16);

    set.raw(frame);

    await expect(reading).rejects.toThrow(/checksum/);
  });

  it('kills the connection on a command that makes no sense on a stream', async () => {
    const { set, stream, reading } = await streaming();
    const frame = encodePacket({
      command: SDB_COMMAND.OPEN,
      arg0: 9,
      arg1: stream.localId,
      data: EMPTY,
    });

    set.raw(frame);

    await expect(reading).rejects.toThrow(/unexpected OPEN/);
  });
});

describe('a device that goes away', () => {
  it('reports the set resetting the connection under it', async () => {
    const set = await television();
    set.serve('shell:', () => undefined);
    const connection = await open(set);
    const stream = await connection.openStream(`shell:${shellCommand()}`, PATIENT_MS);
    const reading = stream.read(PATIENT_MS);

    set.reset();

    await expect(reading).rejects.toThrow(/ECONNRESET/);
  });

  it('fails whoever was waiting on it', async () => {
    const set = await television();
    set.serve('shell:', () => undefined);
    const connection = await open(set);
    const stream = await connection.openStream(`shell:${shellCommand()}`, PATIENT_MS);
    const reading = stream.read(PATIENT_MS);

    await set.close();

    await expect(reading).rejects.toThrow(/closed the connection/);
  });

  it('opens nothing more once it has gone', async () => {
    const set = await television();
    set.serve('shell:', () => undefined);
    const connection = await open(set);
    const stream = await connection.openStream(`shell:${shellCommand()}`, PATIENT_MS);
    const reading = stream.read(PATIENT_MS);
    await set.close();
    await expect(reading).rejects.toThrow();

    await expect(connection.openStream('capability:', PATIENT_MS)).rejects.toThrow(
      /closed the connection/,
    );
  });
});
