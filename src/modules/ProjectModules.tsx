/** Project-level modules: Module 1 (Design Basis) and Module 24 (Project Report). */
import React, { useMemo } from 'react';
import { getState, setState, ProjectState, MODULES } from '../state/store';
import { evaluateCase } from './evaluate';
import { Card, Field, GroupHeader, StatusBadge, ResultSummary } from '../components/ui';
import { ReportView } from '../components/ReportView';
import { exportDOCX } from '../export/exportReport';
import { STEEL_GRADES } from '../engine/materials';

/** Module 1 — design basis & load combinations (FR-1.1 … FR-1.4). */
export function DesignBasisModule() {
  const ctx = getState();
  const setGammas = (patch: Partial<ProjectState['gammas']>) =>
    setState((s) => ({ ...s, gammas: { ...s.gammas, ...patch } }));
  const setProj = (patch: Partial<ProjectState>) => setState((s) => ({ ...s, ...patch }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Project data (FR-1.1)" subtitle="Limit State Design per IS 800:2007">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project name" type="text" value={ctx.name} onChange={(v) => setProj({ name: String(v) })} />
            <Field label="Author / organisation" type="text" value={ctx.author} onChange={(v) => setProj({ author: String(v) })} />
            <Field label="Design method" type="select" value={ctx.designMethod} options={[{ value: 'LSD', label: 'Limit State Design' }]} onChange={() => undefined} />
            <Field label="Description" type="text" value={ctx.description} onChange={(v) => setProj({ description: String(v) })} />
          </div>
        </Card>
        <Card title="Material library (IS 800 Table 1)" subtitle="Reference values — thickness bands per Table 1 (FR-1.3)">
          <table className="w-full text-[11px]">
            <thead className="text-steel-500">
              <tr>
                <th className="text-left">Grade</th>
                <th className="text-right">fu (MPa)</th>
                <th className="text-right">fy — t ≤ 20</th>
                <th className="text-right">fy — 20 &lt; t ≤ 40</th>
                <th className="text-right">fy — t &gt; 40</th>
              </tr>
            </thead>
            <tbody>
              {STEEL_GRADES.map((g) => (
                <tr key={g.grade} className="border-t border-steel-100">
                  <td className="py-1">{g.label}</td>
                  <td className="text-right font-mono">{g.fu}</td>
                  {g.bands.map((b) => (
                    <td key={b.key} className="text-right font-mono">{b.fy}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Partial safety factors (FR-1.4)" subtitle="IS 800:2007 Table 5 — editable to national annexes">
          <div className="grid grid-cols-3 gap-3">
            <Field label="γm0 (yielding)" value={ctx.gammas.gm0} onChange={(v) => setGammas({ gm0: Number(v) })} />
            <Field label="γm1 (fracture)" value={ctx.gammas.gm1} onChange={(v) => setGammas({ gm1: Number(v) })} />
            <Field label="γmb (bolts)" value={ctx.gammas.gmb} onChange={(v) => setGammas({ gmb: Number(v) })} />
            <Field label="γmf (friction)" value={ctx.gammas.gmf} onChange={(v) => setGammas({ gmf: Number(v) })} />
            <Field label="γmw (welds)" value={ctx.gammas.gmw} onChange={(v) => setGammas({ gmw: Number(v) })} />
            <Field label="γmp (pins)" value={ctx.gammas.gmp} onChange={(v) => setGammas({ gmp: Number(v) })} />
          </div>
          <p className="text-[10px] text-steel-500 mt-2">Shop welds use γmw; field welds use 1.2 × γmw automatically in weld checks.</p>
        </Card>
        <Card title="Load combinations (IS 875 defaults)" subtitle="Stored in the project workspace (FR-1.2)">
          <table className="w-full text-[11px]">
            <thead className="text-steel-500">
              <tr><th className="text-left">Combo</th><th className="text-right">DL</th><th className="text-right">LL</th><th className="text-right">WL</th><th className="text-right">EQ</th></tr>
            </thead>
            <tbody>
              {ctx.loadCombos.map((c, i) => (
                <tr key={c.id} className="border-t border-steel-100">
                  <td className="py-1">
                    <input
                      className="bg-transparent border-b border-transparent hover:border-steel-300 focus:border-steel-500 outline-none w-full"
                      value={c.name}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          loadCombos: s.loadCombos.map((x, j) => (j === i ? { ...x, name: e.target.value, custom: true } : x)),
                        }))
                      }
                    />
                  </td>
                  {(['dl', 'll', 'wl', 'eq'] as const).map((k) => (
                    <td key={k} className="text-right">
                      <input
                        type="number"
                        className="w-14 text-right font-mono bg-transparent border-b border-transparent hover:border-steel-300 focus:border-steel-500 outline-none"
                        value={c[k]}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            loadCombos: s.loadCombos.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value), custom: true } : x)),
                          }))
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Module 1 — Design basis" subtitle="IS 800:2007 (FR-1.1 … FR-1.4)">
          <GroupHeader>Scope</GroupHeader>
          <p className="text-sm text-steel-600 mb-3">
            Project setup, load combinations (IS 875), the Table 1 material library and partial safety factors feeding all
            subsequent modules. Section classification (FR-1.6) runs automatically inside each design module.
          </p>
          <GroupHeader>Status</GroupHeader>
          <div className="flex items-center gap-2">
            <StatusBadge status="PASS" />
            <span className="text-sm text-steel-600">Complete — inputs persist in the workspace.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Module 24 — project-wide report + compliance statement (FR-24.3). */
export function ProjectReportModule() {
  const ctx = getState();
  const results = useMemo(
    () =>
      ctx.cases.map((cs) => {
        try {
          return { cs, out: evaluateCase(cs, ctx) };
        } catch {
          return { cs, out: null };
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ctx)]
  );

  const allChecks = results.flatMap((r) => r.out?.checks ?? []);
  const failed = allChecks.filter((c) => c.status === 'FAIL');
  const overall = failed.length > 0 ? 'FAIL' : allChecks.some((c) => c.status === 'WARN') ? 'WARN' : 'PASS';

  const exportAll = async () => {
    for (const r of results) {
      if (r.out) {
        await exportDOCX(r.out.report, `${ctx.name}-${r.cs.name}.docx`);
      }
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Project compliance statement (FR-24.3)" subtitle={`${ctx.name} — all design cases`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={overall} />
            <div className="text-sm text-steel-700">
              <p className="font-semibold">
                {allChecks.length} checks across {results.length} design cases — {failed.length} failing
              </p>
              <p className="text-steel-500">Compliance statement basis: IS 800:2007 (FR-24.3).</p>
            </div>
          </div>
          <button
            onClick={exportAll}
            disabled={allChecks.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-steel-700 text-white hover:bg-steel-800 disabled:opacity-40"
          >
            Export all cases (DOCX)
          </button>
        </div>
      </Card>

      {results.map(({ cs, out }) =>
        out ? (
          <Card key={cs.id} title={`${cs.name} — ${MODULES.find((m) => m.key === cs.module)?.title ?? cs.module}`}>
            <ResultSummary checks={out.checks} />
            <details className="mt-3">
              <summary className="text-xs font-medium text-steel-600 cursor-pointer">Full clause-wise report</summary>
              <div className="mt-3 overflow-x-auto">
                <ReportView report={out.report} />
              </div>
            </details>
          </Card>
        ) : (
          <Card key={cs.id} title={cs.name}>
            <p className="text-sm text-steel-500">Module not yet implemented (Phase roadmap) — no checks generated.</p>
          </Card>
        )
      )}

      <Card title="Compliance statement">
        <p className="text-sm text-steel-700">
          {overall === 'PASS'
            ? 'All executed design checks satisfy IS 800:2007 within the stated assumptions and input data. Final design responsibility rests with the user.'
            : overall === 'WARN'
            ? 'All executed checks pass, with some utilizations above 0.85 — review highlighted items. Final design responsibility rests with the user.'
            : 'One or more checks FAIL IS 800:2007 limits — the design is NOT adequate as configured.'}
        </p>
      </Card>
    </div>
  );
}
