import { DEFAULT_ICON_SIZE, hasGlyph, type IconName } from '#ui/lib/glyph';

export // The glyphs the apps actually reach for, so the sheet below is a tour of the
// design rather than a dump of six thousand icons.
const IN_USE: IconName[] = [
  'player-play',
  'player-pause',
  'player-track-next',
  'rewind-backward-10',
  'rewind-forward-10',
  'volume',
  'volume-off',
  'badge-cc',
  'settings',
  'picture-in-picture',
  'maximize',
  'search',
  'home',
  'device-tv',
  'download',
  'star',
  'check',
  'x',
  'chevron-right',
  'mood-empty',
];

export const SIZES = [16, 20, DEFAULT_ICON_SIZE, 28, 36, 48];

export // Wrong on purpose - a typo and a name a server-installed module might invent
// - so they are cast rather than typed: `IconName` exists precisely to make
// `<Icon name="chevron-rihgt" />` fail to compile, and this is the one place
// that has to opt out of it.
const UNKNOWN = ['chevron-rihgt', 'glyph-from-a-module'] as unknown as IconName[];

export // A control's value arrives as an unknown; anything that is not a real glyph
// falls back on render anyway, so this only has to satisfy the type.
const asName = (value: unknown, fallback: IconName): IconName => {
  const name = typeof value === 'string' ? value : '';
  return hasGlyph(name) ? name : fallback;
};
