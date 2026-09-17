import { importPublicKey, nonce, verify } from './identity';
import { ChallengeAnswer, isPrivateHost } from './schemas';

/** Where a KROMA server answers the relay's challenge. */
export const CHALLENGE_PATH = '/api/mail/relay-challenge';

const TIMEOUT_MS = 5000;
const MAX_ANSWER_BYTES = 1024;

async function boundedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ANSWER_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce((all, c) => {
      const next = new Uint8Array(all.length + c.length);
      next.set(all);
      next.set(c, all.length);
      return next;
    }, new Uint8Array()),
  );
}

/**
 * Whether the server at `origin` holds the private half of `publicKey`: it is
 * asked to sign a fresh nonce at a fixed path, over the public internet, and
 * gets one short answer with no redirects followed. A private origin is taken
 * at its word, because nobody can be lured to it.
 */
export async function provesOrigin(origin: string, publicKey: string): Promise<boolean> {
  if (isPrivateHost(new URL(origin).hostname)) return true;
  const key = await importPublicKey(publicKey);
  if (!key) return false;
  const challenge = nonce();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}${CHALLENGE_PATH}?nonce=${challenge}`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (response.status !== 200) return false;
    const text = await boundedText(response);
    if (text === null) return false;
    const answer = ChallengeAnswer.safeParse(JSON.parse(text));
    if (!answer.success || answer.data.nonce !== challenge) return false;
    return verify(key, challenge, answer.data.signature);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
