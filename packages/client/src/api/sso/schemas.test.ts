import { describe, expect, it } from 'vitest';
import {
  AuthConfig,
  DEFAULT_SIGN_IN_METHODS,
  offersSignIn,
  signInButtons,
} from '../accounts/schemas';
import { FlowResult, MethodView, ProviderInput, ProviderView } from './schemas';

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
  kind: 'oidc',
  id: 'p0',
  label: 'Home',
  preset: 'keycloak',
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

  it('is one kind of method beside the two built-in ones', () => {
    expect(MethodView.parse({ kind: 'password', id: 'password', enabled: false })).toEqual({
      kind: 'password',
      id: 'password',
      enabled: false,
    });
    expect(MethodView.parse(provider).kind).toBe('oidc');
    expect(MethodView.safeParse({ kind: 'magic', id: 'x', enabled: true }).success).toBe(false);
  });
});

describe('the gate config', () => {
  const look = { fill: '#4d4d4d', ink: '#ffffff', logo: '/api/auth/logos/keycloak-white.svg?v=1' };
  const brand = { dark: look, light: { ...look, stroke: '#747775' } };
  const offered = {
    methods: [
      {
        id: 'p0',
        kind: 'oidc',
        label: 'Home',
        icon: 'key',
        image: '/api/auth/logos/keycloak.svg?v=1',
        brand,
      },
      { id: 'passkey', kind: 'passkey' },
      { id: 'future', kind: 'magic-link' },
    ],
  };

  it('reads the ways in from a server that names them, in its order', () => {
    const config = AuthConfig.parse({ publicUserList: false, hasAccounts: true, signIn: offered });
    const methods = config.signIn ?? DEFAULT_SIGN_IN_METHODS;

    expect(signInButtons(methods)).toEqual([
      {
        id: 'p0',
        label: 'Home',
        icon: 'key',
        image: '/api/auth/logos/keycloak.svg?v=1',
        brand,
      },
    ]);
    expect(offersSignIn(methods, 'passkey')).toBe(true);
    expect(offersSignIn(methods, 'password')).toBe(false);
  });

  it('drops a look it cannot paint and keeps the button', () => {
    const odd = {
      ...offered.methods[0],
      brand: { dark: { ...look, fill: 'url(x)' }, light: look },
    };
    const config = AuthConfig.parse({
      publicUserList: false,
      hasAccounts: true,
      signIn: { methods: [odd] },
    });

    const [button] = signInButtons(config.signIn ?? DEFAULT_SIGN_IN_METHODS);

    expect(button?.label).toBe('Home');
    expect(button?.brand).toBeUndefined();
  });

  it('keeps a kind it does not know, for a client that will', () => {
    const config = AuthConfig.parse({ publicUserList: false, hasAccounts: true, signIn: offered });

    expect(config.signIn?.methods[2]).toEqual({ id: 'future', kind: 'magic-link' });
  });

  it('reads a server too old to name them, which offers passwords and passkeys', () => {
    const config = AuthConfig.parse({ publicUserList: false, hasAccounts: true });
    const methods = config.signIn ?? DEFAULT_SIGN_IN_METHODS;

    expect(offersSignIn(methods, 'password')).toBe(true);
    expect(offersSignIn(methods, 'passkey')).toBe(true);
    expect(signInButtons(methods)).toEqual([]);
  });
});
