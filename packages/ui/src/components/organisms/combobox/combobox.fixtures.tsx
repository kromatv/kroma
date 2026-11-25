import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Field } from '#ui/components/molecules/field';
import type { ControlSize } from '#ui/lib/field-shell';
import { Combobox, type ComboboxRootProps } from './combobox.component';

const PHOTO = 'https://picsum.photos/seed';

export interface Person {
  name: string;
  photoUrl: string | null;
  knownFor: string;
}

const LOADED: Person = {
  name: 'Timothée Chalamet',
  photoUrl: `${PHOTO}/kroma-chalamet/96`,
  knownFor: 'Dune',
};

const BARDEM: Person = {
  name: 'Javier Bardem',
  photoUrl: `${PHOTO}/kroma-bardem/96`,
  knownFor: 'Skyfall',
};

export const PEOPLE: readonly Person[] = [
  LOADED,
  { name: 'Tilda Swinton', photoUrl: `${PHOTO}/kroma-swinton/96`, knownFor: 'Suspiria' },
  { name: 'Rebecca Ferguson', photoUrl: null, knownFor: 'Mission: Impossible' },
  BARDEM,
  { name: 'Josh Brolin', photoUrl: `${PHOTO}/kroma-brolin/96`, knownFor: 'Sicario' },
];

export interface CastArgs {
  size?: ControlSize;
  invalid?: boolean;
  disabled?: boolean;
  presentation?: ComboboxRootProps['presentation'];
}

function searchPeople(query: string): readonly Person[] {
  const needle = query.trim().toLowerCase();
  return needle === '' ? [] : PEOPLE.filter((person) => person.name.toLowerCase().includes(needle));
}

/** One cast row of the Edit info dialog: an actor's name, searched on TMDB as
 *  it is typed, with the face of the person the row was loaded with. */
export function CastRow({ presentation, ...args }: Readonly<CastArgs>) {
  const [name, setName] = useState(LOADED.name);
  return (
    <Field.Root label="Actor" size={args.size}>
      <Combobox.Root
        value={name}
        onValueChange={setName}
        filter={false}
        placeholder="Search for a person"
        presentation={presentation}
        {...args}
      >
        <Combobox.Value value={LOADED.name}>
          <Combobox.Media src={LOADED.photoUrl} />
        </Combobox.Value>
        {searchPeople(name).map((person) => (
          <Combobox.Item key={person.name} value={person.name}>
            <Combobox.Media src={person.photoUrl} />
            <Combobox.Hint>{`Acting · ${person.knownFor}`}</Combobox.Hint>
          </Combobox.Item>
        ))}
        <Combobox.Empty>No one by that name on TMDB.</Combobox.Empty>
      </Combobox.Root>
      <Field.Hint>Pick a person, or keep the name as typed.</Field.Hint>
    </Field.Root>
  );
}

function Held({
  label,
  name,
  photo,
}: Readonly<{ label: string; name: string; photo?: string | null }>) {
  return (
    <Field.Root label={label}>
      <Combobox.Root defaultValue={name}>
        {photo === undefined ? null : (
          <Combobox.Value value={name}>
            <Combobox.Media src={photo} />
          </Combobox.Value>
        )}
      </Combobox.Root>
    </Field.Root>
  );
}

/** The three faces an entry can wear: a photo, the initials of a person with
 *  none, and nothing for a name typed as it is. */
export function Faces() {
  return (
    <Box gap={20}>
      <Held label="With a photo" name={BARDEM.name} photo={BARDEM.photoUrl} />
      <Held label="Without one" name="Rebecca Ferguson" photo={null} />
      <Held label="Typed as it is" name="A stand-in" />
    </Box>
  );
}

/** A cast row under a text entry, so the two wells line up. */
export function Form(args: Readonly<CastArgs>) {
  return (
    <Box gap={20}>
      <Field.Root label="Character" size={args.size}>
        <Field.Input defaultValue="Paul Atreides" />
      </Field.Root>
      <CastRow {...args} />
    </Box>
  );
}
