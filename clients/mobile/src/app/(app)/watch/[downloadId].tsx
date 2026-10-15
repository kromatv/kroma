import { DownloadId } from '@kromatv/client/watchable';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { routeParam } from '#mobile/lib/nav';
import { WatchStage } from '#mobile/player/WatchStage';

export default function WatchRoute() {
  const id = routeParam(useLocalSearchParams<{ downloadId?: string }>().downloadId);
  const { file } = useLocalSearchParams<{ file?: string }>();
  if (!id) return <Redirect href="/" />;
  return (
    <WatchStage
      subject={{
        kind: 'download',
        downloadId: DownloadId.parse(id),
        file: file === undefined ? null : Number(file),
      }}
    />
  );
}
