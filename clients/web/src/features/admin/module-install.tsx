// The install dialog: a dry-run plan (see module-install-plan.tsx) the admin
// confirms before anything is fetched, then live per-module progress off the
// `module.op.*` stream while the install runs. Resolves `true` when an
// install was attempted, so the caller refreshes; `false` on a plain cancel.
// Built on the kit `Dialog`, which stacks above the detail drawer.

import type { StoreOptionalModule, StorePlan } from '@kromatv/client/modules';
import type { Translate } from '@kromatv/i18n';
import { useFormat, useT } from '@kromatv/ui';
import { Box, Dialog, Divider, Icon, Progress, Row, Text } from '@kromatv/ui/kit';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createCallable } from 'react-call';
import { message } from '#web/features/admin/module-api';
import { useModuleData } from '#web/features/admin/module-data';
import { ErrorBox, PlanBody, planSubtitle } from '#web/features/admin/module-install-plan';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import {
  type OpModule,
  opPct,
  PHASE_KEY,
  runningPct,
  useStoreOps,
} from '#web/features/admin/module-ops';

type Stage = 'plan' | 'running' | 'done' | 'error';

function RunningRow({ name, op }: Readonly<{ name: string; op: OpModule | undefined }>) {
  const t = useT();
  const phase = op?.phase ?? 'wait';
  const pct = op ? opPct(op) : null;
  return (
    <Box py={8}>
      <Row between gap={12} mb={6}>
        <Text variant="meta" lines={1}>
          {name}
        </Text>
        <Text variant="meta" color={phase === 'done' ? 'success' : 'textDim'} shrink={0}>
          {t(PHASE_KEY[phase])}
          {phase === 'download' && pct !== null ? ` · ${pct}%` : ''}
        </Text>
      </Row>
      <Progress
        value={runningPct(phase, pct) / 100}
        color={phase === 'done' ? 'success' : 'accent'}
        thickness={5}
        rounded
      />
    </Box>
  );
}

function dialogTitle(stage: Stage, name: string, updating: boolean, t: Translate): string {
  if (stage === 'done') return t('admin.modulesPhaseDone');
  if (stage === 'error') return t('admin.modulesInstallFailed');
  return t(updating ? 'admin.modulesUpdateTitle' : 'admin.modulesInstallTitle', { name });
}

function Outcome({ stage, result }: Readonly<{ stage: Stage; result: string | null }>) {
  if (stage === 'error') return <ErrorBox text={result ?? ''} />;
  if (stage !== 'done') return null;
  return (
    <Box row align="flex-start" gap={10}>
      <Box mt={2} shrink={0}>
        <Icon name="circle-check-filled" size={18} color="success" />
      </Box>
      <Text variant="meta" color="success">
        {result}
      </Text>
    </Box>
  );
}

function StageActions({
  stage,
  failed,
  busy,
  updating,
  onClose,
  onRun,
}: Readonly<{
  stage: Stage;
  failed: boolean;
  busy: boolean;
  updating: boolean;
  onClose: () => void;
  onRun: () => void;
}>) {
  const t = useT();
  if (stage !== 'plan' || failed) {
    return <Dialog.Actions onCancel={onClose} cancelLabel={t('common.close')} />;
  }
  return (
    <Dialog.Actions
      onCancel={onClose}
      cancelLabel={t('common.cancel')}
      onConfirm={onRun}
      confirmLabel={t(updating ? 'admin.modulesUpdate' : 'admin.modulesInstall')}
      disabled={busy}
    />
  );
}

export const InstallModal = createCallable<{ id: string }, boolean>(({ call, id }) => {
  const webRuntime = useWebRuntime();

  const t = useT();
  const fmt = useFormat();
  const { modules, catalog } = useModuleData();
  const icons = useMemo(
    () => Object.fromEntries((catalog?.modules ?? []).map((m) => [m.id, m.icon])),
    [catalog],
  );
  const [stage, setStage] = useState<Stage>('plan');
  const [plan, setPlan] = useState<StorePlan | null>(null);
  const [planBusy, setPlanBusy] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [optional, setOptional] = useState<StoreOptionalModule[]>([]);
  const [include, setInclude] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const { ops } = useStoreOps();
  const [opId, setOpId] = useState<string | null>(null);
  const defaulted = useRef(false);

  useEffect(() => {
    if (stage !== 'plan') return;
    let alive = true;
    setPlanBusy(true);
    setPlanError(null);
    webRuntime.moduleApi
      .fetchInstallPlan(id, include)
      .then((p) => {
        if (!alive) return;
        setPlan(p);
        // The opt-in list only ever grows: a checked add-on moves into the
        // plan, but its row (and checkbox) must not vanish.
        setOptional((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...p.optional.filter((m) => !known.has(m.id))];
        });
        // The planner marks a lone provider for a required capability as
        // `suggested`; it arrives pre-checked. First response only, so an
        // untick sticks.
        if (!defaulted.current) {
          defaulted.current = true;
          const picks = p.optional.filter((m) => m.suggested).map((m) => m.id);
          if (picks.length > 0) {
            setInclude((prev) => [...new Set([...prev, ...picks])]);
          }
        }
      })
      .catch((e) => {
        if (alive) setPlanError(message(e));
      })
      .finally(() => {
        if (alive) setPlanBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [webRuntime, id, include, stage]);

  // Adopt the op stream the server opened for this install.
  useEffect(() => {
    if (stage !== 'running' || opId) return;
    const match = Object.values(ops).find((o) => o.kind === 'install' && o.requested === id);
    if (match) setOpId(match.op);
  }, [ops, stage, opId, id]);

  const op = opId ? ops[opId] : undefined;
  const rows = useMemo(() => {
    const ids = (plan?.modules ?? []).map((m) => ({ id: m.id, name: m.name }));
    const known = new Set(ids.map((r) => r.id));
    const extra = (op?.order ?? [])
      .filter((oid) => !known.has(oid))
      .map((oid) => ({ id: oid, name: op?.modules[oid]?.name ?? oid }));
    return [...ids, ...extra];
  }, [plan, op]);

  const run = () => {
    setStage('running');
    webRuntime.moduleApi
      .installById(id, include)
      .then((report) => {
        const requested = report.installed.find((m) => m.id === report.requested);
        setResult(t('admin.modulesInstallSuccess', { name: requested?.name ?? report.requested }));
        setStage('done');
      })
      .catch((e) => {
        setResult(message(e));
        setStage('error');
      });
  };

  const requested = plan?.modules.find((m) => m.id === plan.requested);
  const updating = Boolean(requested?.installedVersion);
  const title = dialogTitle(stage, requested?.name ?? id, updating, t);
  const subtitle =
    stage === 'plan' && plan ? planSubtitle(plan, optional, fmt.bytes, t) : undefined;
  // A running install is not cancellable, so neither is the dialog.
  const close = () => {
    if (stage === 'running') return;
    call.end(stage === 'done' || stage === 'error');
  };

  return (
    <Dialog.Root open title={title} description={subtitle} onClose={close} width="md">
      <Dialog.Panel>
        {stage === 'plan' ? (
          <PlanBody
            plan={plan}
            error={planError}
            optional={optional}
            include={include}
            onIncludeChange={setInclude}
            icons={icons}
            installed={modules ?? []}
          />
        ) : null}
        {stage === 'running' || (stage === 'error' && rows.length > 0) ? (
          <Box>
            {rows.map((r, at) => (
              <Fragment key={r.id}>
                {at > 0 ? <Divider color="tint/5" /> : null}
                <RunningRow name={r.name} op={op?.modules[r.id]} />
              </Fragment>
            ))}
          </Box>
        ) : null}
        <Outcome stage={stage} result={result} />
      </Dialog.Panel>
      {stage === 'running' ? null : (
        <Dialog.Footer>
          <StageActions
            stage={stage}
            failed={Boolean(planError)}
            busy={planBusy || !plan}
            updating={updating}
            onClose={() => call.end(stage !== 'plan')}
            onRun={run}
          />
        </Dialog.Footer>
      )}
    </Dialog.Root>
  );
});
