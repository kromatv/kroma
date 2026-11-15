import type { SignInPress } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Button } from '@kromatv/ui/kit';
import { ProviderButton } from '#web/shared/ui/provider-button';

/** The ways in that take one press, stacked in the server's order. `primary`
 * gives the first one the screen's main action. */
export function PressButtons({
  presses,
  primary,
  disabled,
  onPress,
}: Readonly<{
  presses: readonly SignInPress[];
  primary: boolean;
  disabled: boolean;
  onPress: (press: SignInPress) => void;
}>) {
  const t = useT();
  return (
    <Box w="100%" gap={10}>
      {presses.map((press, index) => {
        const leads = primary && index === 0;
        return press.kind === 'provider' ? (
          <ProviderButton
            key={press.id}
            provider={press.provider}
            primary={leads}
            disabled={disabled}
            onPress={() => onPress(press)}
          />
        ) : (
          <Button
            key={press.id}
            block
            size="md"
            variant={leads ? 'primary' : 'glass'}
            icon="key"
            label={t('auth.continueWithPasskey')}
            disabled={disabled}
            onPress={() => onPress(press)}
          />
        );
      })}
    </Box>
  );
}
