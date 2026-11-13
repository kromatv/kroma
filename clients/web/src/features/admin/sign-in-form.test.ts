import { ProviderId, type SignInAdmin } from '@kromatv/client/sso';
import { describe, expect, it } from 'vitest';
import {
  emptyProvider,
  groupList,
  isDirty,
  moved,
  pictureOf,
  providersOf,
  reasonKey,
  type SignInForm,
  scopeList,
  toForm,
  toSave,
} from '#web/features/admin/sign-in-form';

const config: SignInAdmin = {
  redirectUris: ['https://kroma.example/api/auth/sso/callback'],
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
      image: '/api/auth/logos/keycloak',
      hasImage: false,
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

    expect(provider?.scopes).toBe('offline_access custom');
    expect(provider?.requiredGroups).toBe('Family members, admins');
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
    expect(fresh.newPeople).toBe('ask');
    expect(fresh.enabled).toBe(true);
    expect(fresh.permissions).toEqual(['playback']);
  });

  it('starts a provider picked from a preset with its name and its icon', () => {
    const entra = emptyProvider('draft-0', 'entra');

    expect(entra.label).toBe('Microsoft Entra ID');
    expect(entra.icon).toBe('brand-windows');
    expect(entra.preset).toBe('entra');
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

describe("a provider's picture", () => {
  it('is the upload when there is one', () => {
    const uploaded = { ...emptyProvider('k', 'keycloak'), hasImage: true, image: '/api/x?v=1' };

    expect(pictureOf(uploaded)).toBe('/api/x?v=1');
  });

  it("is its preset's logo otherwise, even before the provider is saved", () => {
    expect(pictureOf(emptyProvider('k', 'keycloak'))).toBe('/api/auth/logos/keycloak');
  });

  it('is nothing for a preset with no logo and for no preset', () => {
    expect(pictureOf(emptyProvider('k', 'pocket-id'))).toBeNull();
    expect(pictureOf(emptyProvider('k'))).toBeNull();
  });
});

describe('the lists an admin types', () => {
  it('reads scopes separated by any white space', () => {
    expect(scopeList('  offline_access   custom\ngroups ')).toEqual([
      'offline_access',
      'custom',
      'groups',
    ]);
    expect(scopeList('')).toEqual([]);
  });

  it('reads groups separated by commas or lines, keeping the spaces inside a name', () => {
    expect(groupList('Family members, admins\n kids ,')).toEqual([
      'Family members',
      'admins',
      'kids',
    ]);
    expect(groupList(' ')).toEqual([]);
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
