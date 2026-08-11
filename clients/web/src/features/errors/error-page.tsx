// Full-page error / not-found screens, wired into the router as
// `defaultErrorComponent` (thrown errors → 401 / 403 / 500) and
// `defaultNotFoundComponent` (unmatched routes → 404). Styled to the KROMA
// design: deep charcoal, a single amber accent, a big cinematic status number.

import { apiErrorText, KromaApiError, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, color, Disclosure, Logo } from '@kroma/ui/kit';
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
    <main
      className="flex min-h-screen w-full flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: PAGE_RADIAL }}
    >
      <div className="flex w-full max-w-[440px] flex-col items-center">
        <div className="mb-8 opacity-90">
          <Logo size={20} />
        </div>

        <div
          className="font-display text-[104px] font-extrabold leading-none tracking-[-.04em] text-transparent"
          style={{
            backgroundImage: `linear-gradient(180deg, ${color('text')} 0%, ${color('text/28')} 100%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          {code}
        </div>

        <h1 className="mt-6 font-display text-[24px] font-bold tracking-[-.02em]">{t(title)}</h1>
        <p className="mt-3 max-w-[380px] text-[14.5px] leading-relaxed text-muted">{t(body)}</p>

        {detail ? (
          <p className="mt-4 max-w-[380px] wrap-break-word rounded-md border border-border bg-surface-1 px-3.5 py-2.5 text-[12.5px] font-medium text-dim">
            {detail}
          </p>
        ) : null}

        {trace ? <Trace trace={trace} /> : null}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
        </div>
      </div>
    </main>
  );
}

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
    <div className="mt-5 w-full text-left">
      <Disclosure title={t('error.technicalDetails')}>
        <div className="flex flex-col gap-2.5">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-border bg-surface-1 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-dim">
            {trace}
          </pre>
          <div className="self-end">
            <Button
              variant="ghost"
              size="sm"
              icon={copied ? 'check' : 'copy'}
              label={copied ? t('common.copied') : t('common.copy')}
              onPress={() => void copy()}
            />
          </div>
        </div>
      </Disclosure>
    </div>
  );
}

/** Router `defaultNotFoundComponent`: an unmatched route (404). */
export function NotFound() {
  return <ErrorScreen kind="notFound" />;
}
