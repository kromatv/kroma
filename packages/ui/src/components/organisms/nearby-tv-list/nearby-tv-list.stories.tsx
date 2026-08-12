import type { DiscoveredTv } from '@kroma/core';
import type { HandoffOutcome } from '@kroma/core/react';
import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { useT } from '#ui/services/i18n';
import { NearbyTvList } from './nearby-tv-list';

const SALON: DiscoveredTv = {
  handle: 'h-4f2a91',
  name: 'Salon',
  platform: 'tvOS',
  check: 'K7QMR',
  confirmRequired: false,
  via: 'server',
};

const CHAMBRE: DiscoveredTv = {
  handle: 'h-9c0b73',
  name: 'Chambre',
  platform: 'Tizen',
  check: 'B4XRT',
  confirmRequired: false,
  via: 'server',
};

// Heard on this link and never placed by the server, which is what makes it ask
// for its check string, and carrying its platform as its name, which is what a
// set nobody has renamed publishes. The row prints the word once.
const SPARE: DiscoveredTv = {
  handle: 'h-1de55c',
  name: 'webOS',
  platform: 'webOS',
  check: 'M2NDV',
  confirmRequired: true,
  via: 'lan',
  proof: 'e3c17b90',
};

const DEVICES: DiscoveredTv[] = [SALON, CHAMBRE, SPARE];

type RowState = 'resting' | 'connecting' | HandoffOutcome;

const STATES: RowState[] = ['resting', 'connecting', 'done', 'gone', 'checkTooMany'];

const finished = (state: RowState): HandoffOutcome | null =>
  state === 'resting' || state === 'connecting' ? null : state;

function Demo({ state }: Readonly<{ state: RowState }>) {
  const t = useT();
  return (
    <NearbyTvList
      devices={DEVICES}
      connectingHandle={state === 'connecting' ? SALON.handle : null}
      outcomeFor={(device) => (device.handle === SALON.handle ? finished(state) : null)}
      onSelect={() => {}}
      t={t}
    />
  );
}

function EveryEnding() {
  const t = useT();
  const outcomes: Record<string, HandoffOutcome> = {
    [CHAMBRE.handle]: 'done',
    [SPARE.handle]: 'gone',
  };
  return (
    <NearbyTvList
      devices={DEVICES}
      connectingHandle={SALON.handle}
      outcomeFor={(device) => outcomes[device.handle] ?? null}
      onSelect={() => {}}
      t={t}
    />
  );
}

function Nothing() {
  const t = useT();
  return (
    <Box gap={10}>
      <NearbyTvList devices={[]} outcomeFor={() => null} onSelect={() => {}} t={t} />
      <Text variant="meta" color="textDim">
        An empty card. Both shells guard this case before they render the list.
      </Text>
    </Box>
  );
}

export default story({
  name: 'NearbyTvList',
  group: 'Layout',
  docs: "The televisions waiting on this network, as rows, drawn once for the two shells that ask: the browser's connect screen and the phone's. A row is the set's name, its platform under that, and the check string it is printing on its own screen - which is there so a television that named itself after yours can be told from yours, not because anyone is usually asked to type it. What a tap DOES lives in `useHandoffPicker`; this says only what a row looks like while it is doing it, and it says it ON the row: a spinner while the grant is in flight, then a tick or the reason it failed, never a notice somewhere else on the page. A finished row stops being pressable, because the beacon behind it is spent and the row is only still there to be read. `t` is a prop rather than the kit's own `useT` because the phone mounts its own translator and would read an empty catalogue here otherwise; the language lens in the toolbar moves these rows.",
  usage: `const { rows, asking, outcomeFor, start, grant, stopAsking } = useHandoffPicker({ devices, connect });

<NearbyTvList
  devices={rows}
  connectingHandle={connecting?.handle}
  outcomeFor={outcomeFor}
  onSelect={start}
  t={t}
/>`,
  guidelines: {
    do: [
      "Feed it `useHandoffPicker`: holding a finished row on screen, ordering the tapped one first and raising the check prompt are all its business, not the list's.",
      "Pass the host's own `t`. The phone's catalogue is not the kit's, and a missing one shows as raw keys.",
      'Answer the empty case yourself, before the list: it renders rows and nothing else.',
    ],
    dont: [
      "Don't report the outcome anywhere but the row. The row is what the thumb is already on, and a line under the list is a second thing to find.",
      "Don't sort or filter the devices on the way in. The picker has already put the tapped row first and is holding it there while the answer is read.",
      "Don't present the check string as something to type. It identifies a set; the one row that must be typed into is the check prompt, which takes the list's place.",
    ],
  },
  matrix: false,
  width: { min: 340, max: 560 },
  component: Demo,
  args: { state: 'resting' as RowState },
  controls: { state: STATES },
  scenes: [
    {
      name: 'Every ending at once',
      docs: 'The three things a row can be saying, together: in flight, signed in, and gone. Only the first is still pressable - the other two have spent their beacons - and each of them has taken the check string off the row, since a set that is answering is no longer a set that has to be told apart.',
      example: () => <EveryEnding />,
    },
    {
      name: 'Nothing found',
      docs: 'What the network usually looks like, and the case the component does NOT answer: given no devices it draws an empty group card, because it has no empty state of its own. The browser renders nothing at all rather than a blank box above the code field, and the phone puts an `<EmptyState>` there instead - "still looking" for the first few seconds, then "nothing here, and why".',
      example: () => <Nothing />,
    },
  ],
});
