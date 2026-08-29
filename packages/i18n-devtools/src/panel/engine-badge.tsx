import { Icon, Row, Text } from '@kroma/ui/kit';
import { engine } from '../engine/engine';

const GLYPH = 16;

/** Which engine the panel is inspecting. Absent until one is installed: with
 *  no engine there is nothing to name, and nothing works either. */
export function EngineBadge() {
  const { name } = engine();
  if (!name) return null;

  return (
    <Row align="center" justify="space-between" gap={10}>
      <Row align="center" gap={7}>
        <Icon name="plug" size={GLYPH} color="textDim" />
        <Text variant="overline" color="textDim">
          Engine
        </Text>
      </Row>
      <Text variant="label">{name}</Text>
    </Row>
  );
}
