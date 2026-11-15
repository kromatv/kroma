import type { TLSSocket } from 'node:tls';
import type { AdbKey } from '../key';
import { secure } from '../secure';
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

const TIMEOUT_MS = 10_000;
const CLOSE_WAIT_MS = 2000;
const SPAKE_MESSAGE_BYTES = 32;

/** The TV turned the pairing down: the code is wrong, or no longer the one on screen. */
export class PairingRefused extends Error {}

export interface PairRequest {
  host: string;
  port: number;
  code: string;
  key: AdbKey;
  timeoutMs?: number;
}

function finish(socket: TLSSocket): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => socket.destroy(), CLOSE_WAIT_MS);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.end();
  });
}

async function exchange(socket: TLSSocket, bytes: ByteReader, request: PairRequest) {
  const exported = socket.exportKeyingMaterial(EXPORT_BYTES, EXPORT_LABEL, Buffer.alloc(0));
  const password = Buffer.concat([Buffer.from(request.code, 'utf8'), exported]);
  const spake = new Spake2('alice', { mine: CLIENT_NAME, theirs: SERVER_NAME }, password);
  socket.write(Buffer.concat([pairingHeader(PACKET.spake2, spake.message.length), spake.message]));
  const cipher = new PairingCipher(
    spake.key(await readPacket(bytes, PACKET.spake2, SPAKE_MESSAGE_BYTES)),
  );

  const sealed = cipher.seal(peerInfo(PEER.publicKey, request.key.publicKey));
  socket.write(Buffer.concat([pairingHeader(PACKET.peerInfo, sealed.length), sealed]));
  return cipher.open(await readPacket(bytes, PACKET.peerInfo, SEALED_PEER_INFO_BYTES));
}

/**
 * Pairs this computer with a TV that shows a Wireless debugging pairing code,
 * the way `adb pair` does, and answers the name the TV gives itself. The TV
 * trusts the key from then on.
 */
export async function pairWithCode(request: PairRequest): Promise<string> {
  const timeoutMs = request.timeoutMs ?? TIMEOUT_MS;
  const target = { host: request.host, port: request.port };
  const socket = await secure(target, request.key.privateKey, timeoutMs);
  socket.on('error', () => undefined);
  const bytes = new ByteReader(socket, timeoutMs);

  let answer: Buffer | null;
  try {
    answer = await exchange(socket, bytes, request);
  } catch (error) {
    socket.destroy();
    throw error;
  }
  if (!answer || answer[0] !== PEER.deviceGuid) {
    socket.destroy();
    throw new PairingRefused('the TV refused that pairing code');
  }
  await finish(socket);
  const end = answer.indexOf(0, 1);
  return answer.toString('utf8', 1, end === -1 ? answer.length : end);
}
