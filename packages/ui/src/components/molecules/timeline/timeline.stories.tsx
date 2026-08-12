import { story } from '@kroma/workbench/story';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { Timeline, type TimelineTone } from './timeline';

export default story({
  name: 'Timeline',
  group: 'Layout',
  docs: 'A sequence of events down a rail: a history, an activity feed, the steps a job went through. The rail is drawn by the entries themselves, so it never has to be measured; the Root only tells the last one to stop. An entry with an `onPress` is the control in one piece - one D-pad stop, one hit area - rather than a row with a link buried in it.',
  usage: `<Timeline.Root>
  <Timeline.Item tone="current" title="Running" detail="for 4 min" />
  <Timeline.Item
    icon="git-commit"
    title="fix: the range request is clamped"
    detail="9db893fe · yesterday"
    onPress={open}
  />
  <Timeline.Item tone="origin" title="Added 27 July" />
</Timeline.Root>`,
  guidelines: {
    do: [
      'Write the entries newest first: the rail reads downwards into the past.',
      'Use `tone="origin"` for the entry the sequence starts at, so the hollow node closes the rail.',
      'Put the particulars - a revision, a duration, a code - in `detail`, and what happened in `title`.',
    ],
    dont: [
      "Don't put a second control inside an entry: give the entry itself `onPress`.",
      "Don't reach for it to lay out a settings list - that is <ListRow>, which has a shell and a chevron.",
    ],
  },
  matrix: false,
  width: { min: 320, max: 560 },
  component: Timeline.Root,
  args: { size: 'sm' as ControlSize },
  controls: { size: ['sm', 'md', 'tv'] },
  render: ({ size }) => (
    <Timeline.Root size={size}>
      <Timeline.Item tone="current" title="Uncommitted changes" detail="in the working tree" />
      <Timeline.Item
        icon="git-commit"
        title="refactor(ui): the kit's components take parts instead of props"
        detail="7f8d2169 · yesterday"
        onPress={() => undefined}
      />
      <Timeline.Item
        icon="git-commit"
        title="test: every line this branch adds is covered"
        detail="9db893fe · 2 days ago"
        onPress={() => undefined}
      />
      <Timeline.Item tone="origin" title="Added 27 Jul 2026" />
    </Timeline.Root>
  ),
  scenes: [
    {
      name: 'Every tone',
      docs: 'Three faces: something that happened, the state the thing is in now, and where the sequence began. The origin is hollow because the rail starts there rather than passing through it.',
      render: ({ size }) => (
        <Timeline.Root size={size}>
          {(['current', 'event', 'origin'] as TimelineTone[]).map((tone) => (
            <Timeline.Item key={tone} tone={tone} title={tone} detail={`tone="${tone}"`} />
          ))}
        </Timeline.Root>
      ),
    },
    {
      name: 'Glyphs',
      docs: 'A glyph replaces the node where the KIND of event is worth reading at a glance.',
      render: ({ size }) => (
        <Timeline.Root size={size}>
          <Timeline.Item icon="download" title="Download finished" detail="4.2 GB · 12 min" />
          <Timeline.Item icon="wand" title="Subtitles generated" detail="whisper · 3 min" />
          <Timeline.Item icon="search" title="Indexer queried" detail="2 results" />
          <Timeline.Item tone="origin" icon="plus" title="Request added" />
        </Timeline.Root>
      ),
    },
    {
      name: 'Composed',
      docs: 'Anything the two sugar props have no name for goes in as children, under them.',
      render: ({ size }) => (
        <Timeline.Root size={size}>
          <Timeline.Item title="The module refused to start" detail="2 min ago">
            <Text variant="meta" font="mono" color="textDim">
              supervisor: port 41310 already bound
            </Text>
          </Timeline.Item>
          <Timeline.Item tone="origin" title="Module installed" detail="tv.kroma.torrents" />
        </Timeline.Root>
      ),
    },
  ],
});
