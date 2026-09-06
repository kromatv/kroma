import { posterColors, sizedImageUrl } from '@kroma/core';
import { Box, Focusable, Img, Row, Surface, styles, Text } from '@kroma/ui/kit';
import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { Skeleton } from '#web/shared/ui';

const POSTER = { w: 46, h: 68 } as const;
const HEIGHT = POSTER.h + 28;

/** The poster every requests page draws: one size, one corner, the title's
 *  wash behind it until the image lands. */
export function RequestPoster({
  tmdbId,
  posterUrl,
}: Readonly<{ tmdbId: number; posterUrl: string | null }>) {
  const [c1, c2] = posterColors(String(tmdbId));
  return (
    <Box w={POSTER.w} h={POSTER.h} shrink={0}>
      <Img
        src={sizedImageUrl(posterUrl, 92)}
        background={`linear-gradient(158deg, ${c1}, ${c2})`}
        radius="sm"
        fill
      />
    </Box>
  );
}

/**
 * One card of the requests pages: a poster, the title over its meta, and what
 * the row says on its right. `link` is the anchor the row renders into, and
 * everything the row shows is the one press target, so a chip or a date
 * inside it belongs to the row; `leading` and `aside` sit beside the link for
 * a control of the row's own, and `children` go under the row, inside the
 * card.
 */
export function RequestCard({
  label,
  tmdbId,
  posterUrl,
  title,
  meta,
  trailing,
  leading,
  aside,
  link,
  children,
}: Readonly<{
  label: string;
  tmdbId: number;
  posterUrl: string | null;
  title: string;
  meta?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  aside?: ReactNode;
  link: ReactElement<{ children?: ReactNode }>;
  children?: ReactNode;
}>) {
  return (
    <Surface pad="none" radius="xl" border="border" overflow="hidden">
      <Row align="center" gap={16} p={14}>
        {leading}
        <Focusable asChild label={label} style={s.head}>
          {cloneElement(
            link,
            undefined,
            <RequestPoster tmdbId={tmdbId} posterUrl={posterUrl} />,
            <Box minW={0} shrink={1}>
              <Text variant="label" lines={1}>
                {title}
              </Text>
              {meta}
            </Box>,
            <Box flex />,
            trailing,
          )}
        </Focusable>
        {aside}
      </Row>
      {children}
    </Surface>
  );
}

/** The placeholder a requests page draws while its rows load. */
export function RequestCardSkeleton({ rows }: Readonly<{ rows: number }>) {
  return (
    <Box mt={24} gap={10}>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder rows
        <Skeleton key={i} h={HEIGHT} radius="xl" />
      ))}
    </Box>
  );
}

const s = styles({
  head: { row: true, align: 'center', gap: 16, flex: true, minW: 0 },
});
