import type { Permission } from '@kromatv/client/accounts';
import type { LibraryId } from '@kromatv/client/media';
import type {
  MethodInput,
  MethodView,
  NewPeople,
  PresetView,
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
 * saved; `key` is this page's own handle, and `clientSecret` is blank unless
 * a new one was typed. */
export interface ProviderForm {
  kind: 'oidc';
  key: string;
  id: ProviderId | '';
  enabled: boolean;
  label: string;
  preset: string;
  icon: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  hasSecret: boolean;
  scopes: string[];
  groupClaim: string;
  requiredGroups: string[];
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

/** Every provider the server knows by name. A preset fills the form for its
 * provider and says how the button looks; it changes nothing about how the
 * provider is spoken to. */
export type PresetCatalog = readonly PresetView[];

/** What is said under the picker for a provider that was run against KROMA. */
export const PRESET_NOTES: Readonly<Record<string, MessageKey>> = {
  authelia: 'admin.signInPresetAuthelia',
  authentik: 'admin.signInPresetAuthentik',
  casdoor: 'admin.signInPresetCasdoor',
  dex: 'admin.signInPresetDex',
  forgejo: 'admin.signInPresetForgejo',
  fusionauth: 'admin.signInPresetFusionauth',
  gitea: 'admin.signInPresetGitea',
  keycloak: 'admin.signInPresetKeycloak',
  logto: 'admin.signInPresetLogto',
  nextcloud: 'admin.signInPresetNextcloud',
  'pocket-id': 'admin.signInPresetPocketId',
  rauthy: 'admin.signInPresetRauthy',
  zitadel: 'admin.signInPresetZitadel',
};

/** The preset `id` names, or `undefined` for a provider with no preset and
 * for a preset the server does not know. */
export function presetOf(catalog: PresetCatalog, id: string): PresetView | undefined {
  return catalog.find((preset) => preset.id === id);
}

/** A server path to the mark of the preset `id`, or `null` when it has none. */
export function markOf(catalog: PresetCatalog, id: string): string | null {
  return presetOf(catalog, id)?.logo ?? null;
}

const DEFAULT_GROUP_CLAIM = 'groups';

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** What choosing the preset `next` changes in `provider`, which `previous`
 * had shaped: the preset itself, and each field still as `previous` left it.
 * A field the admin made their own stays, and so does the address of a
 * provider from the environment. */
export function presetPatch(
  provider: ProviderForm,
  previous: PresetView | undefined,
  next: PresetView | undefined,
): Partial<ProviderForm> {
  const untouched = (value: string, start: string) => !value.trim() || value === start;
  const patch: Partial<ProviderForm> = {
    preset: next?.id ?? '',
    icon: next?.icon ?? provider.icon,
  };
  if (next && untouched(provider.label, previous?.label ?? '')) patch.label = next.label;
  if (!provider.fromEnv && untouched(provider.issuer, previous?.issuer ?? '')) {
    patch.issuer = next?.issuer ?? '';
  }
  if (untouched(provider.groupClaim, previous?.groupClaim ?? DEFAULT_GROUP_CLAIM)) {
    patch.groupClaim = next?.groupClaim ?? DEFAULT_GROUP_CLAIM;
  }
  if (sameList(provider.scopes, previous?.scopes ?? [])) patch.scopes = [...(next?.scopes ?? [])];
  return patch;
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
    clientSecret: '',
  };
}

export function toForm(config: SignInAdmin): SignInForm {
  return { methods: config.methods.map(fromView) };
}

/** A new provider, filled by the preset the admin picked. */
export function emptyProvider(key: string, preset?: PresetView): ProviderForm {
  return {
    kind: 'oidc',
    key,
    id: '',
    enabled: true,
    label: preset?.label ?? '',
    preset: preset?.id ?? '',
    icon: preset?.icon ?? 'key',
    issuer: preset?.issuer ?? '',
    clientId: '',
    clientSecret: '',
    hasSecret: false,
    scopes: [...(preset?.scopes ?? [])],
    groupClaim: preset?.groupClaim ?? DEFAULT_GROUP_CLAIM,
    requiredGroups: [],
    newPeople: 'invite',
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
    scopes: method.scopes,
    groupClaim: method.groupClaim.trim(),
    requiredGroups: method.requiredGroups,
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
