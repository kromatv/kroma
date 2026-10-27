import { ApiErrorBody, apiErrorBody, KromaApiError } from '@kromatv/client';
import type { Translate } from '@kromatv/i18n';
import { z } from 'zod';

export interface PlaybackFailure {
  kind: 'missing' | 'denied' | 'network' | 'unsupported' | 'server' | 'unknown';
  detail?: string;
}

const NativeError = z.object({ message: z.string() });

function safeDetail(message: string): string | undefined {
  return (
    message
      .replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
        try {
          const url = new URL(value);
          return `${url.origin}${url.pathname}`;
        } catch {
          return '[URL]';
        }
      })
      .trim()
      .slice(0, 600) || undefined
  );
}

function statusKind(status: number): PlaybackFailure['kind'] | null {
  if (status === 404 || status === 410) return 'missing';
  if (status === 401 || status === 403) return 'denied';
  if (status === 408 || status === 504) return 'network';
  if (status >= 500) return 'server';
  return null;
}

export function nativePlaybackFailure(error: unknown): PlaybackFailure {
  if (error instanceof KromaApiError) {
    return {
      kind: statusKind(error.status) ?? 'unknown',
      detail: safeDetail(apiErrorBody(error).error ?? ''),
    };
  }
  const parsed = NativeError.safeParse(error);
  const message = parsed.success ? parsed.data.message : '';
  const detail = safeDetail(error instanceof Error ? error.message : message);
  const text = detail?.toLowerCase() ?? '';
  if (/not found|no such file|does not exist|file.*missing|\b404\b/.test(text))
    return { kind: 'missing', detail };
  if (/unauthori[sz]ed|forbidden|permission|access denied|\b40[13]\b/.test(text))
    return { kind: 'denied', detail };
  if (/network|connection|internet|timed? out|offline|nsurlerrordomain/.test(text))
    return { kind: 'network', detail };
  if (/unsupported|not supported|format|codec|decod/.test(text))
    return { kind: 'unsupported', detail };
  return { kind: 'unknown', detail };
}

export async function diagnosePlaybackFailure(
  uri: string,
  error: unknown,
): Promise<PlaybackFailure> {
  const fallback = nativePlaybackFailure(error);
  if (!/^https?:\/\//i.test(uri)) return fallback;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(uri, {
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    });
    if (response.ok) {
      await response.body?.cancel();
      return fallback;
    }
    const parsed = ApiErrorBody.safeParse(await response.json().catch(() => null));
    const detail = safeDetail(parsed.success ? (parsed.data.error ?? '') : '');
    return {
      kind: statusKind(response.status) ?? fallback.kind,
      detail: detail ?? fallback.detail,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

export function playbackFailureCopy(failure: PlaybackFailure | null | undefined, t: Translate) {
  switch (failure?.kind) {
    case 'missing':
      return { title: t('player.streamMissing'), message: t('player.streamMissingHint') };
    case 'denied':
      return { title: t('player.streamDenied'), message: t('player.streamDeniedHint') };
    case 'network':
      return { title: t('player.connectionFailed'), message: t('player.connectionFailedHint') };
    case 'unsupported':
      return { title: t('player.fileUnreadable'), message: t('player.cantPlayHint') };
    case 'server':
      return { title: t('player.streamFailed'), message: t('player.streamFailedHint') };
    default:
      return { title: t('player.cantPlay'), message: t('player.cantPlayHint') };
  }
}
