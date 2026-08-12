import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Ground } from '#ui/components/atoms/ground';
import { Text } from '#ui/components/atoms/text';
import { SplashBackdrop } from './splash-backdrop';

// Real photographs from the workbench's sample art (see lib/sample-art): the
// grade only reads over an actual image. Larger than the tile sizes on
// purpose: this one fills the whole story box.
const SPLASH_ART = 'https://picsum.photos/seed';
const COVERS = [
  {
    url: `${SPLASH_ART}/kroma-splash-1/1280/720`,
    caption: 'Open Water · 2024',
    eyebrow: 'Film',
  },
  {
    url: `${SPLASH_ART}/kroma-splash-2/1280/720`,
    caption: 'Backlight · 2022',
    eyebrow: 'Series',
  },
];

export default story({
  name: 'SplashBackdrop',
  group: 'Brand',
  docs: "The sign-in screens' ambient artwork, one implementation for web, phone and TV: covers dissolve on a slow drift under a grade dark enough to hold a form, with the **KROMA wheel as a 3px rule** along the bottom edge. Hosts fetch the public `/api/splash` sample, map it to covers, and drop this behind their gate. Decorative by contract: it swallows no pointer events and hides from accessibility.",
  usage: `const covers = splash.map((e) => ({
  url: e.backdropUrl,
  caption: [e.title, e.year].filter(Boolean).join(' · '),
  eyebrow: t(e.kind === 'show' ? 'content.series' : 'content.film'),
}));

<SplashBackdrop covers={covers} />`,
  guidelines: {
    do: [
      'Give the host screen its own readable ground for text the grade alone cannot carry (fields and buttons already bring their fills).',
      'Centre the host content: the radial half of the grade is deepest where a form sits.',
    ],
    dont: [
      "Don't feed it unsized artwork URLs; resolve them like any poster first.",
      "Don't stack another full-screen wash on top - the grade is calibrated for a centred form already, lists and keyboards included.",
      "Don't draw over the bottom 3px; the wheel rule is the brand signature of these screens.",
    ],
  },
  width: 'fill',
  render: () => (
    // Everything inside is absolutely positioned, so the frame must bring its
    // own size: the whole stage where the stage has a height (the device
    // viewports), a tall fixed frame where it does not (Fit).
    <Ground
      tone="dark"
      style={{
        alignSelf: 'stretch',
        width: '100%',
        height: '100%',
        minHeight: 520,
        overflow: 'hidden',
      }}
    >
      <SplashBackdrop covers={COVERS} holdMs={6000} />
      <Box absolute top={0} right={0} bottom={0} left={0} center>
        <Text variant="h1">Who is watching?</Text>
      </Box>
    </Ground>
  ),
});
