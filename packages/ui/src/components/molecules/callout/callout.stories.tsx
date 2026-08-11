import { story } from '@kroma/workbench/story';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import type { ControlSize } from '#ui/lib/field-shell';
import { Callout, type CalloutTone } from './callout';

export default story({
  name: 'Callout',
  group: 'Feedback',
  docs: "The toned block a page keeps beside its content: a failure, a warning, a result worth pointing at. A toast arrives and leaves; a callout stays as long as what it reports is true. Its well, corner and rhythm are the control shell's, so one sitting in a form reads as part of the form.",
  usage: `<Callout.Root tone="danger" title={error} />

<Callout.Root tone="accent" icon="info-circle" actions={<Button size="sm" label="Reprendre" />}>
  <Callout.Title>Le pipeline est en pause</Callout.Title>
  <Callout.Detail>Aucune etape ne demarrera.</Callout.Detail>
</Callout.Root>`,
  guidelines: {
    do: [
      'Keep the one-liner: `tone` and `title` write the same parts you would have.',
      'Put what the server actually answered in `detail`, and the sentence a reader acts on in `title`.',
      'Let `size` come from the app (`setEntryDefaults`) so the block matches the fields beside it.',
    ],
    dont: [
      "Don't use it for something that should disappear on its own - that is a toast.",
      "Don't leave the tone at `neutral` for a failure; the colour is half the message.",
      "Don't write more than one action.",
    ],
  },
  matrix: false,
  width: { min: 320, max: 620 },
  args: {
    tone: 'danger' as CalloutTone,
    size: 'sm' as ControlSize,
    icon: 'alert-triangle',
    title: 'Le module a refuse de demarrer',
    detail: 'GET /api/module/tv.kroma.remote/remote 502',
  },
  controls: {
    tone: ['neutral', 'accent', 'success', 'danger'],
    size: ['sm', 'md', 'tv'],
    icon: 'icon',
  },
  render: (props) => <Callout.Root {...props} />,
  scenes: [
    {
      name: 'Every tone',
      docs: 'The four the palette has. `accent` is the amber attention block: this design has one warm hue and it carries both a warning and a highlight.',
      render: ({ size }) => (
        <>
          <Callout.Root size={size} tone="neutral" title="Aucun indexeur configure." />
          <Callout.Root size={size} tone="accent" icon="player-pause" title="Pipeline en pause." />
          <Callout.Root size={size} tone="success" title="Catalogue joignable, 12 modules." />
          <Callout.Root size={size} tone="danger" title="Echec de l'installation." />
        </>
      ),
    },
    {
      name: 'With an action',
      docs: 'The action is pinned to the end of the row rather than under the text, so a one-line block stays one line.',
      render: ({ size, tone }) => (
        <Callout.Root
          size={size}
          tone={tone}
          icon="alert-triangle"
          title="La recherche n'a rien renvoye"
          actions={<Button variant="glass" size="sm" icon="refresh" label="Reessayer" />}
        />
      ),
    },
    {
      name: 'Composed',
      docs: 'The same block written as its parts, plus content the sugar has no name for. Every sugar prop above is a shorthand for one of these, so nothing is reachable only through the one-liner.',
      render: ({ size, tone }) => (
        <Callout.Root size={size} tone={tone}>
          <Callout.Media name="alert-triangle" />
          <Callout.Title>Le module a refuse de demarrer</Callout.Title>
          <Callout.Detail>GET /api/module/tv.kroma.remote/remote 502</Callout.Detail>
          <Text variant="meta" font="mono" color="textDim">
            supervisor: port 41310 already bound
          </Text>
        </Callout.Root>
      ),
    },
  ],
});
