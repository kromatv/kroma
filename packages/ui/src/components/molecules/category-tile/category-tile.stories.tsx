import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { tintGradient } from '#ui/components/molecules/media-card';
import { stillArt } from '#ui/lib/sample-art';
import { CategoryTile, categoryTileVariants } from './category-tile';

/** Three categories with their own hues, the way the genre screen derives them
 *  from the name. The kit does not decide the colours; the screen does. */
const CATEGORIES = [
  {
    label: 'Science fiction',
    meta: '128 titles',
    accent: '#86A8FF',
    tint: ['#2A3358', '#12141F'] as const,
    wash: 'linear-gradient(0deg, rgba(18,20,31,0.92) 0%, rgba(18,20,31,0.55) 45%, rgba(18,20,31,0.08) 100%)',
  },
  {
    label: 'Horror',
    meta: '54 titles',
    accent: '#E56F4A',
    tint: ['#3E1A1C', '#150E10'] as const,
    wash: 'linear-gradient(0deg, rgba(21,14,16,0.92) 0%, rgba(21,14,16,0.55) 45%, rgba(21,14,16,0.08) 100%)',
  },
  {
    label: 'Documentary',
    meta: '212 titles',
    accent: '#5FD3C4',
    tint: ['#16342E', '#0B1614'] as const,
    wash: 'linear-gradient(0deg, rgba(11,22,20,0.92) 0%, rgba(11,22,20,0.55) 45%, rgba(11,22,20,0.08) 100%)',
  },
];

export default story({
  name: 'CategoryTile',
  group: 'Media',
  docs: 'A labelled artwork tile for something that GROUPS titles - a genre, a collection, a channel - rather than being one. Two gradients do two jobs: `background` is the instant fill behind the art, and `wash` is the veil **over** it, which is what keeps white text readable on a photograph nobody picked for its contrast.',
  usage: `<CategoryTile
  label={genre.name}
  meta={t('genres.count', { count })}
  art={sizedImageUrl(backdrop, 328)}
  background={tintGradient(genreColors(genre.name))}
  wash={genreTint(genre.name)}
  accent={genreAccent(genre.name)}
  onPress={open}
/>`,
  guidelines: {
    do: [
      'Always pass a `wash`: without it the label sits on raw artwork and stops being readable.',
      'Derive the hue from the category name so a genre keeps its colour everywhere.',
    ],
    dont: [
      "Don't use it for a single title - that is `MediaCard` (landscape) or `PosterCard` (portrait).",
      "Don't put the count in the label; `meta` is the line for it.",
    ],
  },
  variants: categoryTileVariants,
  matrix: false,
  args: {
    label: 'Science fiction',
    meta: '128 titles',
    width: 340,
    artwork: true,
  },
  controls: { width: { min: 220, max: 460, step: 20 } },
  render: ({ artwork, ...props }) => (
    <CategoryTile
      {...props}
      art={artwork ? stillArt(1) : null}
      background={tintGradient(CATEGORIES[0]?.tint ?? ['#2A3358', '#12141F'])}
      wash={CATEGORIES[0]?.wash}
      accent={CATEGORIES[0]?.accent}
    />
  ),
  scenes: [
    {
      name: 'A genre row',
      docs: 'Three categories, each with its own hue: the wash is what makes the row read as one family rather than three photographs.',
      render: (props) => (
        <Box row wrap gap={12}>
          {CATEGORIES.map((category, at) => (
            <CategoryTile
              {...props}
              key={category.label}
              label={category.label}
              meta={category.meta}
              art={stillArt(at)}
              background={tintGradient(category.tint)}
              wash={category.wash}
              accent={category.accent}
            />
          ))}
        </Box>
      ),
    },
    {
      name: 'No artwork',
      docs: 'The tint alone carries the tile, which is what an empty library looks like.',
      args: { artwork: false },
    },
  ],
});
