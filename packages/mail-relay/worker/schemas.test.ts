import { describe, expect, it } from 'vitest';
import { ActivatePayload, Address, isOrigin, Origin, PublicKey, SendPayload } from './schemas';

describe('an origin', () => {
  it('is https anywhere, exactly the origin and nothing more', () => {
    expect(isOrigin('https://kroma.example')).toBe(true);
    expect(isOrigin('https://kroma.example:8443')).toBe(true);
    expect(isOrigin('https://kroma.example/')).toBe(false);
    expect(isOrigin('https://kroma.example/path')).toBe(false);
    expect(isOrigin('https://kroma.example?x=1')).toBe(false);
    expect(isOrigin('https://user:pw@kroma.example')).toBe(false);
    expect(isOrigin('kroma.example')).toBe(false);
    expect(isOrigin('')).toBe(false);
  });

  it('is http only off the public internet', () => {
    for (const ok of [
      'http://localhost:4040',
      'http://192.168.1.20:4040',
      'http://10.0.0.5',
      'http://172.16.0.9:4040',
      'http://127.0.0.1:4040',
      'http://[::1]:4040',
      'http://nas.local:4040',
      'http://kroma.lan',
      'http://kroma.home.arpa:4040',
    ]) {
      expect(isOrigin(ok), ok).toBe(true);
    }
    for (const bad of [
      'http://kroma.example',
      'http://172.32.0.1',
      'http://8.8.8.8',
      'http://kroma.local.evil.com',
      'ftp://kroma.example',
      'javascript:alert(1)',
    ]) {
      expect(isOrigin(bad), bad).toBe(false);
    }
  });

  it('forgives a trailing slash, as the server may spell it', () => {
    expect(Origin.parse('https://kroma.example/')).toBe('https://kroma.example');
  });
});

describe('an address', () => {
  it('is lowercased and must look like a mailbox at a dotted host', () => {
    expect(Address.parse(' Reader@Example.test ')).toBe('reader@example.test');
    for (const bad of ['nobody', 'a@b', 'a@b..c', 'a b@c.d', '@c.d']) {
      expect(Address.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('a key', () => {
  it('is the base64url of an uncompressed P-256 point, no more and no less', () => {
    expect(PublicKey.safeParse('A'.repeat(87)).success).toBe(true);
    expect(PublicKey.safeParse('A'.repeat(86)).success).toBe(false);
    expect(PublicKey.safeParse(`${'A'.repeat(86)}=`).success).toBe(false);
  });
});

describe('an activation request', () => {
  it('names a mailbox, a token and a time', () => {
    const parsed = ActivatePayload.parse({
      to: 'Reader@Example.test',
      token: 'tok-1234567890',
      ts: 1,
    });

    expect(parsed.to).toBe('reader@example.test');
    expect(
      ActivatePayload.safeParse({ to: 'reader@example.test', token: 'short', ts: 1 }).success,
    ).toBe(false);
    expect(
      ActivatePayload.safeParse({ to: 'reader@example.test', token: 'tok-1234567890' }).success,
    ).toBe(false);
  });
});

describe('a send request', () => {
  it('bounds every field and flattens the subject', () => {
    const parsed = SendPayload.parse({
      to: 'reader@example.test',
      subject: ' Reset\r\nyour password ',
      text: 'hello',
      html: '<p>hello</p>',
      ts: 1,
    });

    expect(parsed.subject).toBe('Reset your password');
    expect(parsed.attachments).toEqual([]);
    expect(SendPayload.safeParse({ ...parsed, html: 'x'.repeat(65 * 1024) }).success).toBe(false);
    expect(SendPayload.safeParse({ ...parsed, text: '' }).success).toBe(false);
  });

  it('takes one inline image, by a safe name and a known type', () => {
    const base = { to: 'reader@example.test', subject: 'x', text: 'y', html: 'z', ts: 1 };
    const logo = {
      filename: 'logo.png',
      type: 'image/png',
      contentId: 'logo',
      content: 'iVBORw0KGgo',
    };

    expect(SendPayload.safeParse({ ...base, attachments: [logo] }).success).toBe(true);
    expect(SendPayload.safeParse({ ...base, attachments: [logo, logo] }).success).toBe(false);
    expect(
      SendPayload.safeParse({ ...base, attachments: [{ ...logo, filename: 'a/b.png' }] }).success,
    ).toBe(false);
    expect(
      SendPayload.safeParse({ ...base, attachments: [{ ...logo, contentId: 'Lo go' }] }).success,
    ).toBe(false);
    expect(
      SendPayload.safeParse({ ...base, attachments: [{ ...logo, content: 'not+base64url/' }] })
        .success,
    ).toBe(false);
  });
});
