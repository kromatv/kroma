import type { SignInButton } from '@kromatv/client/accounts';
import {
  Box,
  Button,
  hasGlyph,
  sharedStyle,
  styles,
  Text,
  useStyleScope,
  useStyles,
} from '@kromatv/ui/kit';
import { Image } from 'expo-image';
import { useT } from '#mobile/lib/i18n';

const MARK = 20;
const TILE = 24;

const sDefinition = styles({
  mark: { width: MARK, height: MARK },
  tiled: { width: '72%', height: '72%' },
  label: { fontWeight: '700' },
});

/** A provider's "Continue with …" button on the phone. One whose owner says
 * how its button looks is painted that way; the gate sits over artwork on the
 * dark ground, so it wears the dark look. Any other shows its mark on a white
 * tile, or its icon, on the screen's own button, and `primary` makes that one
 * the screen's main action. `resolve` turns a server path into an address. */
export function ProviderButton({
  provider,
  primary = false,
  disabled = false,
  loading = false,
  resolve,
  onPress,
}: Readonly<{
  provider: SignInButton;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  resolve: (path: string) => string | null;
  onPress: () => void;
}>) {
  const s = useStyles(sDefinition);
  const scope = useStyleScope();
  const t = useT();
  const label = t('auth.continueWith', { provider: provider.label });
  const variant = primary ? 'primary' : 'glass';
  const look = provider.brand?.dark;
  const branded = look ? resolve(look.logo) : null;
  if (look && branded) {
    const edge = look.stroke ?? look.fill;
    return (
      <Button
        variant="primary"
        style={sharedStyle(
          `provider:surface:${look.fill}:${edge}`,
          { backgroundColor: look.fill, borderWidth: 1, borderColor: edge },
          scope,
        )}
        disabled={disabled}
        loading={loading}
        onPress={onPress}
      >
        <Image source={{ uri: branded }} style={s.mark} contentFit="contain" />
        <Text
          style={[s.label, sharedStyle(`provider:ink:${look.ink}`, { color: look.ink }, scope)]}
        >
          {label}
        </Text>
      </Button>
    );
  }
  const mark = provider.image ? resolve(provider.image) : null;
  if (!mark) {
    return (
      <Button
        variant={variant}
        icon={hasGlyph(provider.icon) ? provider.icon : 'key'}
        label={label}
        disabled={disabled}
        loading={loading}
        onPress={onPress}
      />
    );
  }
  return (
    <Button variant={variant} disabled={disabled} loading={loading} onPress={onPress}>
      <Box center w={TILE} h={TILE} shrink={0} radius="xs" bg="white">
        <Image source={{ uri: mark }} style={s.tiled} contentFit="contain" />
      </Box>
      <Text color={primary ? 'accentInk' : 'text'} style={s.label}>
        {label}
      </Text>
    </Button>
  );
}
