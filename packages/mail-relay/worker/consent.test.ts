import { describe, expect, it } from 'vitest';
import { Consents, consentBlob, consentUrl, openPending, sealPending } from './consent';
import { ADDRESS, LIMIT_SECRET, memoryCounters, ORIGIN, PUBLIC_URL, SECRET } from './test-support';

const NOW = 1_800_000_000;

describe('consent links', () => {
  it('round-trip the mailbox, the server and its token', async () => {
    const blob = await sealPending(SECRET, {
      a: ADDRESS,
      o: ORIGIN,
      t: 'tok-1234567890',
      e: NOW + 60,
    });

    expect(await openPending(SECRET, blob, NOW)).toEqual({
      a: ADDRESS,
      o: ORIGIN,
      t: 'tok-1234567890',
      e: NOW + 60,
    });
    expect(blob).not.toContain('reader');
  });

  it('are the relay’s own URL and nothing else', async () => {
    const blob = await sealPending(SECRET, { a: ADDRESS, o: ORIGIN, t: 'tok', e: NOW + 60 });
    const url = consentUrl(PUBLIC_URL, blob);

    expect(url).toBe(`${PUBLIC_URL}/confirm/${blob}`);
    expect(consentBlob(PUBLIC_URL, url)).toBe(blob);
    expect(consentBlob(PUBLIC_URL, `https://evil.example/confirm/${blob}`)).toBeNull();
    expect(consentBlob(PUBLIC_URL, `${PUBLIC_URL}/confirm/${blob}?x=1`)).toBeNull();
    expect(consentBlob(PUBLIC_URL, `${PUBLIC_URL}/other/${blob}`)).toBeNull();
  });

  it('expire with the server’s verification link', async () => {
    const blob = await sealPending(SECRET, { a: ADDRESS, o: ORIGIN, t: 'tok', e: NOW - 1 });

    expect(await openPending(SECRET, blob, NOW)).toBeNull();
  });
});

describe('a mailbox’s yes', () => {
  it('is kept per origin and per mailbox, under a key that names neither', async () => {
    const kv = memoryCounters();
    const marks = new Consents(kv, LIMIT_SECRET);

    expect(await marks.has(ORIGIN, ADDRESS)).toBe(false);
    await marks.give(ORIGIN, ADDRESS);
    expect(await marks.has(ORIGIN, ADDRESS)).toBe(true);
    expect(await marks.has(ORIGIN, 'other@example.test')).toBe(false);
    expect(await marks.has('https://other.example', ADDRESS)).toBe(false);
    for (const key of kv.store.keys()) {
      expect(key).not.toMatch(/reader|example/);
    }
  });

  it('reads the same for any spelling of the address, and can be withdrawn', async () => {
    const marks = new Consents(memoryCounters(), LIMIT_SECRET);
    await marks.give(ORIGIN, ADDRESS);

    expect(await marks.has(ORIGIN, ADDRESS.toUpperCase())).toBe(true);
    await marks.withdraw(ORIGIN, ADDRESS);
    expect(await marks.has(ORIGIN, ADDRESS)).toBe(false);
  });
});
