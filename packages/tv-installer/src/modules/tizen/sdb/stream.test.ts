import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { shellCommand, streamId } from './fake-device.fixture';
import { SDB_COMMAND } from './packet';
import { SdbStream } from './stream';

const PATIENT_MS = 200;
const IMPATIENT_MS = 20;

interface Frame {
  command: number;
  arg0: number;
  arg1: number;
  data: Buffer;
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const transport = (maxData: number) => {
  const sent: Frame[] = [];
  const released: number[] = [];
  return {
    maxData,
    sent,
    released,
    get writes() {
      return sent.filter((frame) => frame.command === SDB_COMMAND.WRTE);
    },
    send: (command: number, arg0: number, arg1: number, data: Buffer) =>
      void sent.push({ command, arg0, arg1, data }),
    release: (localId: number) => void released.push(localId),
  };
};

const unopened = (maxData = 8) => {
  const wire = transport(maxData);
  const localId = streamId();
  const stream = new SdbStream(`shell:${shellCommand()}`, localId, wire);
  return { stream, wire, localId };
};

const opened = async (maxData = 8) => {
  const { stream, wire, localId } = unopened(maxData);
  const remoteId = streamId();
  const ready = stream.ready(PATIENT_MS);
  stream.onOkay(remoteId);
  await ready;
  const ack = async (times: number) => {
    for (let sent = 0; sent < times; sent += 1) {
      await settle();
      stream.onOkay(remoteId);
    }
  };
  return { stream, wire, localId, remoteId, ack };
};

describe('an open stream', () => {
  it('takes its peer id from the acceptance', async () => {
    const { stream, remoteId } = await opened();

    expect(stream.remoteId).toBe(remoteId);
  });

  it('acknowledges each payload the device writes', async () => {
    const { stream, wire, localId, remoteId } = await opened();

    stream.onData(randomBytes(4));
    stream.onData(randomBytes(4));

    expect(wire.sent).toEqual([
      { command: SDB_COMMAND.OKAY, arg0: localId, arg1: remoteId, data: Buffer.alloc(0) },
      { command: SDB_COMMAND.OKAY, arg0: localId, arg1: remoteId, data: Buffer.alloc(0) },
    ]);
  });

  it('hands a caller the payload that arrived before it asked', async () => {
    const { stream } = await opened();
    const said = randomBytes(8);

    stream.onData(said);

    expect(await stream.read(PATIENT_MS)).toEqual(said);
  });

  it('sends one chunk per acknowledgement, none of them past the negotiated size', async () => {
    const { stream, wire, ack } = await opened(8);

    const writing = stream.write(randomBytes(20));
    await ack(3);
    await writing;

    expect(wire.writes.map((frame) => frame.data.length)).toEqual([8, 8, 4]);
  });

  it('collects everything the service said until it closed', async () => {
    const { stream } = await opened();
    const first = randomBytes(4);
    const second = randomBytes(4);

    stream.onData(first);
    stream.onData(second);
    stream.onClose();

    expect(await stream.drain()).toEqual(Buffer.concat([first, second]));
  });

  it('stops draining at the byte limit', async () => {
    const { stream } = await opened();

    for (let chunk = 0; chunk < 3; chunk += 1) stream.onData(randomBytes(4));

    expect(await stream.drain({ limit: 8, timeoutMs: PATIENT_MS })).toHaveLength(8);
  });

  it('echoes the close back and gives up its id', async () => {
    const { stream, wire, localId, remoteId } = await opened();

    stream.close();

    expect(wire.sent).toEqual([
      { command: SDB_COMMAND.CLSE, arg0: localId, arg1: remoteId, data: Buffer.alloc(0) },
    ]);
    expect(wire.released).toEqual([localId]);
  });

  it('closes once however many times it is asked', async () => {
    const { stream, wire } = await opened();

    stream.close();
    stream.close();

    expect(wire.sent).toHaveLength(1);
  });

  it('reads nothing more once the device has closed it', async () => {
    const { stream } = await opened();

    stream.onClose();

    expect(await stream.read(PATIENT_MS)).toBeNull();
  });
});

describe('a stream the device never accepted', () => {
  it('rejects when the device refuses the service outright', async () => {
    const { stream, wire } = unopened();

    const ready = stream.ready(PATIENT_MS);
    stream.onClose();

    await expect(ready).rejects.toThrow(/refused/);
    expect(wire.sent).toEqual([]);
  });

  it('gives up on a device that never answers the open', async () => {
    const { stream } = unopened();

    await expect(stream.ready(IMPATIENT_MS)).rejects.toThrow(/never accepted/);
  });
});

describe('a stream that loses the device', () => {
  it('fails a write the device closed under, with the rest of it unsent', async () => {
    const { stream, wire } = await opened(8);

    const writing = stream.write(randomBytes(20), PATIENT_MS);
    await settle();
    stream.onClose();

    await expect(writing).rejects.toThrow(/closed mid-write/);
    expect(wire.writes).toHaveLength(1);
  });

  it('rejects the reader and the writer waiting on it', async () => {
    const { stream } = await opened(8);
    const gone = new Error('sdb: the device closed the connection');

    const reading = stream.read(PATIENT_MS);
    const writing = stream.write(randomBytes(4), PATIENT_MS);
    stream.onFail(gone);

    await expect(reading).rejects.toThrow(gone);
    await expect(writing).rejects.toThrow(gone);
  });

  it('rejects a later read with the failure that killed it', async () => {
    const { stream } = await opened();
    const gone = new Error('sdb: the device closed the connection');

    stream.onFail(gone);

    await expect(stream.read(PATIENT_MS)).rejects.toThrow(gone);
  });

  it('gives up on a service that went quiet', async () => {
    const { stream } = await opened();

    await expect(stream.read(IMPATIENT_MS)).rejects.toThrow(/went quiet/);
  });

  it('gives up on a write nothing acknowledges', async () => {
    const { stream } = await opened();

    await expect(stream.write(randomBytes(4), IMPATIENT_MS)).rejects.toThrow(
      /never acknowledged a write/,
    );
  });
});
