import type { Permission } from '@kromatv/client/accounts';
import type { LibraryId } from '@kromatv/client/media';
import type {
  MethodInput,
  MethodView,
  NewPeople,
  ProviderId,
  SignInAdmin,
  SignInSave,
} from '@kromatv/client/sso';
import type { MessageKey } from '@kromatv/i18n';
import type { IconName } from '@kromatv/ui/kit';

/** A built-in method while the admin edits it: only its switch and its place
 * in the list can change. */
export interface BuiltInForm {
  kind: 'password' | 'passkey';
  key: string;
  enabled: boolean;
}

/** A provider while the admin edits it. `id` is the server's, blank until
 * saved; `key` is this page's own handle. The two lists are kept as the text
 * being typed, and `clientSecret` is blank unless a new one was typed. */
export interface ProviderForm {
  kind: 'oidc';
  key: string;
  id: ProviderId | '';
  enabled: boolean;
  label: string;
  preset: string;
  icon: string;
  image: string | null;
  hasImage: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  hasSecret: boolean;
  scopes: string;
  groupClaim: string;
  requiredGroups: string;
  newPeople: NewPeople;
  permissions: Permission[];
  libraries: LibraryId[] | null;
  tested: boolean;
  live: boolean;
  fromEnv: boolean;
}

export type MethodForm = BuiltInForm | ProviderForm;

/** The methods in the order the sign-in screen offers them. */
export interface SignInForm {
  methods: MethodForm[];
}

/** A provider KROMA knows by name. A preset gives the button its logo and the
 * form its example address; it changes nothing about how the provider is
 * spoken to. `note` is said only for a provider that was run against KROMA. */
export interface ProviderPreset {
  id: string;
  name: string;
  icon: IconName;
  /** Whether the server has a logo for it. */
  logo: boolean;
  issuer: string;
  note?: MessageKey;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'keycloak',
    name: 'Keycloak',
    icon: 'key',
    logo: true,
    issuer: 'https://auth.example.com/realms/home',
    note: 'admin.signInPresetKeycloak',
  },
  {
    id: 'authentik',
    name: 'Authentik',
    icon: 'key',
    logo: true,
    issuer: 'https://auth.example.com/application/o/kroma/',
    note: 'admin.signInPresetAuthentik',
  },
  {
    id: 'entra',
    name: 'Microsoft Entra ID',
    icon: 'brand-windows',
    logo: true,
    issuer: 'https://login.microsoftonline.com/TENANT_ID/v2.0',
  },
  {
    id: 'google',
    name: 'Google',
    icon: 'brand-google',
    logo: true,
    issuer: 'https://accounts.google.com',
  },
  { id: 'okta', name: 'Okta', icon: 'key', logo: true, issuer: 'https://example.okta.com' },
  { id: 'auth0', name: 'Auth0', icon: 'key', logo: true, issuer: 'https://example.auth0.com/' },
  {
    id: 'authelia',
    name: 'Authelia',
    icon: 'shield-lock',
    logo: true,
    issuer: 'https://auth.example.com',
  },
  {
    id: 'pocket-id',
    name: 'Pocket ID',
    icon: 'fingerprint',
    logo: false,
    issuer: 'https://id.example.com',
  },
];

export function presetOf(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** The picture a provider's button shows on this page: its own, else its
 * preset's logo, which a provider not saved yet can already wear. */
export function pictureOf(provider: ProviderForm): string | null {
  if (provider.hasImage) return provider.image;
  return presetOf(provider.preset)?.logo ? `/api/auth/logos/${provider.preset}` : null;
}

/** The icons a provider's button can carry when it has no picture. */
export const PROVIDER_ICONS: readonly { icon: IconName; labelKey: MessageKey }[] = [
  { icon: 'key', labelKey: 'admin.signInIconKey' },
  { icon: 'shield-lock', labelKey: 'admin.signInIconShield' },
  { icon: 'home', labelKey: 'admin.signInIconHome' },
  { icon: 'users', labelKey: 'admin.signInIconFamily' },
  { icon: 'building', labelKey: 'admin.signInIconWork' },
  { icon: 'cloud', labelKey: 'admin.signInIconCloud' },
  { icon: 'fingerprint', labelKey: 'admin.signInIconFingerprint' },
  { icon: 'id', labelKey: 'admin.signInIconBadge' },
];

function fromView(method: MethodView): MethodForm {
  if (method.kind !== 'oidc') {
    return { kind: method.kind, key: method.kind, enabled: method.enabled };
  }
  return {
    ...method,
    key: `provider-${method.id}`,
    image: method.image ?? null,
    clientSecret: '',
    scopes: method.scopes.join(' '),
    requiredGroups: method.requiredGroups.join(', '),
  };
}

export function toForm(config: SignInAdmin): SignInForm {
  return { methods: config.methods.map(fromView) };
}

/** A new provider, shaped by the preset the admin picked. */
export function emptyProvider(key: string, preset = ''): ProviderForm {
  const known = presetOf(preset);
  return {
    kind: 'oidc',
    key,
    id: '',
    enabled: true,
    label: known?.name ?? '',
    preset,
    icon: known?.icon ?? 'key',
    image: null,
    hasImage: false,
    issuer: '',
    clientId: '',
    clientSecret: '',
    hasSecret: false,
    scopes: '',
    groupClaim: 'groups',
    requiredGroups: '',
    newPeople: 'ask',
    permissions: ['playback'],
    libraries: null,
    tested: false,
    live: false,
    fromEnv: false,
  };
}

/** `methods` with the one at `from` moved one place up or down. The same
 * list when that would take it past either end. */
export function moved(methods: readonly MethodForm[], from: number, by: -1 | 1): MethodForm[] {
  const to = from + by;
  const next = [...methods];
  const [taken] = next.splice(from, 1);
  if (!taken || to < 0 || to >= methods.length) return [...methods];
  next.splice(to, 0, taken);
  return next;
}

export function providersOf(form: SignInForm): ProviderForm[] {
  return form.methods.filter((method) => method.kind === 'oidc');
}

/** Scopes are separated by spaces, as OAuth writes them. */
export function scopeList(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Groups are separated by commas or new lines: a group's name may hold a
 * space. */
export function groupList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((group) => group.trim())
    .filter(Boolean);
}

function toInput(method: MethodForm): MethodInput {
  if (method.kind !== 'oidc') return { kind: method.kind, enabled: method.enabled };
  return {
    kind: 'oidc',
    id: method.id,
    enabled: method.enabled,
    label: method.label.trim(),
    preset: method.preset,
    icon: method.icon,
    issuer: method.issuer.trim(),
    clientId: method.clientId.trim(),
    scopes: scopeList(method.scopes),
    groupClaim: method.groupClaim.trim(),
    requiredGroups: groupList(method.requiredGroups),
    newPeople: method.newPeople,
    permissions: method.permissions,
    libraries: method.libraries,
    ...(method.clientSecret ? { clientSecret: method.clientSecret } : {}),
  };
}

export function toSave(form: SignInForm): SignInSave {
  return { methods: form.methods.map(toInput) };
}

/** Whether `form` would save anything `saved` does not already hold. */
export function isDirty(form: SignInForm, saved: SignInForm): boolean {
  return JSON.stringify(toSave(form)) !== JSON.stringify(toSave(saved));
}

const KNOWN_REASONS = new Set([
  'discovery.address',
  'discovery.unreachable',
  'discovery.noDocument',
  'discovery.unreadable',
  'discovery.issuerMismatch',
  'discovery.endpoint',
  'discovery.noKeys',
  'discovery.algorithm',
  'exchange.unreachable',
  'exchange.invalid_client',
  'exchange.invalid_grant',
  'exchange.noIdToken',
  'token.algorithm',
  'token.audience',
  'token.issuer',
  'token.signature',
  'token.unknownKey',
  'token.expired',
  'token.nonce',
  'provider.access_denied',
  'provider.changed',
]);

/** The message key for a failure code the server named, or `null` for one
 * this page has no words for. */
export function reasonKey(reason: string): MessageKey | null {
  return KNOWN_REASONS.has(reason) ? (`sso.reason.${reason}` as MessageKey) : null;
}
