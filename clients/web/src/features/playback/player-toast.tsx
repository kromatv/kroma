import { useT } from '@kroma/ui';
import { IconButton } from '@kroma/ui/kit';

/** Centered top toast for transient player notices (audio re-encode, resume, errors). */
export function Toast({
  variant,
  onDismiss,
  action,
  children,
}: Readonly<{
  variant: 'info' | 'danger';
  onDismiss: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}>) {
  const t = useT();
  const border = variant === 'danger' ? 'border-danger/40' : 'border-white/15';
  return (
    <div
      className={`absolute left-1/2 top-6 z-40 flex max-w-160 -translate-x-1/2 items-center gap-3 rounded-xl border ${border} bg-black/80 px-4 py-3 backdrop-blur-md`}
    >
      <span className="text-[13px] text-white/90">{children}</span>
      {action}
      <IconButton
        variant="ghost"
        size={28}
        glyph={16}
        icon="x"
        label={t('player.dismiss')}
        onPress={onDismiss}
      />
    </div>
  );
}
