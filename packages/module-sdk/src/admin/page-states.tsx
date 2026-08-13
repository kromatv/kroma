// What a module page shows before it has anything to show. A console page
// arrives in two steps - the module's code, then its data - and both used to
// render as a bare line of text (or, worse, as nothing at all). These are the
// shared answers, so a module page is never a black screen and every one of
// them waits the same way.

import { apiErrorText, KromaApiError, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  CardSkeleton,
  EmptyState,
  type IconName,
  Skeleton,
  Text,
} from '@kroma/ui/kit';
import type { ViewStyle } from 'react-native';

/**
 * The shape of a console page, pulsing: a title, a subtitle, and the panels
 * under them. Deliberately the page's OWN silhouette rather than a spinner -
 * it says what is coming and holds the layout, so nothing jumps when the real
 * page lands.
 */
export function ModuleLoading({ panels = 2 }: Readonly<{ panels?: number }>) {
  const t = useT();
  return (
    <Box gap={24} accessibilityLabel={t('common.loading')} aria-busy>
      <Box gap={10}>
        <Skeleton h={34} w={260} radius={8} />
        <Skeleton h={16} w={360} bg="white/4" />
      </Box>
      {Array.from({ length: panels }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder panels
        <CardSkeleton key={i} fields={i === 0 ? 3 : 2} />
      ))}
    </Box>
  );
}

/** A module that is not installed, or has been turned off: its pages vanish
 *  with its nav, and this says so rather than 404-ing. */
export function ModuleUnavailable() {
  const t = useT();
  return (
    <Box style={PAGE}>
      <EmptyState.Root layout="fill" icon="plug-off">
        <EmptyState.Title>{t('modules.unavailable')}</EmptyState.Title>
        <EmptyState.Hint>{t('modules.unavailableHint')}</EmptyState.Hint>
      </EmptyState.Root>
    </Box>
  );
}

interface ModuleFailedProps {
  /** Offered as a Retry button; a page that cannot ask again omits it. */
  retry?: () => void;
  /** The thrown cause, which chooses the explanation: a request that never
   *  reached a server reads as the server being down, an HTTP answer as the
   *  module's. Without one the state falls back to the generic wording. */
  error?: unknown;
  /** The raw text under that explanation. Defaults to what `error` carries. */
  detail?: string;
}

/** A module page whose own data could not be fetched. Distinct from
 *  {@link ModuleUnavailable}: the module IS there, the request failed. Pass
 *  `retry` where the page can ask again, and the state offers the button. */
export function ModuleFailed({ retry, error, detail }: Readonly<ModuleFailedProps>) {
  const t = useT();
  const { kind, status } = causeOf(error);
  const copy = COPY[kind];
  const raw = detail ?? messageOf(error);
  return (
    <Box style={PAGE}>
      <EmptyState.Root layout="fill" icon={copy.icon}>
        <EmptyState.Title>{t(copy.title)}</EmptyState.Title>
        <EmptyState.Hint>{t(copy.hint)}</EmptyState.Hint>
        {raw ? <FailureDetail status={status} text={raw} /> : null}
        {retry ? (
          <EmptyState.Actions>
            <Button
              variant="glass"
              size="sm"
              icon="refresh"
              label={t('error.retry')}
              onPress={retry}
            />
          </EmptyState.Actions>
        ) : null}
      </EmptyState.Root>
    </Box>
  );
}

function FailureDetail({ status, text }: Readonly<{ status?: number; text: string }>) {
  const t = useT();
  return (
    <Box align="center" gap={6} mt={4}>
      <Text variant="overline" color="text/40">
        {status === undefined
          ? t('admin.moduleErrorDetails')
          : `${t('admin.moduleErrorDetails')} · ${t('admin.moduleErrorStatus', { status })}`}
      </Text>
      <EmptyState.Detail>{text}</EmptyState.Detail>
    </Box>
  );
}

type FailureKind = 'serverDown' | 'notRunning' | 'unknown';

const COPY: Record<FailureKind, { icon: IconName; title: MessageKey; hint: MessageKey }> = {
  serverDown: {
    icon: 'server-off',
    title: 'admin.moduleErrorServerDown',
    hint: 'admin.moduleErrorServerDownHint',
  },
  notRunning: {
    icon: 'plug-off',
    title: 'admin.moduleErrorNotRunning',
    hint: 'admin.moduleErrorNotRunningHint',
  },
  unknown: { icon: 'alert-triangle', title: 'modules.loadFailed', hint: 'modules.loadFailedHint' },
};

const BY_STATUS: Readonly<Record<number, FailureKind>> = {
  404: 'notRunning',
  502: 'serverDown',
  503: 'serverDown',
  504: 'serverDown',
};

function causeOf(error: unknown): { kind: FailureKind; status?: number } {
  if (error instanceof KromaApiError) {
    return { kind: BY_STATUS[error.status] ?? 'unknown', status: error.status };
  }
  if (error instanceof TypeError || causeCode(error)) return { kind: 'serverDown' };
  return { kind: 'unknown' };
}

function causeCode(error: unknown): string | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error && 'code' in cause && typeof cause.code === 'string')
    return cause.code;
  return undefined;
}

function messageOf(error: unknown): string | undefined {
  if (error instanceof KromaApiError) return apiErrorText(error, error.message);
  if (typeof error === 'string') return error || undefined;
  if (!(error instanceof Error)) return undefined;
  const code = causeCode(error);
  return code ? `${error.message} (${code})` : error.message;
}

// The console's main region does not stretch its children, so a state that
// should centre in the viewport has to bring its own height. The unit is the
// browser's; RN's types do not know it, and these pages render only there.
const PAGE = { minHeight: '62vh' } as unknown as ViewStyle;
