import { Row } from '#ui/components/atoms/box';
import { Kbd } from '#ui/components/atoms/kbd';
import { onAppleHardware } from '#ui/lib/command-key';

/** The chord that opens a palette, one cap per key, as this machine's keyboard prints
 *  it: Command and K on Apple hardware, Ctrl and K everywhere else. */
function CommandKeys() {
  return (
    <Row gap={3}>
      {onAppleHardware() ? <Kbd icon="command" /> : <Kbd>Ctrl</Kbd>}
      <Kbd>K</Kbd>
    </Row>
  );
}

export { CommandKeys };
