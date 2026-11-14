import { ProviderId, type SignInAdmin } from '@kromatv/client/sso';
import { describe, expect, it } from 'vitest';
import {
  emptyProvider,
  isDirty,
  markOf,
  moved,
  presetOf,
  presetPatch,
  providersOf,
  reasonKey,
  type SignInForm,
  toForm,
  toSave,
} from '#web/features/admin/sign-in-form';
import { fixturePreset, PRESETS } from '#web/features/admin/sign-in-presets.fixture';

const config: SignInAdmin = {
  redirectUris: ['https://kroma.example/api/auth/sso/callback'],
  presets: PRESETS,
  methods: [
    { kind: 'password', id: 'password', enabled: true },
    { kind: 'passkey', id: 'passkey', enabled: false },
    {
      kind: 'oidc',
      id: ProviderId.parse('p0'),
      enabled: true,
      label: 'Home',
      preset: 'keycloak',
      icon: 'home',
      issuer: 'https://id.example',
      clientId: 'kroma',
      hasSecret: true,
      scopes: ['offline_access', 'custom'],
      groupClaim: 'groups',
      requiredGroups: ['Family members', 'admins'],
      newPeople: 'ask',
      permissions: ['playback'],
      libraries: null,
      tested: true,
      live: true,
      fromEnv: false,
    },
  ],
};

function relabelled(form: SignInForm, label: string): SignInForm {
  return {
    methods: form.methods.map((m) => (m.kind === 'oidc' ? { ...m, label, live: false } : m)),
  };
}

describe('the sign-in form', () => {
  it('keeps the methods in the order the server gave them', () => {
    expect(toForm(config).methods.map((m) => m.kind)).toEqual(['password', 'passkey', 'oidc']);
    expect(toSave(toForm(config)).methods.slice(0, 2)).toEqual([
      { kind: 'password', enabled: true },
      { kind: 'passkey', enabled: false },
    ]);
  });

  it('shows the two lists as the text an admin would type', () => {
    const provider = providersOf(toForm(config))[0];

    expect(provider?.scopes).toEqual(['offline_access', 'custom']);
    expect(provider?.requiredGroups).toEqual(['Family members', 'admins']);
    expect(provider?.clientSecret).toBe('');
  });

  it('saves back what it was given, and says nothing of a secret nobody typed', () => {
    const saved = toSave(toForm(config)).methods[2];

    expect(saved).toMatchObject({
      kind: 'oidc',
      preset: 'keycloak',
      scopes: ['offline_access', 'custom'],
      requiredGroups: ['Family members', 'admins'],
    });
    expect(saved && 'clientSecret' in saved).toBe(false);
    expect(saved && 'live' in saved).toBe(false);
    expect(saved && 'image' in saved).toBe(false);
  });

  it('sends a secret once one is typed', () => {
    const form = toForm(config);
    const typed: SignInForm = {
      methods: form.methods.map((m) => (m.kind === 'oidc' ? { ...m, clientSecret: 'new' } : m)),
    };

    expect(toSave(typed).methods[2]).toMatchObject({ clientSecret: 'new' });
  });

  it('is dirty once something that saves has changed, and not for what does not', () => {
    const saved = toForm(config);

    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty(relabelled(saved, 'Work'), saved)).toBe(true);
    expect(isDirty(relabelled(saved, ' Home '), saved)).toBe(false);
    expect(isDirty({ methods: moved(saved.methods, 2, -1) }, saved)).toBe(true);
  });

  it('starts a new provider asking an admin first, enabled, with no id', () => {
    const fresh = emptyProvider('draft-0');

    expect(fresh.id).toBe('');
    expect(fresh.newPeople).toBe('invite');
    expect(fresh.enabled).toBe(true);
    expect(fresh.permissions).toEqual(['playback']);
  });

  it('starts a provider picked from a preset with everything the preset fills', () => {
    const entra = emptyProvider('draft-0', fixturePreset('entra'));

    expect(entra).toMatchObject({
      preset: 'entra',
      label: 'Microsoft',
      icon: 'brand-windows',
      issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
      scopes: ['offline_access'],
      groupClaim: 'roles',
    });
  });
});

describe('moving a method', () => {
  const methods = toForm(config).methods;
  const kinds = (list: typeof methods) => list.map((m) => m.kind);

  it('swaps it with its neighbour', () => {
    expect(kinds(moved(methods, 2, -1))).toEqual(['password', 'oidc', 'passkey']);
    expect(kinds(moved(methods, 0, 1))).toEqual(['passkey', 'password', 'oidc']);
  });

  it('leaves the list alone at either end', () => {
    expect(kinds(moved(methods, 0, -1))).toEqual(kinds(methods));
    expect(kinds(moved(methods, 2, 1))).toEqual(kinds(methods));
  });
});

describe('a preset', () => {
  it('is found by its id, with its mark', () => {
    expect(presetOf(PRESETS, 'google')?.name).toBe('Google');
    expect(markOf(PRESETS, 'google')).toBe('/api/auth/logos/google/light.png?v=1');
  });

  it('is nothing for an id the server does not know and for no id', () => {
    expect(presetOf(PRESETS, 'zitadel')).toBeUndefined();
    expect(markOf(PRESETS, 'zitadel')).toBeNull();
    expect(markOf(PRESETS, '')).toBeNull();
  });
});

describe('choosing another preset', () => {
  const keycloak = fixturePreset('keycloak');
  const entra = fixturePreset('entra');

  it('fills every field the admin has not made their own', () => {
    const untouched = emptyProvider('k', keycloak);

    expect(presetPatch(untouched, keycloak, entra)).toEqual({
      preset: 'entra',
      icon: 'brand-windows',
      label: 'Microsoft',
      issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
      groupClaim: 'roles',
      scopes: ['offline_access'],
    });
  });

  it('keeps what the admin typed', () => {
    const typed = {
      ...emptyProvider('k', keycloak),
      label: 'Work',
      issuer: 'https://sso.work.test/realms/staff',
      groupClaim: 'teams',
      scopes: ['custom'],
    };

    expect(presetPatch(typed, keycloak, entra)).toEqual({ preset: 'entra', icon: 'brand-windows' });
  });

  it('fills a form that was started with no preset', () => {
    const patch = presetPatch(emptyProvider('k'), undefined, keycloak);

    expect(patch.label).toBe('Keycloak');
    expect(patch.issuer).toBe('https://auth.example.com/realms/REALM');
  });

  it('clears the address the preset gave when the admin picks none, and keeps the name', () => {
    const patch = presetPatch(emptyProvider('k', keycloak), keycloak, undefined);

    expect(patch).toEqual({
      preset: '',
      icon: 'key',
      issuer: '',
      groupClaim: 'groups',
      scopes: [],
    });
  });

  it('never moves the address of a provider from the environment', () => {
    const fromEnv = { ...emptyProvider('k'), fromEnv: true };

    expect(presetPatch(fromEnv, undefined, entra).issuer).toBeUndefined();
  });
});

describe('reasonKey', () => {
  it('names the message of a failure the page has words for', () => {
    expect(reasonKey('token.audience')).toBe('sso.reason.token.audience');
    expect(reasonKey('discovery.algorithm')).toBe('sso.reason.discovery.algorithm');
  });

  it('has no words for a code it does not know', () => {
    expect(reasonKey('exchange.server_error')).toBeNull();
    expect(reasonKey('')).toBeNull();
  });
});
