import { describe, expect, it } from 'vitest';
import { AuthConfig, DEFAULT_SIGN_IN_METHODS } from '../accounts/schemas';
import { FlowResult, ProviderInput, ProviderView } from './schemas';

const user = {
  id: 'u1',
  email: 'lea@id.test',
  username: 'lea',
  permissions: ['playback'],
  libraries: null,
  createdAt: '2026-11-13T10:00:00Z',
  hasPin: false,
};

const provider = {
  id: 'p0',
  label: 'Home',
  icon: 'key',
  issuer: 'https://id.example',
  clientId: 'kroma',
  hasSecret: true,
  scopes: [],
  groupClaim: 'groups',
  requiredGroups: [],
  newPeople: 'ask',
  permissions: ['playback'],
  libraries: null,
  enabled: true,
  tested: true,
  live: true,
  fromEnv: false,
};

describe('a flow result', () => {
  it('carries a whole session when the person is signed in', () => {
    const result = FlowResult.parse({
      status: 'signedIn',
      token: 't',
      accessToken: 'a',
      mediaTicket: 'm',
      user,
    });

    expect(result.status === 'signedIn' && result.user.username).toBe('lea');
  });

  it('carries the reason of a refusal and of a failure', () => {
    expect(FlowResult.parse({ status: 'refused', reason: 'group' })).toEqual({
      status: 'refused',
      reason: 'group',
    });
    expect(FlowResult.parse({ status: 'failed', reason: 'token.audience' })).toEqual({
      status: 'failed',
      reason: 'token.audience',
    });
  });

  it('carries what a test sign-in showed, with the claims a provider left out as null', () => {
    const result = FlowResult.parse({
      status: 'tested',
      report: {
        subject: 's',
        username: null,
        email: 'me@id.test',
        groups: ['family'],
        admitted: true,
      },
    });

    expect(result.status === 'tested' && result.report.groups).toEqual(['family']);
  });

  it.each(['pending', 'requested', 'emailTaken', 'invitationOnly', 'linked'])(
    'reads %s, which carries nothing else',
    (status) => {
      expect(FlowResult.parse({ status })).toEqual({ status });
    },
  );

  it('refuses a status it does not know and a sign-in with no session', () => {
    expect(FlowResult.safeParse({ status: 'whatever' }).success).toBe(false);
    expect(FlowResult.safeParse({ status: 'signedIn' }).success).toBe(false);
  });
});

describe('a provider', () => {
  it('reads as the admin page shows it', () => {
    expect(ProviderView.parse(provider).live).toBe(true);
  });

  it('saves without the fields only the server decides, and may keep its secret unsaid', () => {
    const input = ProviderInput.parse({ ...provider, id: '', clientSecret: undefined });

    expect(input.id).toBe('');
    expect('live' in input).toBe(false);
    expect('hasSecret' in input).toBe(false);
  });
});

describe('the gate config', () => {
  it('reads the ways in from a server that names them', () => {
    const config = AuthConfig.parse({
      publicUserList: false,
      hasAccounts: true,
      signIn: {
        password: false,
        passkeys: true,
        providers: [{ id: 'p0', label: 'Home', icon: 'key' }],
      },
    });

    expect(config.signIn?.providers[0]?.label).toBe('Home');
  });

  it('reads a server too old to name them, which offers passwords and passkeys', () => {
    const config = AuthConfig.parse({ publicUserList: false, hasAccounts: true });

    expect(config.signIn ?? DEFAULT_SIGN_IN_METHODS).toEqual({
      password: true,
      passkeys: true,
      providers: [],
    });
  });
});
