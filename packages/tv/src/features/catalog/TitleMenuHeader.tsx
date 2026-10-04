import { episodeTag, formatRuntime, genreLabels, posterColors } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Box, Img, Progress, Text, tintGradient } from '@kromatv/ui/kit';
import { useClient } from '#tv/app/router';
import type { HeldTitle } from '#tv/features/catalog/TitleMenu';

const ART_W = 780;

function factsOf(t: Translate, title: HeldTitle): string {
  if (title.kind === 'show') {
    const show = title.item;
    return [
      show.year ? String(show.year) : null,
      t('content.seasonCount', { count: show.seasonCount }),
      genreLabels(t, show.metadata)[0],
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const item = title.item;
  if (item.kind === 'episode')
    return [item.showTitle, episodeTag(item)].filter(Boolean).join(' · ');
  return [
    item.year ? String(item.year) : null,
    formatRuntime(item.durationMs),
    genreLabels(t, item.metadata)[0],
  ]
    .filter(Boolean)
    .join(' · ');
}

function useArt(title: HeldTitle): string | null {
  const { artwork } = useClient().media;
  if (title.kind === 'show') {
    return artwork.backdropFor(title.item, ART_W) ?? artwork.showPosterFor(title.item, ART_W);
  }
  return artwork.backdropFor(title.item, ART_W) ?? artwork.posterFor(title.item, ART_W);
}

/** The pinned top of the title menu: the title's artwork, its name, and the
 * facts a tile has no room for. */
export function TitleMenuHeader({ title }: Readonly<{ title: HeldTitle }>) {
  const t = useT();
  const art = useArt(title);
  const facts = factsOf(t, title);
  return (
    <Box gap={8}>
      <Box aspect={16 / 9} radius="lg" overflow="hidden" mb={12}>
        <Img src={art} background={tintGradient(posterColors(title.item.id))} fill />
        {title.kind === 'resume' ? (
          <Box absolute left={0} right={0} bottom={0}>
            <Progress value={title.progress} thickness={6} rounded={false} />
          </Box>
        ) : null}
      </Box>
      <Text variant="headingTv" lines={2}>
        {title.item.title}
      </Text>
      {facts ? (
        <Text variant="labelTv" color="textMuted">
          {facts}
        </Text>
      ) : null}
    </Box>
  );
}
