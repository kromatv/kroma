import { SSO_CALLBACK_PATH } from '@kromatv/client/sso';
import { useT } from '@kromatv/ui';
import { Box, Callout, CopyButton, Row, styles, Text, useStyles } from '@kromatv/ui/kit';

const sDefinition = styles({ mono: { fontFamily: 'monospace' } });

/** The address to register at a provider as this server's redirect URI: each
 * one the operator named, else the one under the address this page is on. */
export function RedirectUris({ named }: Readonly<{ named: readonly string[] }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const uris = named.length > 0 ? named : [`${window.location.origin}${SSO_CALLBACK_PATH}`];
  return (
    <Callout.Root tone="accent" icon="arrow-back-up">
      <Callout.Title>{t('admin.signInRedirect')}</Callout.Title>
      <Callout.Detail>{t('admin.signInRedirectHint')}</Callout.Detail>
      <Box gap={8} mt={10}>
        {uris.map((uri) => (
          <Row key={uri} gap={10}>
            <Text variant="meta" style={s.mono} selectable>
              {uri}
            </Text>
            <CopyButton
              value={uri}
              size="sm"
              variant="ghost"
              iconOnly
              label={t('common.copy')}
              copiedLabel={t('common.copied')}
            />
          </Row>
        ))}
      </Box>
    </Callout.Root>
  );
}
