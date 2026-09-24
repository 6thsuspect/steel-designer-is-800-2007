/**
 * Professional printable design report (Module 24 / FR-24.2).
 * Also exported to PDF (print) and DOCX.
 */
import React from 'react';
import { DesignReport } from '../engine/report';
import { fmtSmart } from '../engine/format';
import { StatusBadge } from './ui';
import { UtilBar } from './SectionSVG';

export function ReportView({ report, svgEl }: { report: DesignReport; svgEl?: React.ReactNode }) {
  return (
    <article id="design-report" className="bg-white rounded-xl border border-steel-200 shadow-sm p-8 max-w-4xl mx-auto text-steel-900 print:border-0 print:shadow-none">
      <header className="border-b-2 border-steel-800 pb-4 mb-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{report.title}</h1>
            <p className="text-[11px] text-steel-500 mt-0.5">{report.code}</p>
          </div>
          <div className="text-right text-[11px] text-steel-600">
            <p className="font-semibold text-steel-900">{report.projectName}</p>
            <p>{report.caseName} — {report.module}</p>
            <p>Date: {report.date}</p>
            {report.author && <p>Prepared by: {report.author}</p>}
          </div>
        </div>
      </header>

      <div className={`mb-5 rounded-lg border p-3 flex items-center justify-between ${
        report.overallStatus === 'PASS' ? 'bg-green-50 border-green-200' : report.overallStatus === 'WARN' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
      }`}>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-steel-500 font-bold">Overall result</p>
          <p className="text-lg font-bold">
            {report.overallStatus === 'PASS' ? 'PASS — ADEQUATE' : report.overallStatus === 'WARN' ? 'PASS — HIGH UTILIZATION' : 'FAIL — NOT ADEQUATE'}
          </p>
          <p className="text-[11px] text-steel-600">
            Governing check: {report.governingCheck} (UR = {report.governingRatio.toFixed(3)})
          </p>
        </div>
        <StatusBadge status={report.overallStatus} />
      </div>

      <SectionTitle>1. Input Summary</SectionTitle>
      <PropTable rows={report.inputs} />

      {report.material && (
        <>
          <SectionTitle>2. Material & Safety Factors</SectionTitle>
          <PropTable rows={report.material.rows} />
        </>
      )}

      {report.section && (
        <>
          <SectionTitle>3. Section Properties</SectionTitle>
          <div className="flex gap-4 items-start">
            <div className="flex-1">
              <PropTable rows={report.section.rows} />
            </div>
            {svgEl && <div className="w-52 shrink-0 print:w-44">{svgEl}</div>}
          </div>
        </>
      )}

      <SectionTitle>4. Clause-wise Calculations</SectionTitle>
      <div className="space-y-4">
        {report.checks.map((c, i) => (
          <div key={i} className="border border-steel-200 rounded-lg p-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <p className="text-[13px] font-semibold">
                4.{i + 1} {c.name} <span className="text-[10px] font-mono bg-steel-100 rounded px-1.5 py-0.5 ml-1">{c.clause}</span>
                {c.governing && <span className="ml-2 text-[10px] uppercase font-bold text-steel-600">— governing</span>}
              </p>
              <StatusBadge status={c.status} small />
            </div>
            {c.demand !== undefined && (
              <p className="text-[11px] font-mono text-steel-600 mt-1">
                Demand = {fmtSmart(c.demand)} {c.unit}; Capacity = {fmtSmart(c.capacity ?? 0)} {c.unit}; UR = {c.ratio.toFixed(3)}
              </p>
            )}
            <div className="mt-1 max-w-xs">
              <UtilBar ratio={Math.min(c.ratio, 1.2)} />
            </div>
            {c.steps.map((s, j) => (
              <div key={j} className="mt-2 ml-2 border-l border-steel-200 pl-2">
                <p className="text-[11px] font-semibold">
                  {s.title} <span className="text-steel-400 font-normal">[{s.clause}]</span>
                </p>
                <p className="text-[11px] font-mono">{s.formula}</p>
                {s.terms.map((t, k) => (
                  <p key={k} className="text-[10px] font-mono text-steel-600">
                    {t.sym} = {typeof t.value === 'number' ? fmtSmart(t.value) : t.value} {t.unit ?? ''} <span className="font-sans">({t.name})</span>
                  </p>
                ))}
                {s.substituted && <p className="text-[10px] font-mono text-steel-500">{s.substituted}</p>}
                <p className="text-[11px] font-mono font-semibold">⟹ {s.result}</p>
              </div>
            ))}
            {c.notes?.map((nt, k) => (
              <p key={k} className="text-[10px] italic text-steel-500 mt-1">Note: {nt}</p>
            ))}
          </div>
        ))}
      </div>

      <SectionTitle>5. Summary of Design Checks</SectionTitle>
      <table className="w-full text-[11px] border border-steel-300">
        <thead className="bg-steel-100">
          <tr>
            <th className="p-1.5 text-left border-b border-steel-300">#</th>
            <th className="p-1.5 text-left border-b border-steel-300">Check</th>
            <th className="p-1.5 text-left border-b border-steel-300">Clause</th>
            <th className="p-1.5 text-right border-b border-steel-300">Demand</th>
            <th className="p-1.5 text-right border-b border-steel-300">Capacity</th>
            <th className="p-1.5 text-right border-b border-steel-300">UR</th>
            <th className="p-1.5 text-center border-b border-steel-300">Status</th>
          </tr>
        </thead>
        <tbody>
          {report.summary.map((s, i) => (
            <tr key={i} className={s.governing ? 'bg-steel-50 font-semibold' : ''}>
              <td className="p-1.5 border-b border-steel-200">{i + 1}</td>
              <td className="p-1.5 border-b border-steel-200">{s.name}{s.governing ? ' ★' : ''}</td>
              <td className="p-1.5 border-b border-steel-200 font-mono text-[10px]">{s.clause}</td>
              <td className="p-1.5 border-b border-steel-200 text-right font-mono">{fmtSmart(s.demand)}</td>
              <td className="p-1.5 border-b border-steel-200 text-right font-mono">{fmtSmart(s.capacity)}</td>
              <td className="p-1.5 border-b border-steel-200 text-right font-mono">{s.ratio.toFixed(3)}</td>
              <td className="p-1.5 border-b border-steel-200 text-center"><StatusBadge status={s.status} small /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.notes.length > 0 && (
        <>
          <SectionTitle>6. Notes</SectionTitle>
          <ul className="list-disc ml-5 text-[11px] text-steel-600 space-y-1">
            {report.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}

      <footer className="mt-8 pt-3 border-t border-steel-300 text-[10px] text-steel-500 flex justify-between">
        <span>Generated by Steel Designer IS800 v1.1.0 — calculations per IS 800:2007.</span>
        <span>Design is the user's responsibility — verify inputs and results independently.</span>
      </footer>
    </article>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-bold uppercase tracking-wide text-steel-800 mt-6 mb-2 border-b border-steel-200 pb-1">{children}</h2>;
}

function PropTable({ rows }: { rows: Array<{ group: string; label: string; value: string; unit?: string; ref?: string }> }) {
  return (
    <table className="w-full text-[11px] border border-steel-300">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="p-1.5 border-b border-steel-200 w-40 text-steel-500">{r.group}</td>
            <td className="p-1.5 border-b border-steel-200">{r.label}{r.unit ? ` (${r.unit})` : ''}</td>
            <td className="p-1.5 border-b border-steel-200 font-mono font-semibold">{r.value}</td>
            <td className="p-1.5 border-b border-steel-200 text-[10px] font-mono text-steel-400 w-24">{r.ref ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
