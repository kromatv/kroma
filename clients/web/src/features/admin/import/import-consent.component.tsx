import type { Importer } from '@kromatv/client/importers';
import { useT } from '@kromatv/ui';
import { GuidedFlow } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  useHeldModules,
  useImporterInstall,
  useImporterPlan,
} from '#web/features/admin/import/use-importer-install.hook';
import { message } from '#web/features/admin/module-api';
import { PlanBody } from '#web/features/admin/module-install-plan';
import { StepFailure } from '#web/shared/ui/step-failure.component';

interface ConsentProps {
  importer: Importer;
  onBack: () => void;
}

interface InstallActionsProps {
  ready: boolean;
  busy: boolean;
  onBack: () => void;
  onInstall: () => void;
}

function InstallActions({ ready, busy, onBack, onInstall }: Readonly<InstallActionsProps>) {
  const t = useT();
  return (
    <GuidedFlow.Footer>
      <GuidedFlow.Previous onPress={onBack} />
      <GuidedFlow.Actions>
        <GuidedFlow.Next
          label={t('admin.modulesInstall')}
          loading={busy}
          disabled={!ready}
          onPress={onInstall}
        />
      </GuidedFlow.Actions>
    </GuidedFlow.Footer>
  );
}

function ConsentPlan({
  importer,
  include,
  onInclude,
}: Readonly<{
  importer: Importer;
  include: string[];
  onInclude: (next: string[]) => void;
}>) {
  const plan = useImporterPlan(importer.id, include);
  const held = useHeldModules();
  return (
    <PlanBody
      plan={plan.data ?? null}
      error={plan.error ? message(plan.error) : null}
      optional={plan.data?.optional ?? []}
      include={include}
      onIncludeChange={onInclude}
      icons={{ [importer.id]: importer.icon }}
      installed={held.data ?? []}
    />
  );
}

/** What an importer the server does not hold will be able to do, shown as the
 * Store shows it before an install. Nothing is fetched until the owner
 * accepts, and the install is held to what this screen showed. */
export function ImportConsent({ importer, onBack }: Readonly<ConsentProps>) {
  const t = useT();
  const name = importer.label ?? importer.name;
  const [include, setInclude] = useState<string[]>([]);
  const plan = useImporterPlan(importer.id, include);
  const install = useImporterInstall(importer.id);
  return (
    <>
      <GuidedFlow.Header>
        <GuidedFlow.Title>{t('admin.modulesInstallTitle', { name })}</GuidedFlow.Title>
        <GuidedFlow.Subtitle>{t('setup.importConsentSub', { name })}</GuidedFlow.Subtitle>
      </GuidedFlow.Header>
      <GuidedFlow.Panel>
        <ConsentPlan importer={importer} include={include} onInclude={setInclude} />
        <StepFailure error={install.isError ? t('setup.importInstallFailed') : null} />
      </GuidedFlow.Panel>
      <InstallActions
        ready={plan.data !== undefined}
        busy={install.isPending}
        onBack={onBack}
        onInstall={() => install.mutate(include)}
      />
    </>
  );
}
