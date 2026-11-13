import type { Permission } from '@kromatv/client/accounts';
import type { LibraryId } from '@kromatv/client/media';
import type {
  NewPeople,
  ProviderId,
  ProviderInput,
  ProviderView,
  SignInAdmin,
  SignInSave,
} from '@kromatv/client/sso';
import type { MessageKey } from '@kromatv/i18n';
import type { IconName } from '@kromatv/ui/kit';

/** A provider while the admin edits it. `id` is the server's, blank until
 * saved; `key` is this page's own handle. The two lists are kept as the text
 * being typed, and `clientSecret` is blank unless a new one was typed. */
export interface ProviderForm {
  key: string;
  id: ProviderId | '';
  label: string;
  icon: string;
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
  enabled: boolean;
  tested: boolean;
  live: boolean;
  fromEnv: boolean;
}

export interface SignInForm {
  password: boolean;
  passkeys: boolean;
  providers: ProviderForm[];
}

/** The icons a provider's button can carry. */
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

function fromView(provider: ProviderView): ProviderForm {
  return {
    ...provider,
    key: `provider-${provider.id}`,
    clientSecret: '',
    scopes: provider.scopes.join(' '),
    requiredGroups: provider.requiredGroups.join(', '),
  };
}

export function toForm(config: SignInAdmin): SignInForm {
  return {
    password: config.password,
    passkeys: config.passkeys,
    providers: config.providers.map(fromView),
  };
}

export function emptyProvider(key: string): ProviderForm {
  return {
    key,
    id: '',
    label: '',
    icon: 'key',
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
    enabled: true,
    tested: false,
    live: false,
    fromEnv: false,
  };
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

function toInput(provider: ProviderForm): ProviderInput {
  return {
    id: provider.id,
    label: provider.label.trim(),
    icon: provider.icon,
    issuer: provider.issuer.trim(),
    clientId: provider.clientId.trim(),
    scopes: scopeList(provider.scopes),
    groupClaim: provider.groupClaim.trim(),
    requiredGroups: groupList(provider.requiredGroups),
    newPeople: provider.newPeople,
    permissions: provider.permissions,
    libraries: provider.libraries,
    enabled: provider.enabled,
    ...(provider.clientSecret ? { clientSecret: provider.clientSecret } : {}),
  };
}

export function toSave(form: SignInForm): SignInSave {
  return {
    password: form.password,
    passkeys: form.passkeys,
    providers: form.providers.map(toInput),
  };
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
