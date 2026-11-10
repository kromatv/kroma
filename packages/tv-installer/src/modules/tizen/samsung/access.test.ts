import { describe, expect, it } from 'vitest';
import { parseAccess } from './access';

const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    access_token: 'token-123',
    userId: 'user-456',
    inputEmailID: 'owner@example.com',
    access_token_expires_in: '7200',
    ...over,
  });

describe('parseAccess', () => {
  it('reads the token, the account and its address out of the answer', () => {
    expect(parseAccess(answer())).toEqual({
      accessToken: 'token-123',
      userId: 'user-456',
      email: 'owner@example.com',
    });
  });

  it('answers no address when the sign-in named none', () => {
    expect(parseAccess(answer({ inputEmailID: undefined })).email).toBeNull();
  });

  it('refuses an answer that is not JSON', () => {
    expect(() => parseAccess('<html>Sign in</html>')).toThrow(
      'Samsung answered the sign-in with something that is not JSON',
    );
  });

  it('refuses an answer with no token in it', () => {
    expect(() => parseAccess(answer({ access_token: '' }))).toThrow(
      'the sign-in answer carries no access token: sign in again',
    );
  });

  it('refuses an answer far longer than a sign-in is', () => {
    expect(() => parseAccess(answer({ padding: 'x'.repeat(20_000) }))).toThrow(
      'the sign-in answer is far too long',
    );
  });
});
