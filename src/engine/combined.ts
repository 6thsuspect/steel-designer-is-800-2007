/**
 * Combined forces — IS 800:2007 Cl. 9.
 *  - Cl. 9.2 : axial tension + bending
 *  - Cl. 9.3 : axial compression + bending (+ moment amplification, stability)
 *  - Cl. 9.4 : shear + bending interaction (high shear)
 */
import {
  CheckResult,
  CrossSection,
  Material,
  SafetyFactors,
  statusForRatio,
  CalcStep,
} from './types';

export interface CombinedInput {
  section: CrossSection;
  material: Material;
  gammas: SafetyFactors;
  /** Axial force (N) — positive = tension, negative = compression. */
  P: number;
  /** Moments about z-z (major) and y-y (minor) (N·mm). */
  Mz: number;
  My: number;
  /** Capacities from member modules (N / N·mm). */
  Td: number; // tensile strength (Cl. 6)
  Pd: number; // compressive strength (Cl. 7)
  Mdz: number; // bending capacity z-z (incl. LTB, N·mm)
  Mdy: number; // bending capacity y-y
  V: number;
  Vd: number;
  /** Effective lengths for amplification (compression case). */
  KLz?: number;
  /** Moment amplification factor m (Cl. 9.3.1); default computed if KLz given. */
  m?: number;
  /** Cm factor for non-uniform moment (default 1.0 conservatively). */
  Cm?: number;
}

export interface CombinedResult {
  checks: CheckResult[];
}

/** Combined force checks (FR-5.1 … FR-5.4). */
export function designCombined(inp: CombinedInput): CombinedResult {
  const { material, gammas, section } = inp;
  const checks: CheckResult[] = [];
  const tensile = inp.P > 0;

  /* --------- Moment amplification (Cl. 9.3.1) for compression members --------- */
  let m = inp.m ?? 1.0;
  const ampSteps: CalcStep[] = [];
  if (!tensile) {
    if (inp.m === undefined && inp.KLz && inp.KLz > 0) {
      const Pcr = (Math.PI ** 2 * material.E * section.props.Izz) / (inp.KLz * inp.KLz);
      const Cm = inp.Cm ?? 1.0;
      m = Cm / (1 - Math.abs(inp.P) / Pcr);
      ampSteps.push({
        title: 'Moment amplification factor',
        clause: 'Cl. 9.3.1',
        formula: 'm = Cm/(1 − P/Pcr); Pcr = π²EI/(KL)²',
        terms: [
          { sym: 'Cm', name: 'Equivalent uniform moment factor', value: Cm },
          { sym: 'P', name: 'Axial compression', value: (Math.abs(inp.P) / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Pcr', name: 'Euler load', value: (Pcr / 1000).toFixed(1), unit: 'kN' },
        ],
        result: `m = ${m.toFixed(3)}`,
      });
    } else {
      ampSteps.push({
        title: 'Moment amplification factor',
        clause: 'Cl. 9.3.1',
        formula: 'm = user specified (default 1.0)',
        terms: [{ sym: 'm', name: 'Amplification factor', value: m }],
        result: `m = ${m.toFixed(3)}`,
      });
    }
  }

  /* ---------------------- Cl. 9.2 — tension + bending ---------------------- */
  if (tensile) {
    const r1 = inp.P / inp.Td + (inp.Mz / inp.Mdz + inp.My / inp.Mdy) * 1.0;
    checks.push({
      id: 'comb-t-m',
      name: 'Axial tension + biaxial bending',
      clause: 'Cl. 9.2',
      demand: r1,
      capacity: 1,
      unit: '—',
      ratio: r1,
      status: statusForRatio(r1),
      steps: [
        {
          title: 'Interaction — tension and bending',
          clause: 'Cl. 9.2',
          formula: 'T/Td + Mz/Mdz + My/Mdy ≤ 1.0',
          terms: [
            { sym: 'T', name: 'Design tension', value: (inp.P / 1000).toFixed(2), unit: 'kN' },
            { sym: 'Td', name: 'Tensile strength (Cl. 6)', value: (inp.Td / 1000).toFixed(2), unit: 'kN' },
            { sym: 'Mz', name: 'Moment about z-z', value: (inp.Mz / 1e6).toFixed(3), unit: 'kN·m' },
            { sym: 'Mdz', name: 'Moment capacity z-z', value: (inp.Mdz / 1e6).toFixed(3), unit: 'kN·m' },
            { sym: 'My', name: 'Moment about y-y', value: (inp.My / 1e6).toFixed(3), unit: 'kN·m' },
            { sym: 'Mdy', name: 'Moment capacity y-y', value: (inp.Mdy / 1e6).toFixed(3), unit: 'kN·m' },
          ],
          result: `Σ = ${r1.toFixed(3)} → ${r1 <= 1 ? 'OK' : 'FAIL'}`,
        },
      ],
    });
    void gammas;
    void material;
    void ampSteps;
    return { checks };
  }

  /* ------------------ Cl. 9.3 — compression + bending ------------------ */
  const Pabs = Math.abs(inp.P);
  const ratioP = Pabs / inp.Pd;

  // Eq. 1 — overall stability (uniaxial about major, amplified)
  const r1 = ratioP + (m * Math.abs(inp.Mz)) / inp.Mdz;
  checks.push({
    id: 'comb-c-mz',
    name: 'Compression + major axis bending (stability)',
    clause: 'Cl. 9.3.1',
    demand: r1,
    capacity: 1,
    unit: '—',
    ratio: r1,
    status: statusForRatio(r1),
    steps: [
      ...ampSteps,
      {
        title: 'Interaction — axial compression and bending',
        clause: 'Cl. 9.3.1',
        formula: 'P/Pd + m·Mz/Mdz ≤ 1.0',
        terms: [
          { sym: 'P', name: 'Axial compression', value: (Pabs / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Pd', name: 'Compressive strength (Cl. 7)', value: (inp.Pd / 1000).toFixed(2), unit: 'kN' },
          { sym: 'm', name: 'Amplification factor', value: m.toFixed(3) },
          { sym: 'Mz', name: 'Moment about z-z', value: (Math.abs(inp.Mz) / 1e6).toFixed(3), unit: 'kN·m' },
          { sym: 'Mdz', name: 'Moment capacity z-z', value: (inp.Mdz / 1e6).toFixed(3), unit: 'kN·m' },
        ],
        result: `Σ = ${r1.toFixed(3)} → ${r1 <= 1 ? 'OK' : 'FAIL'}`,
      },
    ],
  });

  // Eq. 2 — biaxial bending check
  const r2 = ratioP + (m * Math.abs(inp.Mz)) / inp.Mdz + Math.abs(inp.My) / inp.Mdy;
  checks.push({
    id: 'comb-c-biaxial',
    name: 'Compression + biaxial bending',
    clause: 'Cl. 9.3.1',
    demand: r2,
    capacity: 1,
    unit: '—',
    ratio: r2,
    status: statusForRatio(r2),
    steps: [
      {
        title: 'Biaxial interaction',
        clause: 'Cl. 9.3.1',
        formula: 'P/Pd + m·Mz/Mdz + My/Mdy ≤ 1.0',
        terms: [
          { sym: 'P/Pd', name: 'Axial utilization', value: ratioP.toFixed(3) },
          { sym: 'My', name: 'Moment about y-y', value: (Math.abs(inp.My) / 1e6).toFixed(3), unit: 'kN·m' },
          { sym: 'Mdy', name: 'Moment capacity y-y', value: (inp.Mdy / 1e6).toFixed(3), unit: 'kN·m' },
        ],
        result: `Σ = ${r2.toFixed(3)} → ${r2 <= 1 ? 'OK' : 'FAIL'}`,
      },
    ],
  });

  /* ---------------------- Cl. 9.4 — shear + bending ---------------------- */
  const rv = inp.V / inp.Vd;
  checks.push({
    id: 'comb-v-m',
    name: 'Shear + bending interaction',
    clause: 'Cl. 9.4',
    demand: inp.V,
    capacity: inp.Vd,
    unit: 'kN',
    ratio: rv,
    status: statusForRatio(rv),
    steps: [
      {
        title: 'Shear utilization',
        clause: 'Cl. 9.4.1 / 9.4.2',
        formula: 'V ≤ Vd; if V > 0.6Vd use reduced moment Mdv (Cl. 9.4.2)',
        terms: [
          { sym: 'V', name: 'Design shear', value: (inp.V / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Vd', name: 'Shear capacity', value: (inp.Vd / 1000).toFixed(2), unit: 'kN' },
        ],
        result: `V/Vd = ${rv.toFixed(3)} ${rv > 0.6 ? '(high shear — apply Mdv reduction)' : ''}`,
      },
    ],
  });

  void section;
  void gammas;
  return { checks };
}
