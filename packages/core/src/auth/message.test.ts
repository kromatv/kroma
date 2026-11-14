import { describe, expect, it } from 'vitest';
import { flowMessage } from './message';

describe('flowMessage', () => {
  it.each(['group', 'blocked', 'full', 'noEmail', 'inviteInvalid', 'linkedElsewhere'] as const)(
    'names the refusal %s',
    (reason) => {
      expect(flowMessage({ status: 'refused', reason })).toBe(`refused.${reason}`);
    },
  );

  it('tells a person who said no at the provider that they cancelled', () => {
    expect(flowMessage({ status: 'failed', reason: 'provider.access_denied' })).toBe(
      'failedDenied',
    );
  });

  it('reads any other failure, and a refusal it does not know, as a failure', () => {
    expect(flowMessage({ status: 'failed', reason: 'token.audience' })).toBe('failed');
    expect(flowMessage({ status: 'refused', reason: 'from-a-newer-server' })).toBe('failed');
  });

  it.each(['requested', 'emailTaken', 'invitationOnly'] as const)(
    'names %s, which leaves an identity waiting',
    (status) => {
      expect(flowMessage({ status })).toBe(status);
    },
  );

  it('reads a result that signs nobody in and says nothing as an expired sign-in', () => {
    expect(flowMessage({ status: 'pending' })).toBe('expired');
    expect(flowMessage({ status: 'linked' })).toBe('expired');
  });
});
