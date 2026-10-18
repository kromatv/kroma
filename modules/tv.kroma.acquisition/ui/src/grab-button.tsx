import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Button, type ButtonVariant, type IconName, useConfirm } from '@kromatv/ui/kit';

export function GrabButton({
  release,
  picked,
  busy,
  block,
  onGrab,
}: Readonly<{
  release: ScoredReleaseView;
  picked: boolean;
  busy: boolean;
  block: boolean;
  onGrab: (release: ScoredReleaseView) => void;
}>) {
  const t = useT();
  const confirm = useConfirm();
  const refused = release.score == null;
  const take = async () => {
    const yes =
      !refused ||
      (await confirm({
        title: t('acq.grabAnywayTitle'),
        message: t('acq.grabAnywayHint', { name: release.title }),
        confirmLabel: t('acq.grab.anyway'),
        cancelLabel: t('common.cancel'),
      }));
    if (yes) onGrab(release);
  };
  return (
    <Button
      size="sm"
      variant={variantOf(picked, refused)}
      icon={iconOf(release.upgrade, refused)}
      label={t(labelKeyOf(release.upgrade, refused))}
      disabled={busy}
      block={block}
      onPress={() => void take()}
    />
  );
}

function variantOf(picked: boolean, refused: boolean): ButtonVariant {
  if (refused) return 'ghost';
  return picked ? 'primary' : 'glass';
}

function iconOf(upgrade: boolean, refused: boolean): IconName {
  return upgrade && !refused ? 'refresh' : 'download';
}

function labelKeyOf(upgrade: boolean, refused: boolean): string {
  if (refused) return 'acq.grab.anyway';
  return upgrade ? 'acq.grab.replace' : 'acq.grab.take';
}
