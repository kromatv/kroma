// The login gate, rendered as a full-screen overlay whenever no session is
// active so the catalogue underneath stays unusable until an account is chosen.

import { Box, Logo } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import { GateBody } from '#web/features/accounts/gate-body';
import { LoginBackdrop } from '#web/features/accounts/login-backdrop';
import { LoginSettings } from '#web/features/accounts/login-settings';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_RADIAL } from '#web/shared/ui';

// The gate is one viewport tall, and the kit carries no viewport unit: every
// screen it draws sits on a fixed 1920x1080 stage instead. So the two frames
// that measure themselves against the window stay plain CSS.
const GATE: CSSProperties = {
  position: 'relative',
  display: 'flex',
  width: '100%',
  minHeight: '100vh',
  overflowX: 'hidden',
  background: PAGE_RADIAL,
};

const GATE_COLUMN: CSSProperties = {
  position: 'relative',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  minHeight: '100vh',
  overflowY: 'auto',
  padding: '48px 24px',
};

const GATE_CENTRED: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '100vh',
  background: PAGE_RADIAL,
};

export function LoginGate() {
  const { ready } = useAuth();
  return (
    <div style={GATE}>
      <LoginBackdrop />
      <LoginSettings />
      {/* Centred via the child's auto margins, not justify-center: a centred
          scroll container clips overflow ABOVE the fold out of reach on short
          viewports, while my-auto degrades to a normal scroll from the top. */}
      <div style={GATE_COLUMN}>
        <Box my="auto" w="100%" align="center">
          <Brand />
          {ready ? <GateBody /> : <Spinner />}
        </Box>
      </div>
    </div>
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

/** Shown by authenticated layouts while the session hydrates or a redirect to
 * /login is in flight (see {@link useRequireAuth}). */
export function GateLoading() {
  return (
    <div style={GATE_CENTRED}>
      <Spinner />
    </div>
  );
}
