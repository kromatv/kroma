import type { KromaClient } from '@kromatv/client';
import {
  type AuthResult,
  DEFAULT_SIGN_IN_METHODS,
  type InviteToken,
  type SignInMethods,
  type WebAuthnCredential,
  type WebAuthnOptions,
} from '@kromatv/client/accounts';
import type {
  FlowId,
  FlowKeys,
  FlowResult,
  FlowReturn,
  FlowStarted,
  ProviderId,
} from '@kromatv/client/sso';

/** What a flow through a provider is for: signing in, adding the provider to
 * the signed-in account, or an admin trying a provider out. */
export type FlowPurpose = 'signIn' | 'link' | 'test';

/** The half of a flow a client keeps while the person is at the provider. */
export interface PendingFlow {
  flowId: FlowId;
  secret: string;
  purpose: FlowPurpose;
  provider: ProviderId;
  /** Where in the client the person was, to put them back there. */
  returnTo: string;
}

/** Where a client keeps its one pending flow. A web page keeps it in the tab,
 * because the tab itself goes to the provider; an app keeps it in memory. */
export interface FlowStore {
  save(flow: PendingFlow): void;
  /** The pending flow, when it is the one `flowId` names. */
  load(flowId: string): PendingFlow | null;
  clear(): void;
}

/** How a shell takes a person to a provider and back. */
export interface FlowBrowser {
  /** Sends the person to `url`. An app's browser resolves with the address it
   * came back on, or `null` when it closed with none. The flow is kept either
   * way: on some systems the return reaches the app as a link after the
   * browser has reported itself closed, and `resume` then collects it. A web
   * page that leaves for the provider never resolves, and resumes on return. */
  open(url: string): Promise<string | null>;
  /** What to tell the server about coming back. A web page leaves it out. */
  from?: FlowReturn;
}

/** How a flow ended, with what it was for and the keys that collected it. A
 * result that left an identity waiting can still be claimed with `keys`. */
export interface FlowEnd {
  purpose: FlowPurpose;
  provider: ProviderId;
  returnTo: string;
  keys: FlowKeys;
  result: FlowResult;
}

export interface AuthOptions {
  client: KromaClient;
  browser: FlowBrowser;
  store: FlowStore;
  /** Runs the platform's passkey prompt. Left out where there is none. */
  passkey?: (options: WebAuthnOptions) => Promise<WebAuthnCredential>;
}

export interface ProviderFlowOptions {
  /** Where in the client to come back to. Defaults to `/`. */
  returnTo?: string;
  /** The invitation the person arrived on, for a sign-in. */
  invite?: InviteToken;
}

function waits(result: FlowResult): boolean {
  return (
    result.status === 'requested' ||
    result.status === 'emailTaken' ||
    result.status === 'invitationOnly'
  );
}

function keysIn(address: string): { flow: string; code: string } | null {
  const query = address.includes('?') ? address.slice(address.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query.split('#')[0]);
  const flow = params.get('flow');
  const code = params.get('code');
  return flow && code ? { flow, code } : null;
}

/** Every way to sign in to a server, behind one object. The shell supplies
 * how it opens a browser and where it keeps a pending flow, and everything
 * else is the same on the web, a phone and a television. */
export function createAuth({ client, browser, store, passkey }: AuthOptions) {
  const collecting = new Map<string, Promise<FlowEnd | null>>();

  /** Collects the flow the address `address` (or its two query values) names.
   * `null` when this client did not begin that flow: the address was opened
   * somewhere else. An outcome is given once, so two callers resuming the
   * same flow at the same time share one answer. */
  function resume(address: string | { flow: string; code: string }): Promise<FlowEnd | null> {
    const named = typeof address === 'string' ? keysIn(address) : address;
    if (!named) return Promise.resolve(null);
    const shared = collecting.get(named.flow);
    if (shared) return shared;
    const answer = collect(named).finally(() => collecting.delete(named.flow));
    collecting.set(named.flow, answer);
    return answer;
  }

  async function collect(named: { flow: string; code: string }): Promise<FlowEnd | null> {
    const pending = store.load(named.flow);
    if (!pending) return null;
    const keys: FlowKeys = { flowId: pending.flowId, secret: pending.secret, code: named.code };
    try {
      const result = await client.sso.finish(keys);
      if (!waits(result)) store.clear();
      return {
        purpose: pending.purpose,
        provider: pending.provider,
        returnTo: pending.returnTo,
        keys,
        result,
      };
    } catch (error) {
      store.clear();
      throw error;
    }
  }

  async function through(
    purpose: FlowPurpose,
    provider: ProviderId,
    begin: () => Promise<FlowStarted>,
    options: ProviderFlowOptions,
  ): Promise<FlowEnd | null> {
    const started = await begin();
    store.save({
      flowId: started.flowId,
      secret: started.secret,
      purpose,
      provider,
      returnTo: options.returnTo ?? '/',
    });
    const back = await browser.open(started.authorizeUrl);
    return back === null ? null : resume(back);
  }

  return {
    /** The ways in this server offers, in the order to draw them. */
    methods: async (): Promise<SignInMethods> =>
      (await client.accounts.config()).signIn ?? DEFAULT_SIGN_IN_METHODS,

    signIn: {
      password: (identifier: string, password: string): Promise<AuthResult> =>
        client.accounts.login(identifier, password),

      /** Rejects when the shell gave no passkey prompt. */
      passkey: async (): Promise<AuthResult> => {
        if (!passkey) throw new Error('this shell has no passkey prompt');
        const { ceremonyId, options } = await client.accounts.passkeys.authStart();
        const credential = await passkey(options);
        return client.accounts.passkeys.authFinish({ ceremonyId, credential });
      },

      /** Signs in through `provider`. `null` when the browser closed with no
       * return. Read `result.status`: only `signedIn` carries a session. */
      with: (provider: ProviderId, options: ProviderFlowOptions = {}) =>
        through(
          'signIn',
          provider,
          () => client.sso.start(provider, { invite: options.invite, from: browser.from }),
          options,
        ),
    },

    /** Adds `provider` to the signed-in account. */
    link: (provider: ProviderId, options: ProviderFlowOptions = {}) =>
      through('link', provider, () => client.sso.link(provider, browser.from), options),

    /** Runs an admin's test sign-in at a saved provider. */
    test: (provider: ProviderId, options: ProviderFlowOptions = {}) =>
      through('test', provider, () => client.sso.test(provider), options),

    resume,

    /** Links the identity a flow left waiting to the signed-in account. */
    claim: async (keys: FlowKeys): Promise<void> => {
      await client.sso.claim(keys);
      store.clear();
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;

/** A store for a shell whose app stays open while the person is at the
 * provider, which is every shell but a web page. */
export function memoryFlowStore(): FlowStore {
  let pending: PendingFlow | null = null;
  return {
    save: (flow) => {
      pending = flow;
    },
    load: (flowId) => (pending?.flowId === flowId ? pending : null),
    clear: () => {
      pending = null;
    },
  };
}
