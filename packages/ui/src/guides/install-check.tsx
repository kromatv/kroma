import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { fonts, space } from '#ui/core/tokens';
import { webDocument, webWindow } from '#ui/lib/dom';
import { iconNames } from '#ui/lib/glyph';
import { iconCategories } from '#ui/lib/icon-catalog';

interface Check {
  label: string;
  found: boolean;
  evidence: string;
}

const PROBE = '--kroma-accent';

const NAME_COLUMN = 132;

const SELF_HOSTED_FACES: readonly string[] = [fonts.display, fonts.ui];

function tokenSheet(): Check {
  const win = webWindow();
  const doc = webDocument();
  if (!(win && doc)) {
    return {
      label: 'Tokens',
      found: true,
      evidence: 'imported as TypeScript; this target has no CSS',
    };
  }
  const value = win.getComputedStyle(doc.documentElement).getPropertyValue(PROBE).trim();
  return {
    label: 'Tokens',
    found: value !== '',
    evidence: value ? `${PROBE} is ${value}` : `${PROBE} resolves to nothing: kromaUI() never ran`,
  };
}

function typefaces(): Check {
  const faces = webDocument()?.fonts;
  if (!faces) {
    return { label: 'Type', found: true, evidence: 'loaded by useFonts(KIT_FONTS)' };
  }
  const declared = new Set(
    [...faces]
      .map((face) => face.family.replace(/["']/g, ''))
      .filter((family) => SELF_HOSTED_FACES.includes(family)),
  );
  return {
    label: 'Type',
    found: declared.size > 0,
    evidence: declared.size
      ? `${[...declared].join(', ')}, served from the bundle`
      : 'no @font-face rule: the fonts half of the stylesheet never expanded',
  };
}

function glyphs(): Check {
  const count = iconNames().length;
  return {
    label: 'Glyphs',
    found: count > 0,
    evidence: `${count} names, which is what the icon pass kept`,
  };
}

function catalogue(): Check {
  const count = iconCategories().length;
  return {
    label: 'Icon catalogue',
    found: count > 0,
    evidence: count > 0 ? `${count} categories` : 'absent, which is what a product build wants',
  };
}

/** What the running bundle can say about its own wiring: the stylesheet, the two
 * faces, the glyph set and the Tabler catalogue. */
function WiringCheck() {
  return (
    <Box gap={space[3]}>
      {[tokenSheet(), typefaces(), glyphs(), catalogue()].map((check) => (
        <Box key={check.label} row gap={space[3]} align="center">
          <Icon
            name={check.found ? 'circle-check-filled' : 'circle-minus'}
            size={18}
            color={check.found ? 'success' : 'textDim'}
          />
          <Text variant="label" w={NAME_COLUMN}>
            {check.label}
          </Text>
          <Box flex minW={0}>
            <Text variant="meta" color="textDim">
              {check.evidence}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export { WiringCheck };
