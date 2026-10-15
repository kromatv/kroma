import type { KromaClient } from '@kromatv/client';
import type { RequestKind, RequestStatus } from '@kromatv/client/requests';
import { useCallback, useState } from 'react';

export interface AskedTitle {
  kind: RequestKind;
  tmdbId: number;
  requestStatus: RequestStatus | null;
}

export interface TitleAsk {
  status: RequestStatus | null;
  asking: boolean;
  failed: boolean;
  ask: () => void;
}

export function useAskForTitle(
  client: Pick<KromaClient, 'requests'> | null,
  title: Readonly<AskedTitle>,
): TitleAsk {
  const [asked, setAsked] = useState<RequestStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const { kind, tmdbId } = title;

  const ask = useCallback(() => {
    if (!client) return;
    setAsking(true);
    setFailed(false);
    client.requests.create({ kind, tmdbId, seasons: null }).then(
      (made) => {
        setAsked(made.status);
        setAsking(false);
      },
      () => {
        setFailed(true);
        setAsking(false);
      },
    );
  }, [client, kind, tmdbId]);

  return { status: asked ?? title.requestStatus, asking, failed, ask };
}
