/**
 * Design report builder — Module 24 (FR-24.1 … FR-24.4).
 * Assembles inputs, section properties, clause-wise checks and summary tables
 * into a serialisable model consumed by the Report view, PDF and DOCX export.
 */
import { CheckResult, CheckStatus, CrossSection, Material, SafetyFactors } from './types';
import { fmtSmart } from './format';

export interface ReportInputRow {
  group: string;
  label: string;
  value: string;
  unit?: string;
  ref?: string;
}

export interface DesignReport {
  title: string;
  projectName: string;
  caseName: string;
  module: string;
  date: string;
  code: string;
  author?: string;
  inputs: ReportInputRow[];
  section?: {
    name: string;
    rows: ReportInputRow[];
  };
  material?: {
    grade: string;
    fy: number;
    fu: number;
    rows: ReportInputRow[];
  };
  checks: CheckResult[];
  summary: Array<{
    name: string;
    clause: string;
    demand: number;
    capacity: number;
    unit: string;
    ratio: number;
    status: CheckStatus;
    governing: boolean;
  }>;
  overallStatus: CheckStatus;
  governingCheck: string;
  governingRatio: number;
  notes: string[];
}

export function num(x: number, unit?: string): string {
  return unit ? `${fmtSmart(x)} ${unit}` : fmtSmart(x);
}

/**
 * Build a full design report from a set of checks + context (FR-24.2).
 */
export function buildReport(ctx: {
  projectName: string;
  caseName: string;
  module: string;
  author?: string;
  inputs: ReportInputRow[];
  checks: CheckResult[];
  section?: CrossSection;
  material?: Material;
  gammas?: SafetyFactors;
  extraNotes?: string[];
}): DesignReport {
  const checks = ctx.checks.map((c) => ({ ...c }));
  // mark governing = max utilization among demand-bearing checks
  let govIdx = -1;
  let govRatio = 0;
  checks.forEach((c, i) => {
    if (c.demand !== undefined && c.ratio > 0 && c.status !== 'INFO') {
      if (c.ratio > govRatio) {
        govRatio = c.ratio;
        govIdx = i;
      }
    }
  });
  if (govIdx >= 0) checks[govIdx].governing = true;

  const overall: CheckStatus = checks.some((c) => c.status === 'FAIL')
    ? 'FAIL'
    : checks.some((c) => c.status === 'WARN')
    ? 'WARN'
    : 'PASS';

  const summary = checks.map((c) => ({
    name: c.name,
    clause: c.clause,
    demand: c.demand ?? 0,
    capacity: c.capacity ?? 0,
    unit: c.unit,
    ratio: c.ratio,
    status: c.status,
    governing: !!c.governing,
  }));

  const notes = [
    ...ctx.extraNotes ?? [],
    ...checks.flatMap((c) => c.notes ?? []),
  ];

  const report: DesignReport = {
    title: 'Steel Design Report — IS 800:2007',
    projectName: ctx.projectName,
    caseName: ctx.caseName,
    module: ctx.module,
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    code: 'IS 800:2007 — General Construction in Steel — Code of Practice',
    author: ctx.author,
    inputs: ctx.inputs,
    checks,
    summary,
    overallStatus: overall,
    governingCheck: govIdx >= 0 ? checks[govIdx].name : '—',
    governingRatio: govRatio,
    notes,
  };

  if (ctx.section) {
    report.section = sectionRows(ctx.section);
  }
  if (ctx.material) {
    report.material = {
      grade: ctx.material.grade,
      fy: ctx.material.fy,
      fu: ctx.material.fu,
      rows: [
        { group: 'Material', label: 'Grade', value: ctx.material.grade, ref: 'Table 1' },
        { group: 'Material', label: 'Yield stress fy', value: num(ctx.material.fy, 'MPa'), ref: 'Table 1' },
        { group: 'Material', label: 'Ultimate stress fu', value: num(ctx.material.fu, 'MPa'), ref: 'Table 1' },
        { group: 'Material', label: "Young's modulus E", value: num(ctx.material.E, 'MPa'), ref: 'Cl. 2.4' },
      ],
    };
    if (ctx.gammas) {
      report.material.rows.push(
        { group: 'Safety', label: 'γm0 (yielding)', value: String(ctx.gammas.gm0), ref: 'Table 5' },
        { group: 'Safety', label: 'γm1 (ultimate)', value: String(ctx.gammas.gm1), ref: 'Table 5' }
      );
    }
  }

  return report;
}

export function sectionRows(s: CrossSection): { name: string; rows: ReportInputRow[] } {
  const p = s.props;
  return {
    name: s.name,
    rows: [
      { group: 'Section', label: 'Designation', value: s.name },
      { group: 'Section', label: 'Area A', value: num(p.area, 'mm²') },
      { group: 'Section', label: 'Depth × Width', value: `${num(p.height)} × ${num(p.width, 'mm')}` },
      { group: 'Section', label: 'Izz (major)', value: `${(p.Izz / 1e4).toFixed(1)} cm⁴` },
      { group: 'Section', label: 'Iyy (minor)', value: `${(p.Iyy / 1e4).toFixed(1)} cm⁴` },
      { group: 'Section', label: 'Zze (elastic)', value: `${(p.Zze / 1e3).toFixed(1)} cm³` },
      { group: 'Section', label: 'Zye (elastic)', value: `${(p.Zye / 1e3).toFixed(1)} cm³` },
      { group: 'Section', label: 'Zpz (plastic)', value: `${(p.Zpz / 1e3).toFixed(1)} cm³` },
      { group: 'Section', label: 'Zpy (plastic)', value: `${(p.Zpy / 1e3).toFixed(1)} cm³` },
      { group: 'Section', label: 'rz', value: num(p.rz, 'mm') },
      { group: 'Section', label: 'ry', value: num(p.ry, 'mm') },
    ],
  };
}
