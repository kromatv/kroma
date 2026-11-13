import type { SignInMethods } from '@kromatv/client/accounts';
import {
  type PresetCatalog,
  type ProviderForm,
  presetOf,
  providersOf,
  type SignInForm,
} from '#web/features/admin/sign-in-form';

/** What the sign-in screen offers once `form` is saved and each of its
 * providers is live: every method that is on, in the form's order, a provider
 * wearing its preset's mark and look. A provider not named yet reads
 * `untitled`. */
export function offeredBy(form: SignInForm, catalog: PresetCatalog, untitled = ''): SignInMethods {
  return {
    methods: form.methods
      .filter((method) => method.enabled)
      .map((method) => {
        if (method.kind !== 'oidc') return { id: method.kind, kind: method.kind };
        const preset = presetOf(catalog, method.preset);
        return {
          id: method.id || method.key,
          kind: 'oidc',
          label: method.label.trim() || untitled,
          icon: method.icon,
          image: preset?.logo,
          brand: preset?.brand,
        };
      }),
  };
}

/** The providers that are on but that the sign-in screen leaves out until a
 * test sign-in passes. */
export function waitingProviders(form: SignInForm): ProviderForm[] {
  return providersOf(form).filter((provider) => provider.enabled && !provider.live);
}

/** Whether turning passwords off would leave nobody new able to come in: the
 * server refuses it while no provider is live. */
export function passwordIsNeeded(form: SignInForm): boolean {
  return !providersOf(form).some((provider) => provider.enabled && provider.live);
}
