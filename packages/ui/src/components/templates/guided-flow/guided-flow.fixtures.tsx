import { useState } from 'react';
import { Button } from '#ui/components/atoms/button';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { GuidedFlow } from './guided-flow.component';

function StartChoice() {
  const [start, setStart] = useState<string | null>('fresh');
  return (
    <ChoiceList.Root
      size="md"
      ground="surface"
      label="Point de départ"
      value={start}
      onValueChange={setStart}
    >
      <ChoiceList.Item value="fresh">
        <ChoiceList.Media name="sparkles" />
        <ChoiceList.Label>Partir de zéro</ChoiceList.Label>
        <ChoiceList.Hint>Une bibliothèque vide, à remplir de vos dossiers.</ChoiceList.Hint>
      </ChoiceList.Item>
      <ChoiceList.Item value="bring">
        <ChoiceList.Media name="arrows-exchange" />
        <ChoiceList.Label>Migrer depuis Plex ou Jellyfin</ChoiceList.Label>
        <ChoiceList.Hint>Les comptes et ce que chacun a regardé.</ChoiceList.Hint>
      </ChoiceList.Item>
    </ChoiceList.Root>
  );
}

export function Question() {
  return (
    <GuidedFlow.Root label="Configuration">
      <GuidedFlow.Status position={2} count={6}>
        Point de départ
      </GuidedFlow.Status>
      <GuidedFlow.Header>
        <GuidedFlow.Title>Par où commencer ?</GuidedFlow.Title>
        <GuidedFlow.Subtitle>Ce choix ne décide que des étapes suivantes.</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <StartChoice />
      </GuidedFlow.Panel>
      <GuidedFlow.Footer>
        <GuidedFlow.Previous onPress={() => {}} />
        <GuidedFlow.Actions>
          <Button variant="ghost" label="Passer cette étape" onPress={() => {}} />
          <GuidedFlow.Next onPress={() => {}} />
        </GuidedFlow.Actions>
      </GuidedFlow.Footer>
    </GuidedFlow.Root>
  );
}
