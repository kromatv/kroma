import { describe, expect, it } from 'vitest';
import { ssoMessage } from '#web/features/accounts/sso-message';

describe('ssoMessage', () => {
  it.each(['group', 'blocked', 'full', 'noEmail', 'inviteInvalid', 'linkedElsewhere'] as const)(
    'names the refusal %s',
    (reason) => {
      expect(ssoMessage({ status: 'refused', reason })).toBe(`refused.${reason}`);
    },
  );

  it('tells a person who said no at the provider that they cancelled', () => {
    expect(ssoMessage({ status: 'failed', reason: 'provider.access_denied' })).toBe('failedDenied');
  });

  it('reads any other failure, and a refusal it does not know, as a failure', () => {
    expect(ssoMessage({ status: 'failed', reason: 'token.audience' })).toBe('failed');
    expect(ssoMessage({ status: 'refused', reason: 'from-a-newer-server' })).toBe('failed');
  });

  it('reads a result that signs nobody in and says nothing as an expired sign-in', () => {
    expect(ssoMessage({ status: 'pending' })).toBe('expired');
    expect(ssoMessage({ status: 'linked' })).toBe('expired');
  });
});
