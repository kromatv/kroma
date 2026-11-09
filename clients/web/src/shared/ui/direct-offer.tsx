import { useT } from '@kromatv/ui';
import { Box, Button, Callout, classes, IconButton, styles, useStyles } from '@kromatv/ui/kit';
import { useState } from 'react';
import { useDirectRoute } from '#web/shared/lib/direct-connection';
import { dismissOffer, offerDismissed, shouldOffer } from '#web/shared/lib/direct-offer';
import { useKromaClient } from '#web/shared/lib/web-runtime';

// Fixed over the page, so it reads the same beside the rail and under the
// phone top bar; `env()` has no React Native spelling.
const sDefinition = styles({
  dock: {
    position: 'fixed',
    left: 16,
    right: 16,
    bottom: 'max(1rem, env(safe-area-inset-bottom))',
    zIndex: 45,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  card: { width: '100%', maxWidth: 560, pointerEvents: 'auto' },
});

type Attempt = 'idle' | 'trying' | 'failed';

/** Offers the direct route when the server places this browser on its network
 * and only the browser's permission is missing. The button is what raises the
 * browser's prompt, so the prompt follows a press. */
export function DirectOffer() {
  const t = useT();
  const s = useStyles(sDefinition);
  const client = useKromaClient();
  const direct = useDirectRoute();
  const [dismissed, setDismissed] = useState(() => offerDismissed(client.baseUrl));
  const [attempt, setAttempt] = useState<Attempt>('idle');

  if (!shouldOffer(direct, dismissed)) return null;

  const connect = () => {
    setAttempt('trying');
    void direct.connectNow().then((outcome) => {
      setAttempt(outcome.kind === 'direct' ? 'idle' : 'failed');
    });
  };
  const dismiss = () => {
    dismissOffer(client.baseUrl);
    setDismissed(true);
  };

  return (
    <div className={classes(s.dock)}>
      <Box style={s.card} radius="md" bg="surface2">
        <Callout.Root tone="accent" icon="router">
          <Callout.Title>{t('connection.directOfferTitle')}</Callout.Title>
          <Callout.Detail>
            {t(
              attempt === 'failed'
                ? 'connection.directOfferFailed'
                : 'connection.directOfferDetail',
            )}
          </Callout.Detail>
          <Callout.Actions>
            <Button
              size="sm"
              label={t('connection.directOfferAction')}
              loading={attempt === 'trying'}
              onPress={connect}
            />
            <IconButton
              variant="ghost"
              control="sm"
              icon="x"
              label={t('connection.directOfferDismiss')}
              onPress={dismiss}
            />
          </Callout.Actions>
        </Callout.Root>
      </Box>
    </div>
  );
}
