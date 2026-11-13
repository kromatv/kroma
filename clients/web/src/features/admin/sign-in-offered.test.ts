import { describe, expect, it } from 'vitest';
import {
  emptyProvider,
  type ProviderForm,
  type SignInForm,
} from '#web/features/admin/sign-in-form';
import { offeredBy, passwordIsNeeded, waitingProviders } from '#web/features/admin/sign-in-offered';
import { fixturePreset, PRESETS } from '#web/features/admin/sign-in-presets.fixture';

const CATALOG = PRESETS;

function provider(key: string, change: Partial<ProviderForm> = {}): ProviderForm {
  return { ...emptyProvider(key, fixturePreset('keycloak')), ...change };
}

function formOf(...providers: ProviderForm[]): SignInForm {
  return {
    methods: [
      ...providers,
      { kind: 'password', key: 'password', enabled: true },
      { kind: 'passkey', key: 'passkey', enabled: false },
    ],
  };
}

describe('what a form offers', () => {
  it('is every method that is on, in the order of the form', () => {
    const offered = offeredBy(formOf(provider('a')), CATALOG);

    expect(offered.methods.map((method) => method.kind)).toEqual(['oidc', 'password']);
  });

  it("gives a provider its preset's mark and look", () => {
    const [button] = offeredBy(formOf(provider('a')), CATALOG).methods;

    expect(button).toMatchObject({
      id: 'a',
      label: 'Keycloak',
      image: '/api/auth/logos/keycloak/mark.svg?v=1',
      brand: { dark: { fill: '#4d4d4d', ink: '#ffffff' } },
    });
  });

  it('gives a provider with no preset neither', () => {
    const plain = { ...emptyProvider('a'), label: 'Home' };

    const [button] = offeredBy(formOf(plain), CATALOG).methods;

    expect(button?.image).toBeUndefined();
    expect(button?.brand).toBeUndefined();
  });

  it('calls a provider with no name yet by the name it is given', () => {
    const unnamed = { ...emptyProvider('a'), label: '  ' };

    const [button] = offeredBy(formOf(unnamed), CATALOG, 'New provider').methods;

    expect(button?.label).toBe('New provider');
  });

  it('leaves out a provider that is off', () => {
    const offered = offeredBy(formOf(provider('a', { enabled: false })), CATALOG);

    expect(offered.methods.map((method) => method.kind)).toEqual(['password']);
  });
});

describe('the providers still waiting', () => {
  it('are the ones that are on and not live', () => {
    const form = formOf(
      provider('live', { live: true }),
      provider('untested'),
      provider('off', { enabled: false }),
    );

    expect(waitingProviders(form).map((waiting) => waiting.key)).toEqual(['untested']);
  });
});

describe('the password', () => {
  it('is needed until a provider is on and live', () => {
    expect(passwordIsNeeded(formOf())).toBe(true);
    expect(passwordIsNeeded(formOf(provider('a')))).toBe(true);
    expect(passwordIsNeeded(formOf(provider('a', { live: true, enabled: false })))).toBe(true);
    expect(passwordIsNeeded(formOf(provider('a', { live: true })))).toBe(false);
  });
});
