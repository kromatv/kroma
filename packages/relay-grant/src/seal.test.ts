import { describe, expect, it, vi } from 'vitest';
import { b64url, fromB64url } from './b64';
import { open, type Sealing, type Shape, seal, subjectKey } from './seal';

const SEALING: Sealing = { secret: 'a-test-sealing-secret-that-is-long-enough', salt: 'test' };
const NOW = 1_800_000_000;
const IV_BYTES = 12;

interface Payload {
  d: string;
  e: number;
}

const shape: Shape<Payload> = {
  safeParse(input: unknown) {
    const v = input as Partial<Payload> | null;
    if (v && typeof v.d === 'string' && typeof v.e === 'number') {
      return { success: true, data: { d: v.d, e: v.e } };
    }
    return { success: false };
  },
};

const mint = (d: string, e = NOW + 3600, sealing = SEALING) => seal(sealing, { d, e });
const blobOf = (grant: string): string => grant.split('.')[1] ?? '';

describe('sealing', () => {
  it('round-trips exactly what was sealed', async () => {
    const grant = await mint('SUBJECT-A');

    expect(await open(SEALING, grant, NOW, shape)).toEqual({ d: 'SUBJECT-A', e: NOW + 3600 });
  });

  it('hides the payload it carries', async () => {
    const grant = await mint('SUBJECT-A');

    expect(grant).not.toContain('SUBJECT-A');
    expect(atob(blobOf(grant).replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('SUBJECT');
  });

  it('never mints the same blob twice for the same payload', async () => {
    const a = await mint('SUBJECT-A');
    const b = await mint('SUBJECT-A');

    expect(a).not.toEqual(b);
    expect(await open(SEALING, a, NOW, shape)).toEqual(await open(SEALING, b, NOW, shape));
  });

  it('refuses a grant sealed with another secret', async () => {
    const foreign = await mint('SUBJECT-A', NOW + 100, { ...SEALING, secret: 'another-secret' });

    expect(await open(SEALING, foreign, NOW, shape)).toBeNull();
  });

  it('refuses a grant another relay sealed with the same secret', async () => {
    const other = await mint('SUBJECT-A', NOW + 100, { ...SEALING, salt: 'other-relay' });

    expect(await open(SEALING, other, NOW, shape)).toBeNull();
  });

  it('refuses a tampered grant', async () => {
    const grant = await mint('SUBJECT-A');
    const bytes = fromB64url(blobOf(grant));

    for (const at of [IV_BYTES, bytes.length - 1]) {
      const tampered = new Uint8Array(bytes);
      tampered[at] = (tampered[at] ?? 0) ^ 0x01;
      expect(await open(SEALING, `v1.${b64url(tampered)}`, NOW, shape)).toBeNull();
    }
    const truncated = `v1.${b64url(bytes.subarray(0, bytes.length - 1))}`;
    expect(await open(SEALING, truncated, NOW, shape)).toBeNull();
    expect(await open(SEALING, grant, NOW, shape)).not.toBeNull();
  });

  it('refuses junk, truncation and the wrong version alike', async () => {
    const grant = await mint('SUBJECT-A');

    for (const bad of [
      '',
      'v1',
      'v1.',
      `v2.${blobOf(grant)}`,
      blobOf(grant),
      'v1.####',
      'v1.AAAA',
    ]) {
      expect(await open(SEALING, bad, NOW, shape), bad).toBeNull();
    }
  });

  it('refuses an expired grant', async () => {
    expect(await open(SEALING, await mint('SUBJECT-A', NOW - 1), NOW, shape)).toBeNull();
    expect(await open(SEALING, await mint('SUBJECT-A', NOW + 1), NOW, shape)).not.toBeNull();
  });

  it('refuses a payload that opens but is not the expected shape', async () => {
    const grant = await seal(SEALING, { e: NOW + 100 });

    expect(await open(SEALING, grant, NOW, shape)).toBeNull();
  });

  it('refuses to be minted without a secret', async () => {
    await expect(seal({ ...SEALING, secret: '' }, { e: NOW + 10 })).rejects.toThrow('GRANT_SECRET');
  });

  it('does not remember a failed derivation as that secret’s answer', async () => {
    const sealing = { ...SEALING, secret: 'a-secret-that-cannot-be-derived' };
    const importKey = vi
      .spyOn(crypto.subtle, 'importKey')
      .mockRejectedValue(new Error('HKDF unavailable'));

    await expect(seal(sealing, { e: NOW + 10 })).rejects.toThrow('HKDF unavailable');
    importKey.mockRestore();
    const grant = await mint('SUBJECT-A', NOW + 10, sealing);

    expect(await open(sealing, grant, NOW, shape)).toEqual({ d: 'SUBJECT-A', e: NOW + 10 });
  });
});

describe('subjectKey', () => {
  it('is stable per subject and reveals nothing about it', async () => {
    const a = await subjectKey('SUBJECT-A');

    expect(await subjectKey('SUBJECT-A')).toEqual(a);
    expect(await subjectKey('SUBJECT-B')).not.toEqual(a);
    expect(a).not.toContain('SUBJECT');
  });
});
