import type { SignInButton } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Button, hasGlyph, styles, Text, typeSpec as textRoles, useStyles } from '@kromatv/ui/kit';
import { useButtonLook } from '#web/shared/lib/use-button-look';
import { ProviderMark } from '#web/shared/ui/provider-mark';

const sDefinition = styles({ label: { fontSize: textRoles.body.size, fontWeight: '700' } });

/** A provider's "Continue with …" button. One whose owner says how its button
 * looks is painted that way, on a dark ground and on a light one: Google's and
 * Microsoft's follow their published guidelines. Any other wears its mark or
 * its icon on the screen's own button, and `primary` makes that one the
 * screen's main action. */
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
  const branded = useButtonLook(provider.brand);
  const label = t('auth.continueWith', { provider: provider.label });
  const variant = primary ? 'primary' : 'glass';
  if (branded) {
    return (
      <Button
        block
        size="md"
        variant="primary"
        style={branded.surface}
        disabled={disabled}
        onPress={onPress}
      >
        <ProviderMark icon={provider.icon} image={branded.look.logo} size={20} plain />
        <Text variant="label" style={[s.label, branded.ink]}>
          {label}
        </Text>
      </Button>
    );
  }
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
