import { story } from '@kroma/workbench/story';
import { AVATAR_GRADIENTS } from '#ui/components/atoms/avatar';
import { Box } from '#ui/components/atoms/box';
import { PersonCard, personCardVariants } from './person-card';

const CAST = [
  { name: 'Sigourney Weaver', role: 'Ellen Ripley' },
  { name: 'Tom Skerritt', role: 'Dallas' },
  { name: 'Veronica Cartwright', role: 'Lambert' },
  { name: 'Harry Dean Stanton', role: 'Brett' },
];

export default story({
  name: 'PersonCard',
  group: 'Media',
  docs: 'A person, as a circle: the cast rail tile at both distances. The focus ring is drawn on the **photo**, never as a box around the tile and its caption: a rectangle around a circle reads as a form field, a lit circle reads as a face being pointed at. On glass there is no focus, so the card dims under the thumb instead.',
  usage: `<PersonCard name={member.name} role={member.character} photo={art} onPress={open} />
<PersonCard size="sm" name={member.name} role={member.character} />`,
  guidelines: {
    do: [
      'Give the faces in one rail different gradients, so neighbours never share a wash.',
      'Pass a `label` saying where the card leads; the name alone is not an action.',
    ],
    dont: [
      "Don't put a job title in `role` on a cast rail - it is the character, and the two read alike at a glance.",
    ],
  },
  variants: personCardVariants,
  component: PersonCard,
  args: { name: 'Sigourney Weaver', role: 'Ellen Ripley' },
  scenes: [
    {
      name: 'A cast rail',
      docs: 'Four faces with no photos: the initials fall back onto their own wash.',
      render: (props) => (
        <Box row gap={24}>
          {CAST.map((member, i) => (
            <PersonCard
              key={member.name}
              {...props}
              name={member.name}
              role={member.role}
              gradient={AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}
            />
          ))}
        </Box>
      ),
    },
  ],
});
