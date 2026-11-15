import { type SignInButton, type SignInMethods, signInButtons } from '@kromatv/client/accounts';

/** A way in that takes one press: a provider's button, or the passkey prompt. */
export type SignInPress =
  | { kind: 'provider'; id: string; provider: SignInButton }
  | { kind: 'passkey'; id: string };

/** How a sign-in screen arranges what a server offers: the one-press ways in
 * as one group, the password form as another, and which of the two the server
 * placed first. The group that leads carries the screen's main action. */
export interface SignInLayout {
  presses: SignInPress[];
  password: boolean;
  lead: 'presses' | 'password';
}

/** Arranges `methods` for a shell. One that cannot prompt for a passkey passes
 * `passkey: false`, and the method is left out. */
export function signInLayout(
  methods: SignInMethods,
  { passkey = true }: Readonly<{ passkey?: boolean }> = {},
): SignInLayout {
  const providers = new Map(signInButtons(methods).map((button) => [button.id as string, button]));
  const presses: SignInPress[] = [];
  let password = false;
  let lead: SignInLayout['lead'] | null = null;
  for (const method of methods.methods) {
    const provider = providers.get(method.id);
    if (method.kind === 'password') {
      password = true;
      lead ??= 'password';
    } else if (method.kind === 'passkey' && passkey) {
      presses.push({ kind: 'passkey', id: method.id });
      lead ??= 'presses';
    } else if (method.kind === 'oidc' && provider) {
      presses.push({ kind: 'provider', id: method.id, provider });
      lead ??= 'presses';
    }
  }
  return { presses, password, lead: lead ?? 'presses' };
}
