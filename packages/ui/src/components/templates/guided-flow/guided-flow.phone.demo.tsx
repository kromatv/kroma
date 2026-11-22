import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Button } from '#ui/components/atoms/button';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { GuidedFlow } from './guided-flow.component';

const SERVERS = [
  { value: 'plex', name: 'Plex', hint: "S'installe avant la connexion.", icon: 'server' },
  { value: 'jellyfin', name: 'Jellyfin', hint: 'Déjà installé.', icon: 'server-2' },
] as const;

function ServerChoice({
  server,
  onServer,
}: Readonly<{ server: string | null; onServer: (next: string) => void }>) {
  return (
    <ChoiceList.Root
      size="md"
      ground="surface"
      label="Serveur"
      value={server}
      onValueChange={onServer}
    >
      {SERVERS.map((choice) => (
        <ChoiceList.Item key={choice.value} value={choice.value}>
          <ChoiceList.Media name={choice.icon} />
          <ChoiceList.Label>{choice.name}</ChoiceList.Label>
          <ChoiceList.Hint>{choice.hint}</ChoiceList.Hint>
        </ChoiceList.Item>
      ))}
    </ChoiceList.Root>
  );
}

/**
 * One question on a phone held upright. With less than 600 points the frame
 * fills its room, the position sits over the question, and the actions stay
 * at the foot of the screen while the choices scroll between them. The hint
 * over the actions says what going forward will do.
 *
 * @name On a phone
 */
export default function OnAPhone() {
  const [server, setServer] = useState<string | null>(null);
  return (
    <Box w={390} h={720}>
      <GuidedFlow.Root label="Migration">
        <GuidedFlow.Status position={1} count={4}>
          Serveur
        </GuidedFlow.Status>
        <GuidedFlow.Header>
          <GuidedFlow.Title>Quel serveur utilisez-vous ?</GuidedFlow.Title>
        </GuidedFlow.Header>
        <GuidedFlow.Panel>
          <ServerChoice server={server} onServer={setServer} />
        </GuidedFlow.Panel>
        <GuidedFlow.Footer>
          <GuidedFlow.Hint>Rien ne change sur votre autre serveur.</GuidedFlow.Hint>
          <GuidedFlow.Previous onPress={() => setServer(null)} />
          <GuidedFlow.Actions>
            <Button variant="ghost" label="Passer" onPress={() => {}} />
            <GuidedFlow.Next disabled={server === null} onPress={() => {}} />
          </GuidedFlow.Actions>
        </GuidedFlow.Footer>
      </GuidedFlow.Root>
    </Box>
  );
}
