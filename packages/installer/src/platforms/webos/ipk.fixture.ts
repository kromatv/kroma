import { gzipSync } from 'fflate';

const TAR_BLOCK_BYTES = 512;

export interface IpkFixture {
  control?: string;
  controlName?: string;
  payload?: Uint8Array;
  members?: readonly [string, Uint8Array][];
}

const NATIVE_CONTROL = 'Package: tv.kroma.app\nVersion: 0.1.40\nArchitecture: arm\n';

/** An `.ipk` as ares-package and rn-webos write one: an ar archive around gzipped tarballs. */
export function ipkBytes(fixture: IpkFixture = {}): Buffer {
  const members = fixture.members ?? [
    ['debian-binary', Buffer.from('2.0\n')],
    ['control.tar.gz', controlArchive(fixture.control, fixture.controlName)],
    ['data.tar.gz', fixture.payload ?? new Uint8Array(0)],
  ];
  return Buffer.concat([
    Buffer.from('!<arch>\n'),
    ...members.map(([name, data]) => arMember(name, data)),
  ]);
}

/** The gzipped tarball an `.ipk` keeps its control file in. */
export function controlArchive(control = NATIVE_CONTROL, name = './control'): Uint8Array {
  return gzipSync(tar(name, Buffer.from(control)));
}

function arMember(name: string, data: Uint8Array): Buffer {
  const header =
    `${name}/`.padEnd(16) +
    '0'.padEnd(12) +
    '0'.padEnd(6) +
    '0'.padEnd(6) +
    '100644'.padEnd(8) +
    String(data.length).padEnd(10) +
    '`\n';
  const padding = data.length % 2 === 1 ? Buffer.from('\n') : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(header, 'latin1'), data, padding]);
}

function tar(name: string, data: Buffer): Buffer {
  const header = Buffer.alloc(TAR_BLOCK_BYTES);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 'latin1');
  header.write('0000000\0', 108, 'latin1');
  header.write('0000000\0', 116, 'latin1');
  header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1');
  header.write('00000000000\0', 136, 'latin1');
  header.write('        ', 148, 'latin1');
  header.write('0', 156, 'latin1');
  header.write('ustar\0' + '00', 257, 'latin1');
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
  const padded = Buffer.alloc(Math.ceil(data.length / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES);
  data.copy(padded);
  return Buffer.concat([header, padded, Buffer.alloc(TAR_BLOCK_BYTES * 2)]);
}
