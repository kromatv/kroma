import { watchableList } from '@kromatv/client/query';
import { DownloadId } from '@kromatv/client/watchable';
import { Box, styles } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  redirect,
  useCanGoBack,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { z } from 'zod';
import { WatchableWatch } from '#web/features/playback/watchable-watch';
import { imageUrl, isAuthed } from '#web/shared/lib/api';
import { useWatchable } from '#web/shared/lib/watchable';

const s = styles({ black: { position: 'fixed', inset: 0, bg: 'black' } });

const StreamSearch = z.object({
  file: z.coerce.number().int().nonnegative().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/_player/watch/stream/$downloadId')({
  validateSearch: (search: Record<string, unknown>) => StreamSearch.parse(search),
  loader: () => {
    if (!isAuthed()) throw redirect({ to: '/' });
  },
  pendingComponent: () => <Box style={s.black} />,
  component: StreamWatchRoute,
});

function StreamWatchRoute() {
  const downloadId = DownloadId.parse(Route.useParams().downloadId);
  const { file } = Route.useSearch();
  const { data } = useQuery(watchableList(useWatchable().api));
  const entry = data?.entries.find((listed) => listed.id === downloadId);
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const leave = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    navigate({ to: '/' });
  };

  return (
    <WatchableWatch
      key={`${downloadId}:${file ?? ''}`}
      subject={{ kind: 'download', downloadId, file: file ?? null }}
      title={entry?.title ?? null}
      art={imageUrl(entry?.posterUrl)}
      onClose={leave}
    />
  );
}
