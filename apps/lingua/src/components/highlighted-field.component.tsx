import { styles, useStyles } from '@kromatv/ui/kit';
import { Box } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { TextArea } from '@kromatv/ui/kit/atoms/text-area';
import type { FieldBox } from '#site/lib/field-dom';
import { fieldMarks, type Mark } from '#site/lib/field-marks';
import { useFieldMirror } from '#site/lib/use-field-mirror.hook';
import type { RowView } from '#site/lib/views';

const sDefinition = styles({
  host: { position: 'relative' },
  entry: { font: 'ui' },
  layer: { position: 'absolute', overflow: 'hidden', pointerEvents: 'none' },
  ink: { color: 'transparent', whiteSpace: 'pre-wrap', wordWrap: 'break-word' },
  placeholder: { bg: 'accent/30', radius: 3 },
  ref: { bg: 'info/30', radius: 3 },
  unknown: { bg: 'danger/40', radius: 3 },
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
  return {
    layer: { top: box.top, left: box.left, width: box.width, height: box.height },
    text: {
      fontFamily: box.fontFamily,
      fontSize: box.fontSize,
      fontWeight: weightOf(box.fontWeight),
      lineHeight: box.lineHeight,
      letterSpacing: box.letterSpacing,
      paddingTop: box.padding.top,
      paddingRight: box.padding.right,
      paddingBottom: box.padding.bottom,
      paddingLeft: box.padding.left,
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
            <Text key={mark.at} style={s[mark.tone]}>
              {mark.text}
            </Text>
          ),
        )}
      </Text>
    </Box>
  );
}

/**
 * The translation field, its placeholders and references tinted in place as
 * they are typed: a layer over the kit's field draws the same text in
 * transparent ink, measured off the field itself, so only the tints show and
 * the field keeps its caret, selection, undo and input methods.
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
        textStyle={s.entry}
        placeholder="Not translated yet"
        label={`Translation of ${row.key}`}
        invalid={wiring.invalid}
      />
      {box ? <Mirror box={box} marks={marks} /> : null}
    </Box>
  );
}
