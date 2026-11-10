import { type SFTPWrapper, utils } from 'ssh2';

const { STATUS_CODE } = utils.sftp;

/** Serves the part of SFTP an upload uses: open, write, close. */
export function serveSftp(sftp: SFTPWrapper, onFile: (path: string, data: Buffer) => void): void {
  const open = new Map<string, { path: string; chunks: Buffer[] }>();
  let next = 0;

  sftp.on('OPEN', (request: number, path: string) => {
    const handle = Buffer.alloc(4);
    handle.writeUInt32BE(next++);
    open.set(handle.toString('hex'), { path, chunks: [] });
    sftp.handle(request, handle);
  });
  sftp.on('WRITE', (request: number, handle: Buffer, _offset: number, data: Buffer) => {
    open.get(handle.toString('hex'))?.chunks.push(Buffer.from(data));
    sftp.status(request, STATUS_CODE.OK);
  });
  sftp.on('CLOSE', (request: number, handle: Buffer) => {
    const file = open.get(handle.toString('hex'));
    if (file) onFile(file.path, Buffer.concat(file.chunks));
    open.delete(handle.toString('hex'));
    sftp.status(request, STATUS_CODE.OK);
  });
  for (const unsupported of ['FSTAT', 'FSETSTAT', 'SETSTAT', 'STAT', 'LSTAT', 'REALPATH']) {
    sftp.on(unsupported, (request: number) => sftp.status(request, STATUS_CODE.OP_UNSUPPORTED));
  }
}
