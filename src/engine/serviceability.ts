/**
 * Serviceability checks — IS 800:2007 Cl. 5.6 (deflection) and common limits
 * used with IS 875 / SP:6 practice (Module 21, FR-21.1 … FR-21.3).
 */
import { CheckResult, statusForRatio, CalcStep } from './types';

export interface DeflectionInput {
  /** Deflection computed from elastic analysis (mm). */
  delta: number;
  span: number; // mm
  /** Deflection limit as span/L ratio (e.g. 300 for span/300). */
  limitRatio: number;
  /** Optional deflection due to live/variable load only (for span/360-type checks). */
  deltaLive?: number;
  limitRatioLive?: number;
  label?: string;
}

/** Common deflection limit presets used in Indian practice. */
export const DEFLECTION_LIMITS = [
  { key: 'span/180', label: 'Span/180 (general, IS 800 Cl. 5.6.1?)', ratio: 180 },
  { key: 'span/240', label: 'Span/240 (general industrial)', ratio: 240 },
  { key: 'span/300', label: 'Span/300 (roof beams)', ratio: 300 },
  { key: 'span/320', label: 'Span/320 (plastered soffits)', ratio: 320 },
  { key: 'span/360', label: 'Span/360 (brittle finishes / live load)', ratio: 360 },
  { key: 'span/500', label: 'Span/500 (crane girders)', ratio: 500 },
];

/** Elastic deflection formula helpers (mm, N, MPa). */
export const DEFLECTION_FORMULAS = {
  udlSimplySupported: (w: number, L: number, E: number, I: number) => ((5 * w * Math.pow(L, 4)) / (384 * E * I)) * 1000, // w in N/mm
  pointLoadMid: (P: number, L: number, E: number, I: number) => ((P * Math.pow(L, 3)) / (48 * E * I)),
  cantileverUDL: (w: number, L: number, E: number, I: number) => ((w * Math.pow(L, 4)) / (8 * E * I)) * 1000,
  cantileverPoint: (P: number, L: number, E: number, I: number) => ((P * Math.pow(L, 3)) / (3 * E * I)),
};

export function checkDeflection(inp: DeflectionInput): CheckResult[] {
  const checks: CheckResult[] = [];
  const allowable = inp.span / inp.limitRatio;
  const ratio = inp.delta / allowable;
  const steps: CalcStep[] = [
    {
      title: 'Deflection check (serviceability)',
      clause: 'Cl. 5.6.1 / Annex (deflection limits)',
      formula: `δ ≤ span/${inp.limitRatio}`,
      terms: [
        { sym: 'δ', name: 'Computed deflection', value: inp.delta.toFixed(2), unit: 'mm' },
        { sym: 'span', name: 'Effective span', value: inp.span.toFixed(0), unit: 'mm' },
        { sym: 'limit', name: 'Allowable deflection', value: allowable.toFixed(2), unit: 'mm' },
      ],
      result: `${inp.delta.toFixed(2)} mm vs ${allowable.toFixed(2)} mm → ${ratio <= 1 ? 'OK' : 'FAIL'}`,
    },
  ];
  checks.push({
    id: 's-deflection',
    name: `Deflection — ${inp.label ?? 'total'}`,
    clause: 'Cl. 5.6.1',
    demand: inp.delta,
    capacity: allowable,
    unit: 'mm',
    ratio,
    status: statusForRatio(ratio),
    steps,
  });

  if (inp.deltaLive !== undefined && inp.limitRatioLive) {
    const allowL = inp.span / inp.limitRatioLive;
    const ratioL = inp.deltaLive / allowL;
    checks.push({
      id: 's-deflection-live',
      name: 'Deflection — variable load',
      clause: 'Cl. 5.6.1',
      demand: inp.deltaLive,
      capacity: allowL,
      unit: 'mm',
      ratio: ratioL,
      status: statusForRatio(ratioL),
      steps: [
        {
          title: 'Live-load deflection',
          clause: 'Cl. 5.6.1',
          formula: `δLL ≤ span/${inp.limitRatioLive}`,
          terms: [
            { sym: 'δLL', name: 'Live load deflection', value: inp.deltaLive.toFixed(2), unit: 'mm' },
            { sym: 'limit', name: 'Allowable', value: allowL.toFixed(2), unit: 'mm' },
          ],
          result: `${ratioL <= 1 ? 'OK' : 'FAIL'}`,
        },
      ],
    });
  }
  return checks;
}

/** Frame drift check (FR-21.2) — simplified storey drift limit (H/300 default). */
export function checkDrift(drift: number, storeyHeight: number, limitRatio = 300): CheckResult {
  const allowable = storeyHeight / limitRatio;
  const ratio = drift / allowable;
  return {
    id: 's-drift',
    name: 'Storey drift',
    clause: 'IS 1893 / Cl. 5.6 (serviceability)',
    demand: drift,
    capacity: allowable,
    unit: 'mm',
    ratio,
    status: statusForRatio(ratio),
    steps: [
      {
        title: 'Inter-storey drift',
        clause: 'IS 1893 Cl. 7.11 (reference)',
        formula: `δ ≤ H/${limitRatio}`,
        terms: [
          { sym: 'δ', name: 'Drift', value: drift.toFixed(2), unit: 'mm' },
          { sym: 'H', name: 'Storey height', value: storeyHeight.toFixed(0), unit: 'mm' },
        ],
        result: `${drift.toFixed(2)} mm vs ${allowable.toFixed(2)} mm → ${ratio <= 1 ? 'OK' : 'FAIL'}`,
      },
    ],
  };
}
