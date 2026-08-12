import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { Callout, type CalloutTone } from './callout';

export default story({
  name: 'Callout',
  group: 'Feedback',
  docs: "The toned block a page keeps beside its content: a failure, a warning, a result worth pointing at. A toast arrives and leaves; a callout stays as long as what it reports is true. Its well, corner and rhythm are the control shell's, so one sitting in a form reads as part of the form.",
  usage: `<Callout.Root tone="danger">
  <Callout.Title>{error}</Callout.Title>
</Callout.Root>

<Callout.Root tone="accent" icon="info-circle">
  <Callout.Title>The pipeline is paused</Callout.Title>
  <Callout.Detail>No step will start.</Callout.Detail>
  <Callout.Actions>
    <Button size="sm" label="Resume" />
  </Callout.Actions>
</Callout.Root>`,
  guidelines: {
    do: [
      'Put what the server actually answered in `<Callout.Detail>`, and the sentence a reader acts on in `<Callout.Title>`.',
      'Let `size` come from the app (`setEntryDefaults`) so the block matches the fields beside it.',
      'Keep the mark on `icon`: it is an affordance, not a part to arrange.',
    ],
    dont: [
      "Don't use it for something that should disappear on its own - that is a toast.",
      "Don't leave the tone at `neutral` for a failure; the colour is half the message.",
      "Don't write more than one action.",
    ],
  },
  matrix: false,
  width: { min: 320, max: 620 },
  component: Callout.Root,
  args: {
    tone: 'danger' as CalloutTone,
    size: 'sm' as ControlSize,
    icon: 'alert-triangle',
  },
  controls: {
    tone: ['neutral', 'accent', 'success', 'danger'],
    size: ['sm', 'md', 'tv'],
    icon: 'icon',
  },
  render: ({ tone, size, icon }) => (
    <Callout.Root tone={tone} size={size} icon={icon}>
      <Callout.Title>The module refused to start</Callout.Title>
      <Callout.Detail>GET /api/module/tv.kroma.remote/remote 502</Callout.Detail>
    </Callout.Root>
  ),
  scenes: [
    {
      name: 'Every tone',
      docs: 'The four the palette has. `accent` is the amber attention block: this design has one warm hue and it carries both a warning and a highlight.',
      render: ({ size }) => (
        <>
          <Callout.Root size={size} tone="neutral">
            <Callout.Title>No indexer configured.</Callout.Title>
          </Callout.Root>
          <Callout.Root size={size} tone="accent" icon="player-pause">
            <Callout.Title>Pipeline paused.</Callout.Title>
          </Callout.Root>
          <Callout.Root size={size} tone="success">
            <Callout.Title>Catalogue reachable, 12 modules.</Callout.Title>
          </Callout.Root>
          <Callout.Root size={size} tone="danger">
            <Callout.Title>The install failed.</Callout.Title>
          </Callout.Root>
        </>
      ),
    },
    {
      name: 'With an action',
      docs: 'The action is pinned to the end of the row rather than under the text, so a one-line block stays one line.',
      render: ({ size, tone }) => (
        <Callout.Root size={size} tone={tone} icon="alert-triangle">
          <Callout.Title>The search came back empty</Callout.Title>
          <Callout.Actions>
            <Button variant="glass" size="sm" icon="refresh" label="Retry" />
          </Callout.Actions>
        </Callout.Root>
      ),
    },
    {
      name: 'Composed',
      docs: 'The whole block is its parts, and content the message column has no name for goes in beside them.',
      render: ({ size, tone }) => (
        <Callout.Root size={size} tone={tone}>
          <Callout.Media name="alert-triangle" />
          <Callout.Title>The module refused to start</Callout.Title>
          <Callout.Detail>GET /api/module/tv.kroma.remote/remote 502</Callout.Detail>
          <Text variant="meta" font="mono" color="textDim">
            supervisor: port 41310 already bound
          </Text>
        </Callout.Root>
      ),
    },
  ],
});
