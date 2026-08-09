// The install dialog: a dry-run plan (see module-install-plan.tsx) the admin
// confirms before anything is fetched, then live per-module progress off the
// `module.op.*` stream while the install runs. Resolves `true` when an
// install was attempted, so the caller refreshes; `false` on a plain cancel.
// Built on the kit `Dialog`, which stacks above the detail drawer.

import type { StoreOptionalModule, StorePlan } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, Dialog, Progress } from '@kroma/ui/kit';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCallable } from 'react-call';
import { fetchInstallPlan, installById, message } from '#web/features/admin/module-api';
import { ErrorBox, PlanStage } from '#web/features/admin/module-install-plan';
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
    <div className="py-2">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[12.5px]">
        <span className="truncate font-semibold text-text">{name}</span>
        <span className={`shrink-0 font-medium ${phase === 'done' ? 'text-success' : 'text-dim'}`}>
          {t(PHASE_KEY[phase])}
          {phase === 'download' && pct !== null ? ` · ${pct}%` : ''}
        </span>
      </div>
      <Progress
        value={runningPct(phase, pct) / 100}
        color={phase === 'done' ? 'success' : 'accent'}
        size={5}
        rounded
      />
    </div>
  );
}

export const InstallModal = createCallable<{ id: string }, boolean>(({ call, id }) => {
  const t = useT();
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
    fetchInstallPlan(id, include)
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
  }, [id, include, stage]);

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
    installById(id, include)
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

  const requestedName = plan?.modules.find((m) => m.requested)?.name ?? id;
  const title = (() => {
    if (stage === 'done') return t('admin.modulesPhaseDone');
    if (stage === 'error') return t('admin.modulesInstallFailed');
    return t('admin.modulesInstallTitle', { name: requestedName });
  })();
  // A running install is not cancellable, so neither is the dialog.
  const close = () => {
    if (stage === 'running') return;
    call.end(stage === 'done' || stage === 'error');
  };

  return (
    <Dialog open title={title} onClose={close} width={520}>
      {stage === 'plan' && (
        <PlanStage
          plan={plan}
          busy={planBusy}
          error={planError}
          optional={optional}
          include={include}
          onToggle={(mid, on) =>
            setInclude((prev) => (on ? [...prev, mid] : prev.filter((x) => x !== mid)))
          }
          onCancel={() => call.end(false)}
          onRun={run}
        />
      )}

      {stage === 'running' && (
        <div className="divide-y divide-white/5">
          {rows.map((r) => (
            <RunningRow key={r.id} name={r.name} op={op?.modules[r.id]} />
          ))}
        </div>
      )}

      {(stage === 'done' || stage === 'error') && (
        <>
          {stage === 'error' && rows.length > 0 && (
            <div className="mb-4 divide-y divide-white/5">
              {rows.map((r) => (
                <RunningRow key={r.id} name={r.name} op={op?.modules[r.id]} />
              ))}
            </div>
          )}
          {stage === 'done' ? (
            <div className="flex items-start gap-2.5 text-[13.5px] text-success">
              <IconCircleCheckFilled size={18} className="mt-0.5 shrink-0" />
              <p className="break-words font-semibold">{result}</p>
            </div>
          ) : (
            <ErrorBox text={result ?? ''} />
          )}
          <div className="mt-5 flex justify-end">
            <Button
              variant="glass"
              size="sm"
              label={t('common.close')}
              onPress={() => call.end(true)}
            />
          </div>
        </>
      )}
    </Dialog>
  );
});
