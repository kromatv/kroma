import { describe, expect, it } from 'vitest';
import {
  activationBlob,
  activationUrl,
  blockUrl,
  Marks,
  openBlock,
  openPending,
  sealBlock,
  sealPending,
} from './activation';
import {
  ADDRESS,
  LIMIT_SECRET,
  memoryCounters,
  ORIGIN,
  OWNER,
  PUBLIC_URL,
  SECRET,
  SERVER_IP,
} from './test-support';

const NOW = 1_800_000_000;

describe('activation links', () => {
  it('round-trip the mailbox, the server, where it called from, and its token', async () => {
    const pending = { a: OWNER, o: ORIGIN, t: 'tok-1234567890', i: SERVER_IP, e: NOW + 60 };
    const blob = await sealPending(SECRET, pending);

    expect(await openPending(SECRET, blob, NOW)).toEqual(pending);
    expect(blob).not.toContain('owner');
  });

  it('are the relay’s own URL and nothing else', async () => {
    const blob = await sealPending(SECRET, { a: OWNER, o: ORIGIN, t: 'tok', i: '', e: NOW + 60 });
    const url = activationUrl(PUBLIC_URL, blob);

    expect(url).toBe(`${PUBLIC_URL}/confirm/${blob}`);
    expect(activationBlob(PUBLIC_URL, url)).toBe(blob);
    expect(activationBlob(PUBLIC_URL, `https://evil.example/confirm/${blob}`)).toBeNull();
    expect(activationBlob(PUBLIC_URL, `${PUBLIC_URL}/confirm/${blob}?x=1`)).toBeNull();
    expect(activationBlob(PUBLIC_URL, `${PUBLIC_URL}/other/${blob}`)).toBeNull();
  });

  it('expire with the server’s verification link', async () => {
    const blob = await sealPending(SECRET, { a: OWNER, o: ORIGIN, t: 'tok', i: '', e: NOW - 1 });

    expect(await openPending(SECRET, blob, NOW)).toBeNull();
  });
});

describe('opt-out links', () => {
  it('name a mailbox and a server to nobody but the relay, and last for years', async () => {
    const blob = await sealBlock(SECRET, ADDRESS, ORIGIN, NOW);

    expect(blockUrl(PUBLIC_URL, blob)).toBe(`${PUBLIC_URL}/block/${blob}`);
    expect(blob).not.toContain('reader');
    expect(await openBlock(SECRET, blob, NOW + 5 * 365 * 86400)).toMatchObject({
      a: ADDRESS,
      o: ORIGIN,
    });
    expect(await openPending(SECRET, blob, NOW)).toBeNull();
  });
});

describe('the marks the relay keeps', () => {
  it('activate an origin under a key that names neither it nor the mailbox', async () => {
    const kv = memoryCounters();
    const marks = new Marks(kv, LIMIT_SECRET);

    expect(await marks.active(ORIGIN)).toBe(false);
    await marks.activate(ORIGIN, OWNER);
    expect(await marks.active(ORIGIN)).toBe(true);
    expect(await marks.active('https://other.example')).toBe(false);
    for (const [key, value] of kv.store) {
      expect(`${key} ${value}`).not.toMatch(/owner|example/);
    }
  });

  it('take the activation away with the mailbox that gave it, and only that one', async () => {
    const marks = new Marks(memoryCounters(), LIMIT_SECRET);
    await marks.activate(ORIGIN, OWNER);

    await marks.deactivateBy(ORIGIN, ADDRESS);
    expect(await marks.active(ORIGIN)).toBe(true);
    await marks.deactivateBy(ORIGIN, OWNER.toUpperCase());
    expect(await marks.active(ORIGIN)).toBe(false);
  });

  it('keep the mailbox that gave the activation through a refresh', async () => {
    const kv = memoryCounters();
    const marks = new Marks(kv, LIMIT_SECRET);
    await marks.activate(ORIGIN, OWNER);
    const before = [...kv.store.values()];

    await marks.refresh(ORIGIN);
    expect([...kv.store.values()]).toEqual(before);
    await marks.refresh('https://other.example');
    expect(await marks.active('https://other.example')).toBe(false);
  });

  it('block one mailbox for one origin, whatever the spelling', async () => {
    const marks = new Marks(memoryCounters(), LIMIT_SECRET);

    expect(await marks.blocked(ORIGIN, ADDRESS)).toBe(false);
    await marks.block(ORIGIN, ADDRESS);
    expect(await marks.blocked(ORIGIN, ADDRESS.toUpperCase())).toBe(true);
    expect(await marks.blocked('https://other.example', ADDRESS)).toBe(false);
    expect(await marks.blocked(ORIGIN, 'other@example.test')).toBe(false);
  });
});
