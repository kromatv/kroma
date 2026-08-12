// An article's own provenance, under the article: when it was written, when it
// was last edited, its source, and the commits behind it.
//
// It is attached to the DOCUMENT rather than drawn beside it, so every page
// carries it at every window width - the list of sections beside a guide is a
// wide-window luxury, and when a page was written is not.

import { Box, Button, styles, Text } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { useState } from 'react';
import { HistoryBlock, summaryOf } from './history-view';
import { openWebLink } from './link';
import { MEASURE } from './mdx';
import type { Page } from './page';
import { usePathSource } from './source';
import type { DocComponent } from './story';

/**
 * The same pages with their provenance under them.
 *
 * Wrap what `discoverPages*` returned. A page whose file the build read nothing
 * about is handed back untouched at render time - the footer draws nothing -
 * so this is safe on Metro, where there is no build-time reader at all.
 */
function withPageHistory(pages: readonly Page[]): readonly Page[] {
  return pages.map((page) => ({ ...page, content: documented(page.content, page.path) }));
}

function documented(Content: DocComponent, path: string): DocComponent {
  return function PageDocument(props: Readonly<{ components?: Record<string, unknown> }>) {
    return (
      <>
        <Content {...props} />
        <PageHistory path={path} />
      </>
    );
  };
}

function PageHistory({ path }: Readonly<{ path: string }>) {
  const source = usePathSource(path);
  const [open, setOpen] = useState(false);
  if (!source) return null;
  const { entry, href, repository } = source;
  const commits = entry?.commits.length ?? 0;
  return (
    <Box mt={space[10]} pt={space[5]} gap={space[5]} maxW={MEASURE.prose} style={s.rule}>
      <Box row align="center" gap={space[3]}>
        <Box flex minW={0}>
          <Text variant="meta" color="textDim">
            {entry ? summaryOf(entry) : 'Not in this build’s history'}
          </Text>
        </Box>
        {commits > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            icon="history"
            iconRight={open ? 'chevron-up' : 'chevron-down'}
            label={open ? 'Hide history' : 'History'}
            focusScale={1}
            onPress={() => setOpen((was) => !was)}
          />
        ) : null}
        {href ? (
          <Button
            variant="ghost"
            size="sm"
            icon="brand-github"
            label="Source"
            focusScale={1}
            onPress={() => openWebLink(href)}
          />
        ) : null}
      </Box>
      {open && entry ? <HistoryBlock entry={entry} repository={repository} /> : null}
    </Box>
  );
}

const s = styles({ rule: { borderTopWidth: 1, borderTopColor: 'border' } });

export { withPageHistory };
