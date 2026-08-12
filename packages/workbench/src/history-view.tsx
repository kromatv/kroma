// What git says about one component or one article, drawn the same way
// wherever it is shown: over the canvas for a story, under the article for a
// guide.
//
// The commits ARE a timeline, so they are drawn by the kit's <Timeline> rather
// than by a list of rows this package would have to style itself - the workbench
// is built out of the design system it shows.

import { Box, Text, Timeline } from '@kroma/ui/kit';
import { agoLabel, commitUrl, dayLabel, type HistoryEntry } from './history';
import { openWebLink } from './link';

interface HistoryBlockProps {
  entry: HistoryEntry;
  repository: string | null;
  limit?: number;
}

/** The uncommitted mark, the commits behind an entry, and where it began.
 * Without a `repository` the commits are listed but not linked; without a
 * `limit` all of them are drawn. */
function HistoryBlock({ entry, repository, limit }: Readonly<HistoryBlockProps>) {
  const commits = limit === undefined ? entry.commits : entry.commits.slice(0, limit);
  const dropped = entry.commits.length - commits.length;
  return (
    <Box gap={10}>
      <Timeline.Root size="sm">
        {entry.dirty ? (
          <Timeline.Item
            tone="current"
            title="Uncommitted changes"
            detail="in the tree this build was made from"
          />
        ) : null}
        {commits.map((commit) => {
          const href = commitUrl(repository, commit.sha);
          return (
            <Timeline.Item
              key={commit.sha}
              icon="git-commit"
              title={commit.subject}
              detail={`${commit.sha} · ${agoLabel(commit.date)}`}
              label={href ? `${commit.subject}, open on GitHub` : undefined}
              onPress={href ? () => openWebLink(href) : undefined}
            />
          );
        })}
        {entry.created ? (
          <Timeline.Item tone="origin" title={`Added ${dayLabel(entry.created)}`} />
        ) : (
          <Timeline.Item tone="origin" title="Not committed yet" />
        )}
      </Timeline.Root>
      {dropped > 0 ? (
        <Text variant="meta" color="textDim">
          {`and ${dropped} older ${dropped === 1 ? 'commit' : 'commits'}`}
        </Text>
      ) : null}
    </Box>
  );
}

/** The one line a header carries: when it was written, and how long ago it last
 * moved. Empty for something with no committed history at all. */
function summaryOf(entry: HistoryEntry): string {
  if (!entry.created) return 'Not committed yet';
  return `Created ${dayLabel(entry.created)} · edited ${agoLabel(entry.changed)}`;
}

export { HistoryBlock, summaryOf };
