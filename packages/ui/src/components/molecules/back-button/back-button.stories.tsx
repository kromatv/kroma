import { story } from '@kroma/workbench/story';
import { BackButton } from './back-button';

export default story({
  name: 'BackButton',
  group: 'Actions',
  docs: "The way back, drawn once: a scrimmed chevron disc that floats over artwork, fills amber on focus for the 10-foot targets, and grows a touch halo on the phone. Pass `label={t('common.back')}` - the default is plain English.",
  usage: `<BackButton onPress={router.back} label={t('common.back')} />
<BackButton variant="ghost" size={40} onPress={router.back} label={t('common.back')} />`,
  guidelines: {
    do: [
      'Use `scrim` (the default) over artwork - a hero backdrop, the player.',
      'Use `ghost` in a page header that already sits on the page colour.',
    ],
    dont: ["Don't hand-roll a chevron disc; five apps did and they all drifted."],
  },
  component: BackButton,
  args: { size: 44, disabled: false, label: 'Back' },
  controls: { size: { min: 32, max: 64, step: 2 } },
});
