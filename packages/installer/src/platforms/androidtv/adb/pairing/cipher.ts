import { createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

const KEY_BYTES = 16;
const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
const INFO = 'adb pairing_auth aes-128-gcm key';

function nonce(counter: bigint): Buffer {
  const out = Buffer.alloc(NONCE_BYTES);
  out.writeBigUInt64LE(counter, 0);
  return out;
}

/**
 * The AES-128-GCM both sides of an adb pairing seal their last message with,
 * keyed from what SPAKE2 agreed on. Each direction counts its own messages.
 */
export class PairingCipher {
  private readonly key: Buffer;
  private sealed = 0n;
  private opened = 0n;

  constructor(keyMaterial: Uint8Array) {
    this.key = Buffer.from(hkdfSync('sha256', keyMaterial, Buffer.alloc(0), INFO, KEY_BYTES));
  }

  seal(plain: Uint8Array): Buffer {
    const cipher = createCipheriv('aes-128-gcm', this.key, nonce(this.sealed));
    this.sealed += 1n;
    return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  }

  /** The plain bytes, or null when the other side sealed them with another key. */
  open(sealed: Uint8Array): Buffer | null {
    if (sealed.length < TAG_BYTES) {
      return null;
    }
    const decipher = createDecipheriv('aes-128-gcm', this.key, nonce(this.opened));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    try {
      const plain = decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES));
      const opened = Buffer.concat([plain, decipher.final()]);
      this.opened += 1n;
      return opened;
    } catch {
      return null;
    }
  }
}
