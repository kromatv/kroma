import type { SetupLine, SetupState } from '@kromatv/client/setup';
import { useT } from '@kromatv/ui';
import { Button, Icon, IconButton, ListRow, Row, Section } from '@kromatv/ui/kit';
import { setupAddress, useSetupAnswered, useSetupState } from '#web/shared/lib/setup-state';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { RouteLink } from '#web/shared/ui/route-link.component';

const LINE = {
  import: { icon: 'arrows-exchange', name: 'setup.stepImport', hint: 'admin.setupLineImport' },
  media: { icon: 'folder', name: 'setup.stepMedia', hint: 'admin.setupLineMedia' },
  modules: { icon: 'download', name: 'setup.stepModules', hint: 'admin.setupLineModules' },
  people: { icon: 'users', name: 'setup.stepPeople', hint: 'admin.setupLinePeople' },
  privacy: { icon: 'shield-check', name: 'setup.stepPrivacy', hint: 'admin.setupLinePrivacy' },
} as const satisfies Record<SetupLine, { icon: string; name: string; hint: string }>;

interface LineProps {
  setup: SetupState;
  line: SetupLine;
  onDismiss: (line: SetupLine) => void;
}

function ChecklistLine({ setup, line, onDismiss }: Readonly<LineProps>) {
  const t = useT();
  const words = LINE[line];
  return (
    <ListRow.Root icon={words.icon} chevron={false}>
      <ListRow.Label>{t(words.name)}</ListRow.Label>
      <ListRow.Hint>{t(words.hint)}</ListRow.Hint>
      <ListRow.Trailing>
        <Row gap={8} align="center">
          <Button variant="glass" size="sm" label={t('admin.setupLineOpen')} asChild>
            <RouteLink to="/setup" search={setupAddress(setup, line)} />
          </Button>
          <IconButton
            control="sm"
            label={t('admin.setupLineDismiss', { name: t(words.name) })}
            onPress={() => onDismiss(line)}
          >
            <Icon name="x" size={15} />
          </IconButton>
        </Row>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

/** The setup the checklist is drawn from, none when no line is left, and the
 * press that takes a line off it for good. */
export function useSetupChecklist() {
  const { client } = useWebRuntime();
  const answered = useSetupAnswered();
  const setup = useSetupState().data?.setup;
  const dismiss = (line: SetupLine) => client.setup.dismiss(line).then(answered, () => undefined);
  return { setup: setup?.checklist.length ? setup : null, dismiss };
}

/** What an ended setup left for later, one line per step not done. A line
 * opens its step or leaves for good, and the list goes once it is empty. */
export function SetupChecklist() {
  const t = useT();
  const { setup, dismiss } = useSetupChecklist();
  if (!setup) {
    return null;
  }
  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('admin.setupChecklistTitle')}</Section.Title>
      </Section.Header>
      <ListRow.Group>
        {setup.checklist.map((line) => (
          <ChecklistLine
            key={line}
            setup={setup}
            line={line}
            onDismiss={(dismissed) => void dismiss(dismissed)}
          />
        ))}
      </ListRow.Group>
    </Section.Root>
  );
}
