import { afterEach, describe, expect, it } from 'vitest';
import { parseCapability, readCapability } from './capability';
import { SdbConnection } from './connection';
import { capabilityPayload, deviceName, type FakeDevice, fakeDevice } from './fake-device.fixture';

const PATIENT_MS = 200;

const televisions: FakeDevice[] = [];
const connections: SdbConnection[] = [];

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.close();
  await Promise.all(televisions.splice(0).map((set) => set.close()));
});

const framed = (text: string) => {
  const body = Buffer.from(text, 'utf8');
  const prefix = Buffer.alloc(2);
  prefix.writeUInt16LE(body.length, 0);
  return Buffer.concat([prefix, body]);
};

describe('the capability payload', () => {
  it('reads the key:value lines behind the length prefix', () => {
    const payload = framed('secure_protocol:enabled\nsdk_toolpath:/home/owner/share/tmp\n');

    const capability = parseCapability(payload);

    expect(capability.secure_protocol).toBe('enabled');
    expect(capability.sdk_toolpath).toBe('/home/owner/share/tmp');
  });

  it('stops at the byte count the device declared', () => {
    const payload = Buffer.concat([framed('profile_name:tv\n'), Buffer.from('junk:yes\n')]);

    expect(parseCapability(payload).junk).toBeUndefined();
  });

  it('reads a payload that arrives without a usable prefix', () => {
    const payload = Buffer.from('profile_name:tv\ncpu_arch:armv7\n', 'utf8');

    expect(parseCapability(payload).cpu_arch).toBe('armv7');
  });

  it('keeps a value containing a colon whole', () => {
    const payload = framed('log_path:/tmp:/var/log\n');

    expect(parseCapability(payload).log_path).toBe('/tmp:/var/log');
  });

  it('drops a line with no separator', () => {
    const payload = framed('garbage\nprofile_name:tv\n');

    expect(parseCapability(payload)).toEqual({ profile_name: 'tv' });
  });

  it('stops after the hundred and twenty-eighth key', () => {
    const lines = Array.from({ length: 200 }, (_, at) => `key${at}:${at}`).join('\n');

    expect(Object.keys(parseCapability(framed(lines)))).toHaveLength(128);
  });

  it('is empty for a payload too short to be framed', () => {
    expect(parseCapability(Buffer.alloc(1))).toEqual({});
  });
});

describe('asking a device what it can do', () => {
  it('reads the framed lines the set answers with', async () => {
    const set = await fakeDevice();
    const name = deviceName();
    televisions.push(set);
    set.serve('capability:', (session) => session.end(capabilityPayload({ device_name: name })));
    const connection = await SdbConnection.open(set.host, set.port, { timeoutMs: PATIENT_MS });
    connections.push(connection);

    const capability = await readCapability(connection);

    expect(capability.device_name).toBe(name);
  });
});
