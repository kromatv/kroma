import type { TmdbKind } from '@kromatv/client/discovery';
import type { Trailer } from '@kromatv/client/trailers';
import { TRAILER_LABEL, youtubeWatchUrl } from '@kromatv/core';
import { useTrailerPreparation } from '@kromatv/core/react';
import { Player, useT, WEB_FLAGS } from '@kromatv/ui';
import {
  Box,
  Button,
  backdropBlur,
  classes,
  Icon,
  Spinner,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';
import { useClipController } from '#web/features/playback/use-clip-controller';
import { useKromaClient } from '#web/shared/lib/web-runtime';

const sDefinition = styles({ frost: backdropBlur(4), inheritCorner: { borderRadius: 'inherit' } });

const noStoryboard = () => null;

const CLIP_FLAGS = { ...WEB_FLAGS, tracks: false };

/** A title's trailer in the shared player chrome. The server fetches it on the
 *  first press, so the chrome holds a "getting it ready" panel until it plays. */
export function TrailerPlayer({
  kind,
  tmdbId,
  trailer,
  title,
  onClose,
}: Readonly<{
  kind: TmdbKind;
  tmdbId: number;
  trailer: Trailer;
  title: string;
  onClose: () => void;
}>) {
  const t = useT();
  const s = useStyles(sDefinition);
  const client = useKromaClient();
  const state = useTrailerPreparation(
    () => client.trailers.prepare(kind, tmdbId, trailer.video),
    trailer.video,
  );
  const src = state === 'ready' ? client.trailers.streamUrl(kind, tmdbId, trailer.video) : null;
  const { controller, videoRef } = useClipController(src);

  return (
    <Player.Root controller={controller} flags={CLIP_FLAGS} title={title} onClose={onClose}>
      <Player.Title>{title}</Player.Title>
      <Player.Subtitle>{t(TRAILER_LABEL[trailer.version])}</Player.Subtitle>
      <Player.Transport tileAt={noStoryboard} />
      <Player.Media>
        <video
          ref={videoRef}
          src={src ?? undefined}
          playsInline
          crossOrigin="anonymous"
          className={classes(s.inheritCorner)}
        >
          <track kind="captions" />
        </video>
      </Player.Media>
      {state === 'preparing' ? (
        <Player.Panel>
          <Box fill z={80} center gap={20} px={32} bg="black/70" style={s.frost}>
            <Spinner size={44} />
            <Text variant="body" color="white/80" textAlign="center">
              {t('trailer.preparing')}
            </Text>
          </Box>
        </Player.Panel>
      ) : null}
      {state === 'failed' ? (
        <Player.Panel>
          <Box fill z={80} center gap={16} px={32} bg="black/85" style={s.frost}>
            <Icon name="movie-off" size={52} color="danger" />
            <Text variant="body" color="white/80" maxW={460} textAlign="center">
              {t('trailer.failed')}
            </Text>
            <Text variant="meta" color="white/50" maxW={460} textAlign="center">
              {t('trailer.failedHint')}
            </Text>
            <Box row wrap center gap={12} mt={8}>
              <Button
                variant="primary"
                size="sm"
                icon="brand-youtube"
                label={t('trailer.openOnYoutube')}
                asChild
              >
                <a
                  href={youtubeWatchUrl(trailer.video)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </Button>
              <Button
                variant="glass"
                size="sm"
                icon="chevron-left"
                label={t('trailer.back')}
                onPress={onClose}
              />
            </Box>
          </Box>
        </Player.Panel>
      ) : null}
    </Player.Root>
  );
}
