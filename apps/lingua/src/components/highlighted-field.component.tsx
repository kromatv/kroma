import { styles, useStyles } from '@kromatv/ui/kit';
import { Box } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { TextArea } from '@kromatv/ui/kit/atoms/text-area';
import type { FieldBox } from '#site/lib/field-dom';
import { fieldMarks, type Mark } from '#site/lib/field-marks';
import { useFieldMirror } from '#site/lib/use-field-mirror.hook';
import type { RowView } from '#site/lib/views';

const CHIP = { borderWidth: 1, radius: 5, px: 2, py: 1, mx: -3 } as const;
const BLEED = 4;
const WORD_SPACING = 2;

const sDefinition = styles({
  host: { position: 'relative' },
  entry: { font: 'ui', wordSpacing: WORD_SPACING },
  traced: { font: 'ui', wordSpacing: WORD_SPACING, color: 'transparent', caretColor: 'text' },
  layer: { position: 'absolute', overflow: 'hidden', pointerEvents: 'none' },
  ink: {
    color: 'text',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    wordSpacing: WORD_SPACING,
  },
  placeholder: { ...CHIP, color: 'accentText', bg: 'accentSoft', border: 'accent/35' },
  ref: { ...CHIP, color: 'info', bg: 'info/12', border: 'info/35' },
  unknown: { ...CHIP, color: 'danger', bg: 'danger/12', border: 'danger/40' },
});

/** What the field is for and what it does as it is typed in and left. */
export interface FieldWiring {
  row: RowView;
  value: string;
  invalid: boolean;
  describedBy: string;
  onValueChange: (next: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;

const weightOf = (weight: string) => WEIGHTS.find((known) => known === weight) ?? '400';

function geometryOf(box: FieldBox) {
  const type = {
    fontFamily: box.fontFamily,
    fontSize: box.fontSize,
    fontWeight: weightOf(box.fontWeight),
    lineHeight: box.lineHeight,
    letterSpacing: box.letterSpacing,
  };
  return {
    layer: {
      top: box.top,
      left: box.left - BLEED,
      width: box.width + 2 * BLEED,
      height: box.height,
    },
    type,
    text: {
      ...type,
      paddingTop: box.padding.top,
      paddingRight: box.padding.right + BLEED,
      paddingBottom: box.padding.bottom,
      paddingLeft: box.padding.left + BLEED,
      transform: [{ translateY: -box.scrollTop }],
    },
  };
}

function Mirror({ box, marks }: Readonly<{ box: FieldBox; marks: readonly Mark[] }>) {
  const s = useStyles(sDefinition);
  const geometry = geometryOf(box);
  return (
    <Box style={[s.layer, geometry.layer]} aria-hidden>
      <Text style={[s.ink, geometry.text]}>
        {marks.map((mark) =>
          mark.tone === 'plain' ? (
            mark.text
          ) : (
            <Text key={mark.at} style={[s[mark.tone], geometry.type]}>
              {mark.text}
            </Text>
          ),
        )}
      </Text>
    </Box>
  );
}

/**
 * The translation field, its placeholders and references drawn as the chips
 * the source shows, in place, as they are typed. A layer over the kit's field
 * draws the text, measured off the field itself, and the field under it keeps
 * its caret, selection, undo and input methods with its own ink transparent.
 * A chip's padding and border hang over its neighbours instead of pushing
 * them, so every character stays where the field put it; the field sets its
 * words a little apart to leave them room, and the layer runs past the
 * field's sides so a chip at the edge of a line is drawn whole. Until the
 * layer is measured the field shows its own text.
 */
export function HighlightedField({ wiring }: Readonly<{ wiring: FieldWiring }>) {
  const s = useStyles(sDefinition);
  const { row } = wiring;
  const box = useFieldMirror(row.key, wiring.describedBy);
  const marks = fieldMarks(wiring.value, row.source, { plural: row.plural !== null });
  return (
    <Box style={s.host} dataSet={{ mirror: row.key }}>
      <TextArea
        value={wiring.value}
        onValueChange={wiring.onValueChange}
        onFocus={wiring.onFocus}
        onBlur={wiring.onBlur}
        rows={1}
        maxRows={8}
        textStyle={box ? s.traced : s.entry}
        placeholder="Not translated yet"
        label={`Translation of ${row.key}`}
        invalid={wiring.invalid}
      />
      {box ? <Mirror box={box} marks={marks} /> : null}
    </Box>
  );
}
