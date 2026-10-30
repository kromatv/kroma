// The login gate, rendered as a full-screen overlay whenever no session is
// active so the catalogue underneath stays unusable until an account is chosen.

import type { AuthConfig } from '@kromatv/client/accounts';
import { Box, classes, Logo, styles, useStyles } from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { GateBody } from '#web/features/accounts/gate-body';
import { LoginBackdrop } from '#web/features/accounts/login-backdrop';
import { LoginSettings } from '#web/features/accounts/login-settings';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_RADIAL } from '#web/shared/ui';

// The gate is one viewport tall, and the kit carries no viewport unit: every
// screen it draws sits on a fixed 1920x1080 stage instead. So the two frames
// that measure themselves against the window stay plain CSS.
const sDefinition = styles({
  gate: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    minHeight: '100vh',
    overflowX: 'hidden',
    backgroundImage: PAGE_RADIAL,
  },
  column: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    minHeight: '100vh',
    overflowY: 'auto',
    py: 48,
    px: 24,
  },
});

const UNREACHABLE_CONFIG: AuthConfig = { publicUserList: true, hasAccounts: true };

export function LoginGate() {
  const s = useStyles(sDefinition);

  const { ready, client } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    client.accounts.config().then(
      (loaded) => {
        if (!cancelled) setConfig(loaded);
      },
      () => {
        if (!cancelled) setConfig(UNREACHABLE_CONFIG);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!(ready && config)) return null;
  return (
    <main className={classes(s.gate)}>
      <LoginBackdrop />
      <LoginSettings />
      {/* Centred via the child's auto margins, not justify-center: a centred
          scroll container clips overflow ABOVE the fold out of reach on short
          viewports, while my-auto degrades to a normal scroll from the top. */}
      <div className={classes(s.column)}>
        <Box my="auto" w="100%" align="center">
          <Brand />
          <GateBody config={config} />
        </Box>
      </div>
    </main>
  );
}

export function Brand() {
  return (
    <Box mb={48}>
      <Logo size={38} />
    </Box>
  );
}

export function Spinner() {
  return <Logo markOnly size={40} spin="loading" />;
}
