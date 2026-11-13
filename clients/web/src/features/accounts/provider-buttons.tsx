import type { SignInButton } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Button, hasGlyph } from '@kromatv/ui/kit';

/** One "Continue with …" button per provider. With `primary`, the first one
 * is the screen's main action. */
export function ProviderButtons({
  providers,
  primary = false,
  disabled = false,
  onPick,
}: Readonly<{
  providers: readonly SignInButton[];
  primary?: boolean;
  disabled?: boolean;
  onPick: (provider: SignInButton) => void;
}>) {
  const t = useT();
  return providers.map((provider, index) => (
    <Button
      key={provider.id}
      block
      size="md"
      variant={primary && index === 0 ? 'primary' : 'glass'}
      icon={hasGlyph(provider.icon) ? provider.icon : 'key'}
      label={t('auth.continueWith', { provider: provider.label })}
      disabled={disabled}
      onPress={() => onPick(provider)}
    />
  ));
}
