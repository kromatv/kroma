import { TRAILER_LABEL } from '@kromatv/core';
import { useTrailerPreparation } from '@kromatv/core/react';
import { Player, TV_FLAGS, useT } from '@kromatv/ui';
import { Box, Button, radius as cornerRadius, Icon, Spinner, style, Text } from '@kromatv/ui/kit';
import { type ReactNode, useEffect, useMemo } from 'react';
import { usePlayerDock } from '#tv/app/playerDock';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav, useParams } from '#tv/app/router';
import type { ClipBackend, ClipEngine } from '#tv/features/playback/player/clipBackend';
import { useClipPlayback } from '#tv/features/playback/player/useClipPlayback';
import { useTvClipController } from '#tv/features/playback/use-tv-clip-controller';

const BACK = style({ radius: cornerRadius.pill, mt: 8 });

const noStoryboard = () => null;

/** A title's trailer in the shared player chrome, on the shell's clip backend.
 * The server fetches it on the first press, so a panel holds the stage until it
 * plays; Back leaves from any of it, and so does the trailer running out. A film
 * still playing in the picture-in-picture window stops, as it would for another
 * film. */
export function TvTrailerPlayer<E extends ClipEngine>({
  backend,
}: Readonly<{ backend: ClipBackend<E> }>): ReactNode {
  const { kind, tmdbId, title, trailer } = useParams('trailer');
  const nav = useNav();
  const client = useClient();
  const t = useT();
  const { mousePointer } = useEnv();
  const { docked, undock } = usePlayerDock();
  useEffect(() => {
    if (docked) undock();
  }, [docked, undock]);

  const state = useTrailerPreparation(
    () => client.trailers.prepare(kind, tmdbId, trailer.video),
    trailer.video,
  );
  const src = useMemo(
    () => (state === 'ready' ? client.trailers.streamUrl(kind, tmdbId, trailer.video) : null),
    [state, client, kind, tmdbId, trailer.video],
  );
  const clip = useClipPlayback(backend, src);
  const controller = useTvClipController(clip);
  const flags = useMemo(
    () => ({ ...TV_FLAGS, pointer: mousePointer, tracks: false }),
    [mousePointer],
  );
  const { Surface } = backend;

  return (
    <Player.Root controller={controller} flags={flags} title={title} onClose={nav.back}>
      <Player.Title>{title}</Player.Title>
      <Player.Subtitle>{t(TRAILER_LABEL[trailer.version])}</Player.Subtitle>
      <Player.Transport tileAt={noStoryboard} />
      <Player.Media>
        <Surface clip={clip} title={title} />
      </Player.Media>
      {state === 'preparing' ? (
        <Player.Panel>
          <Box fill z={80} center gap={24} px={64} bg="black/80">
            <Spinner size={56} />
            <Text variant="bodyTv" textAlign="center" color="text/72">
              {t('trailer.preparing')}
            </Text>
          </Box>
        </Player.Panel>
      ) : null}
      {state === 'failed' ? (
        <Player.Panel>
          <Box fill z={80} center gap={24} px={64} bg="black/92">
            <Icon name="movie-off" size={64} color="danger" />
            <Text variant="headingTv" textAlign="center" color="white">
              {t('trailer.failed')}
            </Text>
            <Text variant="bodyTv" textAlign="center" maxW={672} color="text/72">
              {t('trailer.failedHint')}
            </Text>
            <Button
              icon="chevron-left"
              label={t('trailer.back')}
              onPress={nav.back}
              style={BACK}
              autoFocus
            />
          </Box>
        </Player.Panel>
      ) : null}
    </Player.Root>
  );
}
