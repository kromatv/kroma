import { z } from 'zod';
import { AuthResult, Permission, User } from '../accounts/schemas';
import { LibraryId } from '../media/ids';
import { FlowId, IdentityId, JoinRequestId, ProviderId } from './ids';

/** The path, under an origin, a provider is given as the server's redirect URI. */
export const SSO_CALLBACK_PATH = '/api/auth/sso/callback';

/** What a start returns. The client keeps `flowId` and `secret` and sends the
 * person to `authorizeUrl`. */
export const FlowStarted = z.object({
  flowId: FlowId,
  secret: z.string(),
  authorizeUrl: z.string(),
  expiresInSec: z.number(),
});
export type FlowStarted = z.infer<typeof FlowStarted>;

/** What a client that is not a browser page says when it starts a flow: the
 * server address it is talking to, and that it wants to come back on the
 * app's own scheme. A browser page says nothing. */
export interface FlowReturn {
  returnTo: 'app';
  origin: string;
}

/** The two halves that collect a flow: the secret its start returned and the
 * code its redirect carried. */
export interface FlowKeys {
  flowId: FlowId;
  secret: string;
  code: string;
}

/** What a test sign-in showed an admin about the person who made it. */
export const TestReport = z.object({
  subject: z.string(),
  username: z.string().nullish(),
  email: z.string().nullish(),
  name: z.string().nullish(),
  groups: z.array(z.string()),
  /** Whether this person passes the provider's required groups. */
  admitted: z.boolean(),
});
export type TestReport = z.infer<typeof TestReport>;

/** How a flow ended. `requested`, `emailTaken` and `invitationOnly` leave an
 * identity an account can still claim. */
export const FlowResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  AuthResult.extend({ status: z.literal('signedIn') }),
  z.object({ status: z.literal('requested') }),
  z.object({ status: z.literal('emailTaken') }),
  z.object({ status: z.literal('invitationOnly') }),
  z.object({ status: z.literal('refused'), reason: z.string() }),
  z.object({ status: z.literal('failed'), reason: z.string() }),
  z.object({ status: z.literal('linked') }),
  z.object({ status: z.literal('tested'), report: TestReport }),
]);
export type FlowResult = z.infer<typeof FlowResult>;

/** One provider identity from `GET /auth/me/identities`. */
export const IdentityInfo = z.object({
  id: IdentityId,
  provider: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastUsed: z.string().nullish(),
});
export type IdentityInfo = z.infer<typeof IdentityInfo>;

/** What happens to a person a provider vouches for and the server has never
 * seen: an admin approves them, they get an account at once, or they need an
 * invitation. */
export const NewPeople = z.enum(['ask', 'create', 'invite']);
export type NewPeople = z.infer<typeof NewPeople>;

/** A provider as the admin page reads it. The secret never travels: `hasSecret`
 * says one is stored, and `live` that people can sign in with the provider. */
export const ProviderView = z.object({
  kind: z.literal('oidc'),
  id: ProviderId,
  enabled: z.boolean(),
  label: z.string(),
  /** Which known provider this is (`keycloak`, `authentik`, ...), or blank. */
  preset: z.string(),
  icon: z.string(),
  /** A server path to the button's picture, when it has one. */
  image: z.string().nullish(),
  /** Whether that picture is one an admin uploaded. */
  hasImage: z.boolean(),
  issuer: z.string(),
  clientId: z.string(),
  hasSecret: z.boolean(),
  scopes: z.array(z.string()),
  groupClaim: z.string(),
  requiredGroups: z.array(z.string()),
  newPeople: NewPeople,
  permissions: z.array(Permission),
  /** `null` is every library. */
  libraries: z.array(LibraryId).nullable(),
  tested: z.boolean(),
  live: z.boolean(),
  /** Its connection comes from `KROMA_OIDC_*` and cannot be edited here. */
  fromEnv: z.boolean(),
});
export type ProviderView = z.infer<typeof ProviderView>;

const BuiltInView = z.object({
  kind: z.enum(['password', 'passkey']),
  id: z.string(),
  enabled: z.boolean(),
});

/** One sign-in method as the admin page lists it: a built-in one with its
 * switch, or a provider. */
export const MethodView = z.discriminatedUnion('kind', [BuiltInView, ProviderView]);
export type MethodView = z.infer<typeof MethodView>;

/** A provider as the admin page saves it. A blank `id` is a new provider; a
 * blank or absent `clientSecret` keeps the stored one. */
export const ProviderInput = ProviderView.omit({
  id: true,
  image: true,
  hasImage: true,
  hasSecret: true,
  tested: true,
  live: true,
  fromEnv: true,
}).extend({
  id: z.union([ProviderId, z.literal('')]),
  clientSecret: z.string().optional(),
});
export type ProviderInput = z.infer<typeof ProviderInput>;

/** One method as the admin page saves it. */
export type MethodInput = { kind: 'password' | 'passkey'; enabled: boolean } | ProviderInput;

/** `GET /admin/sign-in`: the methods in the order the sign-in screen offers
 * them. */
export const SignInAdmin = z.object({
  methods: z.array(MethodView),
  /** What to register at a provider as this server's redirect URI, for each
   * origin the operator named. Empty when they named none: the redirect URI is
   * then {@link SSO_CALLBACK_PATH} under whatever origin the browser is on. */
  redirectUris: z.array(z.string()),
});
export type SignInAdmin = z.infer<typeof SignInAdmin>;

/** `PUT /admin/sign-in`. */
export interface SignInSave {
  methods: MethodInput[];
}

/** What reading a provider's address found. `reason` names what failed. */
export const Discovered = z.object({
  ok: z.boolean(),
  issuer: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  reason: z.string().optional(),
});
export type Discovered = z.infer<typeof Discovered>;

/** A person a provider vouched for, waiting for an admin or declined by one. */
export const JoinRequest = z.object({
  id: JoinRequestId,
  username: z.string(),
  email: z.string(),
  name: z.string().nullish(),
  provider: z.string(),
  /** Unix seconds. */
  createdAt: z.number(),
});
export type JoinRequest = z.infer<typeof JoinRequest>;

/** `GET /admin/join-requests`, each list oldest first. */
export const JoinRequests = z.object({
  waiting: z.array(JoinRequest),
  declined: z.array(JoinRequest),
});
export type JoinRequests = z.infer<typeof JoinRequests>;

/** What an admin gives a person whose request they approve. */
export interface JoinApproval {
  username?: string;
  permissions?: Permission[];
  /** `null` or absent is every library. */
  libraries?: LibraryId[] | null;
}

export const JoinApproved = z.object({ user: User });
export type JoinApproved = z.infer<typeof JoinApproved>;
