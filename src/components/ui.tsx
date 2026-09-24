/**
 * Shared UI primitives: labelled inputs with units & tooltips, status badges,
 * check cards, tabs (PRD §6 — clear labels, units, tooltips, real-time validation).
 */
import React, { ReactNode } from 'react';
import { CheckResult, CheckStatus, CalcStep } from '../engine/types';
import { fmtSmart } from '../engine/format';
import { UtilBar } from './SectionSVG';

export function StatusBadge({ status, small }: { status: CheckStatus; small?: boolean }) {
  const map: Record<CheckStatus, { bg: string; fg: string; label: string }> = {
    PASS: { bg: 'bg-pass', fg: 'text-white', label: 'PASS' },
    WARN: { bg: 'bg-warn', fg: 'text-white', label: 'CHECK' },
    FAIL: { bg: 'bg-fail', fg: 'text-white', label: 'FAIL' },
    INFO: { bg: 'bg-steel-400', fg: 'text-white', label: 'INFO' },
  };
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full ${m.bg} ${m.fg} font-semibold tracking-wide ${
        small ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      }`}
    >
      {m.label}
    </span>
  );
}

export function Field({
  label, value, onChange, unit, tooltip, type = 'number', step, options, min, max,
}: {
  label: string;
  value: number | string | boolean;
  onChange: (v: never) => void;
  unit?: string;
  tooltip?: string;
  type?: 'number' | 'text' | 'select' | 'checkbox';
  step?: number;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}) {
  const invalid =
    type === 'number' &&
    ((min !== undefined && Number(value) < min) || (max !== undefined && Number(value) > max));
  return (
    <label className="block group">
      <span className="flex items-baseline gap-1 text-[11px] font-medium text-steel-600 uppercase tracking-wide">
        {label}
        {unit && <span className="text-steel-400 normal-case font-normal">({unit})</span>}
        {tooltip && (
          <span className="ml-1 text-steel-400 cursor-help" title={tooltip}>
            ⓘ
          </span>
        )}
      </span>
      {type === 'select' ? (
        <select
          className="mt-0.5 w-full rounded-md border border-steel-300 bg-white px-2 py-1.5 text-sm focus:border-steel-500 focus:ring-1 focus:ring-steel-500"
          value={String(value)}
          onChange={(e) => onChange(e.target.value as never)}
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === 'checkbox' ? (
        <span className="mt-1 block">
          <input
            type="checkbox"
            className="rounded border-steel-300 text-steel-600 focus:ring-steel-500"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked as never)}
          />
        </span>
      ) : (
        <input
          type={type}
          step={step}
          className={`mt-0.5 w-full rounded-md border px-2 py-1.5 text-sm font-mono focus:ring-1 ${
            invalid ? 'border-fail bg-red-50 focus:ring-fail' : 'border-steel-300 bg-white focus:border-steel-500 focus:ring-steel-500'
          }`}
          value={String(value)}
          onChange={(e) =>
            onChange((type === 'number' ? (e.target.value === '' ? 0 : parseFloat(e.target.value)) : e.target.value) as never)
          }
        />
      )}
    </label>
  );
}

export function Card({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-steel-200 shadow-sm p-4">
      <header className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-steel-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-steel-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Tabs({ active, onChange, tabs }: { active: string; onChange: (t: string) => void; tabs: Array<{ key: string; label: string }> }) {
  return (
    <div className="flex gap-1 border-b border-steel-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            active === t.key
              ? 'bg-white border border-b-0 border-steel-200 text-steel-900'
              : 'text-steel-500 hover:text-steel-800 hover:bg-steel-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function StepView({ step }: { step: CalcStep }) {
  return (
    <div className="border-l-2 border-steel-200 pl-3 py-1 ml-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-steel-800">{step.title}</span>
        <span className="text-[10px] font-mono bg-steel-100 text-steel-600 rounded px-1.5 py-0.5">{step.clause}</span>
      </div>
      <p className="text-[12px] font-mono text-steel-700 mt-1">{step.formula}</p>
      {step.terms.length > 0 && (
        <table className="text-[11px] mt-1 text-steel-600">
          <tbody>
            {step.terms.map((t, i) => (
              <tr key={i}>
                <td className="pr-2 font-mono font-semibold text-steel-700 align-top">{t.sym}</td>
                <td className="pr-2">{t.name}</td>
                <td className="pr-1 font-mono text-steel-900">{typeof t.value === 'number' ? fmtSmart(t.value) : t.value}</td>
                <td className="text-steel-400">{t.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {step.substituted && <p className="text-[11px] font-mono text-steel-500 mt-1">{step.substituted}</p>}
      <p className="text-[12px] font-mono font-semibold text-steel-900 mt-1">⟹ {step.result}</p>
    </div>
  );
}

export function CheckCard({ check }: { check: CheckResult }) {
  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${check.governing ? 'border-steel-500 ring-1 ring-steel-400' : 'border-steel-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-steel-900">{check.name}</h4>
            <span className="text-[10px] font-mono bg-steel-100 text-steel-600 rounded px-1.5 py-0.5">{check.clause}</span>
            {check.governing && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-steel-700 bg-steel-200 rounded px-1.5 py-0.5">
                Governing
              </span>
            )}
          </div>
          {(check.demand !== undefined && check.capacity !== undefined) && (
            <p className="text-[12px] font-mono text-steel-600 mt-1">
              Demand {fmtSmart(check.demand)} {check.unit} · Capacity {fmtSmart(check.capacity)} {check.unit} · UR{' '}
              <span className={`font-bold ${check.ratio > 1 ? 'text-fail' : check.ratio >= 0.95 ? 'text-warn' : 'text-pass'}`}>
                {check.ratio.toFixed(3)}
              </span>
            </p>
          )}
          {check.status !== 'INFO' && (
            <div className="mt-1.5 max-w-md">
              <UtilBar ratio={check.ratio} />
            </div>
          )}
        </div>
        <StatusBadge status={check.status} />
      </div>
      <details className="mt-2 group">
        <summary className="cursor-pointer text-[11px] text-steel-500 hover:text-steel-800">
          Clause-wise calculations ({check.steps.length} steps)
        </summary>
        <div className="mt-2 space-y-2 bg-steel-50 rounded-lg p-3">
          {check.steps.map((s, i) => (
            <StepView key={i} step={s} />
          ))}
          {check.notes?.map((n, i) => (
            <p key={i} className="text-[11px] text-steel-500 italic">
              Note: {n}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}

export function GroupHeader({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-bold uppercase tracking-wider text-steel-500 mt-4 mb-1.5">{children}</h2>;
}

export function ResultSummary({ checks }: { checks: CheckResult[] }) {
  const gov = checks.find((c) => c.governing);
  const status: CheckStatus = checks.some((c) => c.status === 'FAIL')
    ? 'FAIL'
    : checks.some((c) => c.status === 'WARN')
    ? 'WARN'
    : 'PASS';
  return (
    <div className={`rounded-xl p-4 border ${status === 'PASS' ? 'bg-green-50 border-green-200' : status === 'WARN' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-steel-500 font-semibold">Overall status</p>
          <p className="text-2xl font-bold text-steel-900 mt-0.5">
            {status === 'PASS' ? 'ADEQUATE' : status === 'WARN' ? 'HIGH UTILIZATION' : 'NOT ADEQUATE'}
          </p>
          {gov && (
            <p className="text-[12px] text-steel-600 mt-1">
              Governing: <span className="font-semibold">{gov.name}</span> ({gov.clause}) — UR {gov.ratio.toFixed(3)}
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
