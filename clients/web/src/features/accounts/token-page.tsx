import { Box, Button, classes, Logo, styles, Text } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Spinner } from '#web/features/accounts/auth-gate';
import { PAGE_RADIAL } from '#web/shared/ui';

const DONE_DELAY_MS = 2500;

type Status = 'checking' | 'invalid' | 'ok' | 'done';

/** What a public token link resolved to: whether it still holds, and the
 * account it names so the page can greet the user without leaking an address. */
export type TokenCheck = { valid: boolean; username?: string | null };

/** The four faces a token-link page shows, already translated by the caller so
 * every key stays literal at its call site. */
export type TokenCopy = {
  invalidTitle: string;
  invalidDesc: string;
  doneTitle: string;
  doneDesc: string;
  title: string;
  submit: string;
};

/** Drives a public token-link page: resolves `token` through `check`, reports
 * which face to show, and `run` carries a redeem through busy/error and on to
 * the sign-in screen. */
export function useTokenLink(
  token: string | undefined,
  check: (token: string) => Promise<TokenCheck>,
) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The resolver is fixed for the life of the page and the token is what
  // changes, so holding it in a ref keeps an inline arrow from re-running the
  // check on every render.
  const resolve = useRef(check);
  resolve.current = check;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    resolve
      .current(token)
      .then((r) => {
        if (cancelled) return;
        setUsername(r.username ?? null);
        setStatus(r.valid ? 'ok' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function run(redeem: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await redeem();
      setStatus('done');
      timer.current = setTimeout(() => void navigate({ to: '/login' }), DONE_DELAY_MS);
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return { status, username, busy, error, run };
}

/** The chrome both token-link pages wear. `children` are the fields the flow
 * asks for, if any; a page with nothing to type passes none. */
export function TokenScreen({
  status,
  copy,
  username,
  error,
  busy,
  disabled,
  onSubmit,
  children,
}: Readonly<{
  status: Status;
  copy: TokenCopy;
  username: string | null;
  error: string | null;
  busy: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}>) {
  return (
    <main className={classes(s.screen)}>
      {/* Auto margins (not justify-center) so a form taller than a small phone
          viewport scrolls instead of clipping its top. */}
      <Box w="100%" align="center" m="auto">
        <Box mb={40}>
          <Logo size={24} />
        </Box>

        {status === 'checking' ? <Spinner /> : null}
        {status === 'invalid' ? (
          <Outcome title={copy.invalidTitle} desc={copy.invalidDesc} />
        ) : null}
        {status === 'done' ? <Outcome title={copy.doneTitle} desc={copy.doneDesc} /> : null}
        {status === 'ok' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className={classes(s.form)}
          >
            <Text variant="heading" accessibilityRole="header">
              {copy.title}
            </Text>
            {username ? (
              <Text variant="body" color="textMuted" textAlign="center">
                {username}
              </Text>
            ) : null}

            {children}

            {error ? (
              <Text variant="meta" color="danger">
                {error}
              </Text>
            ) : null}

            <Button
              block
              label={copy.submit}
              onPress={onSubmit}
              loading={busy}
              disabled={disabled}
            />
          </form>
        ) : null}
      </Box>
    </main>
  );
}

function Outcome({ title, desc }: Readonly<{ title: string; desc: string }>) {
  return (
    <Box>
      <Text variant="heading" accessibilityRole="header" textAlign="center" mb={8}>
        {title}
      </Text>
      <Text variant="body" color="textMuted" textAlign="center">
        {desc}
      </Text>
    </Box>
  );
}

const s = styles({
  screen: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    paddingInline: 24,
    paddingBlock: 48,
    backgroundImage: PAGE_RADIAL,
  },
  form: {
    display: 'flex',
    width: '100%',
    maxWidth: 380,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
});
