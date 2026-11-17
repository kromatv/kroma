import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Button } from '@kromatv/ui/kit/atoms/button';
import { Divider } from '@kromatv/ui/kit/atoms/divider';
import { Icon } from '@kromatv/ui/kit/atoms/icon';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { Tooltip } from '@kromatv/ui/kit/molecules/tooltip';
import { Fragment, useState } from 'react';
import { MessageForm } from '#site/components/message-form.component';
import { type GroupStatus, type MessageGroup, needsConfirm, statusOf } from '#site/lib/row-filter';
import type { MessageTarget } from '#site/lib/use-message-save.hook';

type Tone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

const STATUS: Record<GroupStatus, { label: string; tone: Tone; hint: string } | null> = {
  missing: { label: 'Missing', tone: 'danger', hint: 'Not translated yet' },
  draft: { label: 'Not sent', tone: 'info', hint: 'Saved here; send your changes to propose it' },
  proposed: { label: 'In pull request', tone: 'success', hint: 'Waiting for a maintainer' },
  confirmed: { label: 'Confirmed', tone: 'neutral', hint: 'Your next send records it as read' },
  outdated: {
    label: 'Outdated',
    tone: 'warning',
    hint: 'The source changed since this was translated',
  },
  unreviewed: {
    label: 'Unreviewed',
    tone: 'info',
    hint: 'A machine translated it; read it, then confirm or fix it',
  },
  translated: null,
};

function Status({ status }: Readonly<{ status: GroupStatus }>) {
  const said = STATUS[status];
  if (!said) {
    return null;
  }
  return (
    <Tooltip label={said.hint}>
      <Badge tone={said.tone}>{said.label}</Badge>
    </Tooltip>
  );
}

/** Notes for translators, each beside its mark. */
export function Notes({ notes }: Readonly<{ notes: readonly string[] }>) {
  if (notes.length === 0) {
    return null;
  }
  return (
    <Column gap={4} px={10} py={8} radius="md" bg="tint/4">
      {notes.map((note) => (
        <Row key={note} gap={8} align="flex-start">
          <Icon name="info-circle" size={15} color="textDim" />
          <Box shrink={1} minW={0}>
            <Text variant="meta" color="textMuted">
              {note}
            </Text>
          </Box>
        </Row>
      ))}
    </Column>
  );
}

/** What one message of the editor is shown with: whether the viewer may edit and confirm it, which form a link named, and the notes already shown above the list. */
export interface CardContext {
  target: MessageTarget;
  editable: boolean;
  linked: string | null;
  shared: readonly string[];
  confirm: { busy: boolean; run: (key: string) => void };
}

function Heading({ group, context }: Readonly<{ group: MessageGroup; context: CardContext }>) {
  const plural = group.rows.length > 1 || group.rows[0]?.plural !== null;
  return (
    <Row gap={8} wrap align="center">
      <Box shrink={1} minW={0}>
        <Text variant="meta" font="mono" color="textDim" lines={1} selectable>
          {group.key}
        </Text>
      </Box>
      {plural ? (
        <Box>
          <Badge tone="neutral">Plural</Badge>
        </Box>
      ) : null}
      <Status status={statusOf(group)} />
      {context.editable && needsConfirm(group) ? (
        <Box ml="auto">
          <Button
            variant="ghost"
            size="sm"
            icon="check"
            label="Confirm"
            loading={context.confirm.busy}
            onPress={() => context.confirm.run(group.key)}
          />
        </Box>
      ) : null}
    </Row>
  );
}

function Forms({
  group,
  context,
  onFocusChange,
}: Readonly<{
  group: MessageGroup;
  context: CardContext;
  onFocusChange: (focused: boolean) => void;
}>) {
  const { target, editable } = context;
  return group.rows.map((row, at) => (
    <Fragment key={row.key}>
      {at > 0 ? <Divider /> : null}
      <MessageForm
        form={{ row, target, editable, linked: row.key === context.linked, onFocusChange }}
      />
    </Fragment>
  ));
}

/**
 * One message in the editor: its key and where it stands, its own notes for
 * translators, then a form per plural form, its border lit while one of them
 * is being typed in.
 */
export function MessageCard({
  group,
  context,
}: Readonly<{ group: MessageGroup; context: CardContext }>) {
  const [focused, setFocused] = useState(false);
  const notes = (group.rows[0]?.notes ?? []).filter((note) => !context.shared.includes(note));
  return (
    <Box
      bg="surface1"
      border={focused ? 'accent/60' : 'border'}
      radius="lg"
      px={16}
      py={12}
      gap={10}
    >
      <Heading group={group} context={context} />
      <Notes notes={notes} />
      <Forms group={group} context={context} onFocusChange={setFocused} />
    </Box>
  );
}
