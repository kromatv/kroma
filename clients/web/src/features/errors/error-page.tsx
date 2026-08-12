// Full-page error / not-found screens, wired into the router as
// `defaultErrorComponent` (thrown errors → 401 / 403 / 500) and
// `defaultNotFoundComponent` (unmatched routes → 404). Styled to the KROMA
// design: deep charcoal, a single amber accent, a big cinematic status number.

import { apiErrorText, KromaApiError, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, color, Disclosure, EmptyState, Logo, Row, Text } from '@kroma/ui/kit';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { PAGE_RADIAL } from '#web/shared/ui';

type Kind = 'notFound' | 'unauthorized' | 'forbidden' | 'server';

const COPY: Record<Kind, { code: string; title: MessageKey; body: MessageKey }> = {
  notFound: { code: '404', title: 'error.notFoundTitle', body: 'error.notFoundBody' },
  unauthorized: { code: '401', title: 'error.unauthorizedTitle', body: 'error.unauthorizedBody' },
  forbidden: { code: '403', title: 'error.forbiddenTitle', body: 'error.forbiddenBody' },
  server: { code: '500', title: 'error.serverTitle', body: 'error.serverBody' },
};

function kindOf(error: unknown): Kind {
  const status = error instanceof KromaApiError ? error.status : undefined;
  if (status === 404) return 'notFound';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  return 'server';
}

function ErrorScreen({
  kind,
  detail,
  trace,
  onRetry,
  onSignIn,
}: Readonly<{
  kind: Kind;
  detail?: string | null;
  trace?: string | null;
  onRetry?: () => void;
  onSignIn?: () => void;
}>) {
  const t = useT();
  const router = useRouter();
  const { code, title, body } = COPY[kind];

  return (
    <main style={SCREEN}>
      <Box flex w="100%" maxW={440}>
        <EmptyState.Root size="md" layout="fill">
          <Box mb={22} opacity={0.9}>
            <Logo size={20} />
          </Box>

          <EmptyState.Media variant="plain">
            <div style={NUMERAL}>{code}</div>
          </EmptyState.Media>

          <Text variant="h2" accessibilityRole="header" textAlign="center">
            {t(title)}
          </Text>
          <EmptyState.Hint>{t(body)}</EmptyState.Hint>

          {detail ? <EmptyState.Detail>{detail}</EmptyState.Detail> : null}

          {trace ? <Trace trace={trace} /> : null}

          <EmptyState.Actions>
            <Row wrap justify="center" gap={12}>
              {onRetry ? (
                <Button
                  variant="glass"
                  size="sm"
                  icon="refresh"
                  label={t('error.retry')}
                  onPress={onRetry}
                />
              ) : null}
              {onSignIn ? (
                <Button size="sm" icon="login" label={t('auth.login')} onPress={onSignIn} />
              ) : null}
              <Button
                variant={onSignIn ? 'glass' : 'primary'}
                size="sm"
                icon="home"
                label={t('error.home')}
                onPress={() => void router.navigate({ to: '/' })}
              />
            </Row>
          </EmptyState.Actions>
        </EmptyState.Root>
      </Box>
    </main>
  );
}

const SCREEN = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minHeight: '100vh',
  paddingLeft: 24,
  paddingRight: 24,
  background: PAGE_RADIAL,
} as const;

// The status numeral is a gradient clipped to its own glyphs, which is a
// browser text effect with no React Native spelling, so it stays CSS rather
// than becoming a type role: the ramp tops out at `hero` 66 and a step this
// far above it would open a gap wider than the ramp allows.
const NUMERAL = {
  fontFamily: 'var(--font-display)',
  fontSize: 104,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: '-0.04em',
  color: 'transparent',
  backgroundImage: `linear-gradient(180deg, ${color('text')} 0%, ${color('text/28')} 100%)`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
} as const;

/** Router `defaultErrorComponent`: a thrown error (loader/component). Picks the
 * variant from the error's status and offers a retry that re-runs the route. */
export function RouteError({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  const router = useRouter();
  const navigate = useNavigate();
  // Where to return to after signing in (the current path + query).
  const href = useRouterState({ select: (s) => s.location.href });
  const kind = kindOf(error);

  // Server errors are often transient → offer a retry that re-runs the route.
  const onRetry =
    kind === 'server'
      ? () => {
          reset();
          void router.invalidate();
        }
      : undefined;

  // 401: the session is gone but `user` may still be cached locally, so the
  // ambient gate won't show. Send them to /login instead, which returns here.
  const onSignIn =
    kind === 'unauthorized'
      ? () => void navigate({ to: '/login', search: { redirect: href } })
      : undefined;

  // Only surface the raw message for server errors (404/401/403 are self-evident
  // and the message would just be noise).
  const detail = kind === 'server' ? apiErrorText(error, '') || null : null;
  const trace = kind === 'server' ? traceOf(error) : null;
  return (
    <ErrorScreen kind={kind} detail={detail} trace={trace} onRetry={onRetry} onSignIn={onSignIn} />
  );
}

// The stack when the throw carries one (a client-side crash), the composed
// status line when it does not (an API 500 has no client stack worth reading).
function traceOf(error: Error): string | null {
  if (error.stack) return error.stack;
  if (error instanceof KromaApiError) return `${error.name}: ${error.message}`;
  return String(error) || null;
}

function Trace({ trace }: Readonly<{ trace: string }>) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trace);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [trace]);
  return (
    <Box mt={20} w="100%">
      <Disclosure.Root>
        <Disclosure.Trigger>{t('error.technicalDetails')}</Disclosure.Trigger>
        <Box gap={10}>
          <Box
            bg="surface1"
            border="border"
            radius="md"
            px={14}
            py={12}
            maxH={224}
            overflow="scroll"
          >
            <Text variant="meta" font="mono" color="textDim">
              {trace}
            </Text>
          </Box>
          <Box self="flex-end">
            <Button
              variant="ghost"
              size="sm"
              icon={copied ? 'check' : 'copy'}
              label={copied ? t('common.copied') : t('common.copy')}
              onPress={() => void copy()}
            />
          </Box>
        </Box>
      </Disclosure.Root>
    </Box>
  );
}

/** Router `defaultNotFoundComponent`: an unmatched route (404). */
export function NotFound() {
  return <ErrorScreen kind="notFound" />;
}
