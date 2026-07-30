import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
  tv?: boolean;
}

function EmptyState({ icon, title, hint, action, tv = false }: Readonly<EmptyStateProps>) {
  return (
    <Box center mt={tv ? 96 : 64} gap={tv ? 16 : 8}>
      <Icon name={icon} size={tv ? 64 : 32} color="textDim" />
      <Txt variant={tv ? 'h2' : 'label'} style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {hint ? (
        <Txt
          variant={tv ? 'body' : 'meta'}
          color="textDim"
          style={{ textAlign: 'center', maxWidth: tv ? 720 : 400 }}
        >
          {hint}
        </Txt>
      ) : null}
      {action}
    </Box>
  );
}

export type { EmptyStateProps };
export { EmptyState };
