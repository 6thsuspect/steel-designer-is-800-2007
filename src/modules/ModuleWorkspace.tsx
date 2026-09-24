/**
 * Generic module workspace: input form (with units/tooltips), live results
 * with traffic lights & utilization, and the clause-wise report tab.
 */
import React, { useMemo } from 'react';
import { DesignCase, ProjectState, setState, getState, ModuleKey, MODULES } from '../state/store';
import { evaluateCase, EvalOutput } from './evaluate';
import { SECTION_DB } from '../engine/sections';
import { FIELDS, MATERIAL_FIELDS, FieldDef } from './fields';
import { Card, CheckCard, Field, GroupHeader, ResultSummary, Tabs, StatusBadge } from '../components/ui';
import { SectionSVG, MemberDiagram } from '../components/SectionSVG';
import { ReportView } from '../components/ReportView';
import { exportPDF, exportDOCX } from '../export/exportReport';

function fieldVisible(f: FieldDef, input: Record<string, unknown>): boolean {
  if (!f.showIf) return true;
  if (f.showIf.startsWith('__')) {
    if (f.showIf === '__lacing') return input.builtUpMode === 'lacing';
    if (f.showIf === '__batten') return input.builtUpMode === 'batten';
    if (f.showIf === '__unsupported') return input.laterallySupported === false;
    return true;
  }
  return Boolean(input[f.showIf]);
}

export function ModuleWorkspace({ cs }: { cs: DesignCase }) {
  const ctx = getState();
  const fields = FIELDS[cs.module] ?? [];
  const out: EvalOutput | null = useMemo(() => {
    try {
      return evaluateCase(cs, ctx);
    } catch (e) {
      console.error(e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs, JSON.stringify(ctx.gammas), ctx.name]);

  const setInput = (key: string, v: string | number | boolean) => {
    setState((s) => ({
      ...s,
      cases: s.cases.map((c) => (c.id === cs.id ? { ...c, input: { ...c.input, [key]: v } } : c)),
    }));
  };

  const groups = new Map<string | undefined, FieldDef[]>();
  for (const f of [...MATERIAL_FIELDS, ...fields]) {
    const arr = groups.get(f.group) ?? [];
    arr.push(f);
    groups.set(f.group, arr);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          className="text-lg font-bold bg-transparent border-b border-transparent hover:border-steel-300 focus:border-steel-500 outline-none text-steel-900 px-1"
          value={cs.name}
          onChange={(e) =>
            setState((s) => ({ ...s, cases: s.cases.map((c) => (c.id === cs.id ? { ...c, name: e.target.value } : c)) }))
          }
        />
        {out && (
          <div className="flex items-center gap-2">
            <button onClick={() => exportPDF()} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-steel-700 text-white hover:bg-steel-800">
              Export PDF
            </button>
            <button
              onClick={() => exportDOCX(out.report)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-steel-100 text-steel-800 border border-steel-300 hover:bg-steel-200"
            >
              Export DOCX
            </button>
          </div>
        )}
      </div>

      <Tabs
        active={ctx.activeTab}
        onChange={(t) => setState((s) => ({ ...s, activeTab: t as ProjectState['activeTab'] }))}
        tabs={[
          { key: 'input', label: 'Input' },
          { key: 'results', label: 'Results' },
          { key: 'report', label: 'Report' },
        ]}
      />

      {ctx.activeTab === 'input' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <SectionPicker cs={cs} />
            {[...groups.entries()].map(([g, fs]) => (
              <Card key={g ?? 'general'} title={g ?? 'General'}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {fs
                    .filter((f) => fieldVisible(f, cs.input))
                    .map((f) =>
                      f.key.startsWith('__') ? (
                        <MaterialField key={f.key} f={f} cs={cs} />
                      ) : (
                        <Field
                          key={f.key}
                          label={f.label}
                          unit={f.unit}
                          tooltip={f.tooltip}
                          type={f.type ?? 'number'}
                          step={f.step}
                          options={f.options}
                          min={f.min}
                          max={f.max}
                          value={cs.input[f.key] ?? ''}
                          onChange={(v) => setInput(f.key, v)}
                        />
                      )
                    )}
                </div>
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            <Card title="Section (SVG)" subtitle="Zoom: scroll · Pan: drag · Double-click: reset">
              {out && <SectionSVG section={out.section} highlight="none" />}
            </Card>
            <Card title="Load schematic">
              {out && <MemberDiagram mode={out.diagram.mode} value={out.diagram.value} valueUnit={out.diagram.unit} span={out.diagram.span ?? 3000} />}
            </Card>
          </div>
        </div>
      )}

      {ctx.activeTab === 'results' && out && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <ResultSummary checks={out.checks} />
            {out.checks.map((c) => (
              <CheckCard key={c.id} check={c} />
            ))}
          </div>
          <div className="space-y-4">
            <Card title="Section (SVG)">
              <SectionSVG section={out.section} />
            </Card>
            <Card title="Load schematic">
              <MemberDiagram mode={out.diagram.mode} value={out.diagram.value} valueUnit={out.diagram.unit} span={out.diagram.span ?? 3000} />
            </Card>
            {out.classification && (
              <Card title="Section classification (Table 2)">
                <p className="text-lg font-bold text-steel-900">{out.classification}</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {ctx.activeTab === 'report' && out && <ReportView report={out.report} svgEl={<SectionSVG section={out.section} size={160} showAxes={false} />} />}
    </div>
  );
}

function MaterialField({ f, cs }: { f: FieldDef; cs: DesignCase }) {
  const setMat = (patch: Partial<DesignCase['material']>) =>
    setState((s) => ({
      ...s,
      cases: s.cases.map((c) => (c.id === cs.id ? { ...c, material: { ...c.material, ...patch } } : c)),
    }));
  if (f.key === '__grade') {
    return (
      <Field
        label={f.label}
        type="select"
        tooltip={f.tooltip}
        options={f.options}
        value={cs.material.grade}
        onChange={(v) => setMat({ grade: v as DesignCase['material']['grade'] })}
      />
    );
  }
  return (
    <Field
      label={f.label}
      type="select"
      tooltip={f.tooltip}
      options={f.options}
      value={cs.material.band}
      onChange={(v) => setMat({ band: String(v) })}
    />
  );
}

function SectionPicker({ cs }: { cs: DesignCase }) {
  const setSection = (patch: Partial<DesignCase['section']>) =>
    setState((s) => ({
      ...s,
      cases: s.cases.map((c) => (c.id === cs.id ? { ...c, section: { ...c.section, ...patch } } : c)),
    }));

  const catalogNames = catalogList(cs.section.name);

  return (
    <Card title="Cross-section (FR-1.5)" subtitle="Standard Indian sections (SP:6 / IS 808) or custom (FR-23.1)">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field
          label="Source"
          type="select"
          value={cs.section.kind}
          options={[
            { value: 'catalog', label: 'Standard catalogue' },
            { value: 'custom', label: 'Custom / built-up' },
          ]}
          onChange={(v) => setSection({ kind: v as never })}
        />
        {cs.section.kind === 'catalog' ? (
          <Field label="Designation" type="select" value={cs.section.name} options={catalogNames} onChange={(v) => setSection({ name: v as never })} />
        ) : (
          <CustomSectionEditor cs={cs} setSection={setSection} />
        )}
      </div>
    </Card>
  );
}

function catalogList(current: string) {
  const seen = new Set<string>();
  const opts = SECTION_DB.map((e) => ({ value: e.name, label: e.name + (e.approximate ? ' ≈' : '') }));
  opts.unshift({ value: current, label: current });
  return opts.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
}

function CustomSectionEditor({ cs, setSection }: { cs: DesignCase; setSection: (p: Partial<DesignCase['section']>) => void }) {
  const custom = cs.section.custom ?? { shape: 'I' as const, D: 300, B: 150, tw: 8, tf: 12, r: 10 };
  const upd = (patch: Record<string, unknown>) => setSection({ custom: { ...custom, ...patch } as never, name: `Custom ${patch.shape ?? custom.shape}` });
  return (
    <div className="col-span-2 grid grid-cols-3 gap-2">
      <Field label="Shape" type="select" value={custom.shape ?? 'I'} options={[
        { value: 'I', label: 'I-section (rolled)' }, { value: 'BuiltUpI', label: 'Welded I' }, { value: 'Channel', label: 'Channel' },
        { value: 'Angle', label: 'Angle' }, { value: 'DoubleAngle', label: 'Double angle' }, { value: 'RHS', label: 'RHS' },
        { value: 'SHS', label: 'SHS' }, { value: 'CHS', label: 'CHS' }, { value: 'Plate', label: 'Plate' }, { value: 'Tee', label: 'Tee' },
      ]} onChange={(v) => upd({ shape: v })} />
      <Field label="D / leg1" unit="mm" value={custom.D ?? 300} onChange={(v) => upd({ D: v })} />
      <Field label="B / leg2" unit="mm" value={custom.B ?? 150} onChange={(v) => upd({ B: v })} />
      <Field label="tw" unit="mm" value={custom.tw ?? 8} onChange={(v) => upd({ tw: v })} />
      <Field label="tf / t" unit="mm" value={custom.tf ?? 12} onChange={(v) => upd({ tf: v })} />
      <Field label="Root r" unit="mm" value={custom.r ?? 10} onChange={(v) => upd({ r: v })} />
    </div>
  );
}

/** Placeholder for modules of Phases 2–4 (honest roadmap per PRD §7). */
export function PlannedModule({ moduleKey }: { moduleKey: ModuleKey }) {
  const mod = MODULES.find((m) => m.key === moduleKey)!;
  return (
    <div className="space-y-4">
      <Card title={`${mod.title} — Module ${mod.no}`} subtitle={`Roadmap: Phase ${mod.phase} (PRD §7)`}>
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status="INFO" />
          <span className="text-sm text-steel-600">Scheduled for Phase {mod.phase} — calculation module not yet implemented.</span>
        </div>
        <GroupHeader>Functional requirements in scope</GroupHeader>
        <ul className="list-disc ml-5 text-sm text-steel-700 space-y-1">
          {mod.frs.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
        <GroupHeader>Implementation status</GroupHeader>
        <p className="text-sm text-steel-600">
          The calculation engine (TypeScript, pure functions) is modular — this module will follow the same clause-wise check
          pattern as Modules 2–7 (see <span className="font-mono text-xs">src/engine/</span>). Section classification,
          material library and reporting (Module 24) already support it.
        </p>
      </Card>
    </div>
  );
}
