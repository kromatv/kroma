import type { SignInButton } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Button, hasGlyph, styles, Text, typeSpec as textRoles, useStyles } from '@kromatv/ui/kit';
import { ProviderMark } from '#web/shared/ui/provider-mark';

const sDefinition = styles({ label: { fontSize: textRoles.body.size, fontWeight: '700' } });

/** A provider's "Continue with …" button, wearing its picture in front of its
 * name, or its icon when it has none. `primary` makes it the screen's main
 * action. */
export function ProviderButton({
  provider,
  primary = false,
  disabled = false,
  onPress,
}: Readonly<{
  provider: SignInButton;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const label = t('auth.continueWith', { provider: provider.label });
  const variant = primary ? 'primary' : 'glass';
  if (!provider.image) {
    return (
      <Button
        block
        size="md"
        variant={variant}
        icon={hasGlyph(provider.icon) ? provider.icon : 'key'}
        label={label}
        disabled={disabled}
        onPress={onPress}
      />
    );
  }
  return (
    <Button block size="md" variant={variant} disabled={disabled} onPress={onPress}>
      <ProviderMark icon={provider.icon} image={provider.image} size={24} />
      <Text variant="label" color={primary ? 'accentInk' : 'text'} style={s.label}>
        {label}
      </Text>
    </Button>
  );
}
