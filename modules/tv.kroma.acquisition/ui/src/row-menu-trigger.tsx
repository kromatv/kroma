import { IconButton, Menu } from '@kromatv/ui/kit';

export function RowMenuTrigger({ label }: Readonly<{ label: string }>) {
  return (
    <Menu.Trigger
      render={(bind) => (
        <IconButton
          ref={bind.ref}
          control="sm"
          radius="sm"
          variant="ghost"
          icon="dots-vertical"
          label={label}
          expanded={bind.expanded}
          onPress={bind.onPress}
        />
      )}
    />
  );
}
