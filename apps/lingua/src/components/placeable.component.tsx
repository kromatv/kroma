import { type StyleDecl, svFor, type TypeRole } from '@kromatv/ui/kit';
import { Box, Row } from '@kromatv/ui/kit/atoms/box';
import { Focusable } from '@kromatv/ui/kit/atoms/focusable';
import { Icon, type IconName } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Tooltip } from '@kromatv/ui/kit/molecules/tooltip';
import { type Part, partsOf, type Variable, type VariableState } from '#site/lib/placeables';
import { placeableHint } from '#site/lib/plural-examples';

type TokenTone = 'placeholder' | 'ref' | VariableState;

const token = svFor<{ root: StyleDecl; label: StyleDecl; glyph: { color: string } }>()({
  slots: {
    root: { row: true, align: 'center', gap: 3, px: 5, mx: 1, radius: 5, borderWidth: 1 },
    label: { fontSize: 13, lineHeight: 18 },
    glyph: { color: 'text' },
  },
  variants: {
    tone: {
      placeholder: {
        root: { bg: 'accentSoft', border: 'accent/35', _hover: { bg: 'accentSoftHover' } },
        label: { color: 'accentText' },
      },
      ref: {
        root: { bg: 'info/12', border: 'info/35', _hover: { bg: 'info/22' } },
        label: { color: 'info' },
      },
      present: {
        root: { bg: 'success/12', border: 'success/35' },
        label: { color: 'success' },
        glyph: { color: 'success' },
      },
      missing: {
        root: { bg: 'accentSoft', border: 'accent/50', _hover: { bg: 'accentSoftHover' } },
        label: { color: 'accentText' },
        glyph: { color: 'accentText' },
      },
      optional: {
        root: { bg: 'tint/6', border: 'border' },
        label: { color: 'textMuted' },
        glyph: { color: 'textMuted' },
      },
      unknown: {
        root: { bg: 'danger/12', border: 'danger/40' },
        label: { color: 'danger' },
        glyph: { color: 'danger' },
      },
    },
  },
  defaults: { tone: 'placeholder' },
});

const GLYPH: Partial<Record<TokenTone, IconName>> = {
  present: 'check',
  missing: 'plus',
  unknown: 'alert-circle',
};

function Placeable({
  value,
  tone,
  hint,
  onInsert,
}: Readonly<{ value: string; tone: TokenTone; hint: string; onInsert?: () => void }>) {
  const glyph = GLYPH[tone];
  return (
    <Tooltip label={hint}>
      <Focusable
        sv={token}
        vars={{ tone }}
        label={onInsert ? `Insert ${value}` : value}
        role={onInsert ? 'button' : 'none'}
        tabbable={onInsert !== undefined}
        onPress={onInsert}
        focusScale={1}
      >
        {({ slots }) => (
          <>
            {glyph ? <Icon name={glyph} size={12} color={slots.glyph.color} /> : null}
            <Text font="mono" style={slots.label}>
              {value}
            </Text>
          </>
        )}
      </Focusable>
    </Tooltip>
  );
}

/** How a text with placeables is drawn, and what pressing a placeable does. */
export interface PlaceableLook {
  variant?: TypeRole;
  color?: 'text' | 'textMuted' | 'textDim';
  plural: boolean;
  onInsert?: (value: string) => void;
}

function chipOf(part: Exclude<Part, { kind: 'text' }>, look: PlaceableLook) {
  const { onInsert } = look;
  return (
    <Placeable
      key={part.at}
      value={part.value}
      tone={part.kind}
      hint={placeableHint(part, { plural: look.plural })}
      onInsert={onInsert ? () => onInsert(part.value) : undefined}
    />
  );
}

/** A message's text with its placeholders and references drawn as chips; `onInsert` makes them insert into the field. */
export function PlaceableText({ text, look }: Readonly<{ text: string; look: PlaceableLook }>) {
  return (
    <Text variant={look.variant ?? 'body'} color={look.color ?? 'text'}>
      {partsOf(text).map((part) => (part.kind === 'text' ? part.value : chipOf(part, look)))}
    </Text>
  );
}

const STATE_HINT: Record<VariableState, string> = {
  present: 'In your translation',
  missing: 'Missing from your translation. Press to insert it.',
  optional: 'This plural form may leave it out. Press to insert it.',
  unknown: 'Not in the source: the app would show it as written',
};

/** The source's placeholders as the translation being typed uses them, and any it names that the source does not. */
export function VariablesLine({
  id,
  variables,
  onInsert,
}: Readonly<{ id: string; variables: readonly Variable[]; onInsert?: (value: string) => void }>) {
  if (variables.length === 0) {
    return null;
  }
  return (
    <Row nativeID={id} gap={6} wrap align="center" accessibilityLiveRegion="polite">
      <Text variant="meta" color="textDim">
        Variables
      </Text>
      {variables.map((variable) => (
        <Box key={variable.name}>
          <Placeable
            value={variable.value}
            tone={variable.state}
            hint={STATE_HINT[variable.state]}
            onInsert={
              onInsert && (variable.state === 'missing' || variable.state === 'optional')
                ? () => onInsert(variable.value)
                : undefined
            }
          />
        </Box>
      ))}
    </Row>
  );
}
