import { createServer, type TLSSocket } from 'node:tls';
import { listenOnLoopback } from '../fake-listener.fixture';
import { SERVER_TLS } from '../fake-tls.fixture';
import { ByteReader } from './bytes';
import { PairingCipher } from './cipher';
import {
  CLIENT_NAME,
  EXPORT_BYTES,
  EXPORT_LABEL,
  PACKET,
  PEER,
  pairingHeader,
  peerInfo,
  readPacket,
  SEALED_PEER_INFO_BYTES,
  SERVER_NAME,
} from './packet';
import { Spake2 } from './spake2';

export interface FakePairing {
  port: number;
  paired: string[];
  close(): Promise<void>;
}

async function serve(socket: TLSSocket, code: string, guid: string, fake: FakePairing) {
  const bytes = new ByteReader(socket, 5000);
  const exported = socket.exportKeyingMaterial(EXPORT_BYTES, EXPORT_LABEL, Buffer.alloc(0));
  const password = Buffer.concat([Buffer.from(code), exported]);
  const spake = new Spake2('bob', { mine: SERVER_NAME, theirs: CLIENT_NAME }, password);
  socket.write(Buffer.concat([pairingHeader(PACKET.spake2, spake.message.length), spake.message]));
  const cipher = new PairingCipher(spake.key(await readPacket(bytes, PACKET.spake2, 32)));

  const sealed = cipher.seal(peerInfo(PEER.deviceGuid, guid));
  socket.write(Buffer.concat([pairingHeader(PACKET.peerInfo, sealed.length), sealed]));
  const theirs = cipher.open(await readPacket(bytes, PACKET.peerInfo, SEALED_PEER_INFO_BYTES));
  if (theirs?.[0] !== PEER.publicKey) {
    socket.destroy();
    return;
  }
  fake.paired.push(theirs.toString('utf8', 1, theirs.indexOf(0, 1)));
  socket.end();
}

/** The pairing server of a TV showing `code`, in this process. */
export async function fakePairing(code: string, guid = 'adb-FAKE-a1b2c3'): Promise<FakePairing> {
  const fake: FakePairing = { port: 0, paired: [], close: async () => undefined };
  const sockets = new Set<TLSSocket>();
  const server = createServer(SERVER_TLS, (socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    serve(socket, code, guid, fake).catch(() => socket.destroy());
  });
  return Object.assign(fake, await listenOnLoopback(server, sockets));
}
