import { DEFAULT_SIGN_IN_METHODS } from '@kromatv/client/accounts';
import { describe, expect, it } from 'vitest';
import { signInLayout } from './layout';

const PROVIDER = { id: 'p_home', kind: 'oidc', label: 'Home', icon: 'key' };

describe('signInLayout', () => {
  it('leads with the password form on a server that lists it first', () => {
    const layout = signInLayout(DEFAULT_SIGN_IN_METHODS);

    expect(layout.lead).toBe('password');
    expect(layout.password).toBe(true);
    expect(layout.presses).toEqual([{ kind: 'passkey', id: 'passkey' }]);
  });

  it('leads with the buttons when a provider comes before the password', () => {
    const layout = signInLayout({
      methods: [PROVIDER, { id: 'password', kind: 'password' }, { id: 'passkey', kind: 'passkey' }],
    });

    expect(layout.lead).toBe('presses');
    expect(layout.presses.map((press) => press.kind)).toEqual(['provider', 'passkey']);
  });

  it('keeps the buttons in the order the server lists them', () => {
    const layout = signInLayout({
      methods: [{ id: 'passkey', kind: 'passkey' }, PROVIDER],
    });

    expect(layout.presses.map((press) => press.id)).toEqual(['passkey', 'p_home']);
    expect(layout.password).toBe(false);
  });

  it('leaves the passkey out for a shell that cannot prompt for one', () => {
    const layout = signInLayout(
      {
        methods: [
          { id: 'passkey', kind: 'passkey' },
          { id: 'password', kind: 'password' },
        ],
      },
      { passkey: false },
    );

    expect(layout.presses).toEqual([]);
    expect(layout.lead).toBe('password');
  });

  it('skips a kind it does not know and a provider with a malformed id', () => {
    const layout = signInLayout({
      methods: [
        { id: 'magic', kind: 'magic-link' },
        { id: '', kind: 'oidc', label: 'Broken' },
        { id: 'password', kind: 'password' },
      ],
    });

    expect(layout.presses).toEqual([]);
    expect(layout.lead).toBe('password');
  });

  it('leads with the buttons on a server that offers nothing it knows', () => {
    expect(signInLayout({ methods: [] })).toEqual({
      presses: [],
      password: false,
      lead: 'presses',
    });
  });
});
