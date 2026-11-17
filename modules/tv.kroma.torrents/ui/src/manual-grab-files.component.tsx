import type { TorrentAnalysis } from '@kromatv/module-acquisition/schemas';
import { useT } from '@kromatv/module-sdk';
import { Box, Button, Callout, Text } from '@kromatv/ui/kit';
import type { ComponentProps } from 'react';
import { TorrentContents } from './torrent-contents.component';

type ContentsProps = ComponentProps<typeof TorrentContents>;

interface Analysis {
  analysis: TorrentAnalysis | null;
  analyzing: boolean;
  analyzeErr: string | null;
}

export function FilesPanel({
  state,
  onRetry,
  episodes,
  selection,
}: Readonly<{
  state: Analysis;
  onRetry: () => void;
  episodes: ContentsProps['episodes'];
  selection: ContentsProps['selection'];
}>) {
  const t = useT();
  return (
    <Box gap={12}>
      {state.analyzeErr ? (
        <AnalyzeFailed error={state.analyzeErr} busy={state.analyzing} onRetry={onRetry} />
      ) : null}
      {state.analyzing ? (
        <Text variant="meta" color="text/45">
          {t('manual.analyzing')}
        </Text>
      ) : null}
      {state.analysis ? (
        <TorrentContents analysis={state.analysis} episodes={episodes} selection={selection} />
      ) : null}
    </Box>
  );
}

function AnalyzeFailed({
  error,
  busy,
  onRetry,
}: Readonly<{ error: string; busy: boolean; onRetry: () => void }>) {
  const t = useT();
  return (
    <Callout.Root size="sm" tone="danger" icon="alert-triangle">
      <Callout.Title>{error}</Callout.Title>
      <Callout.Actions>
        <Button
          variant="glass"
          size="sm"
          label={t('manual.analyze')}
          onPress={onRetry}
          loading={busy}
        />
      </Callout.Actions>
    </Callout.Root>
  );
}
