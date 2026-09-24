/**
 * Compression member buckling — IS 800:2007
 *  - Table 10  : buckling class of cross-sections
 *  - Table 7   : imperfection factors α
 *  - Cl. 7.1.2 : Perry–Robertson design stress fcd
 *  - Table 3   : effective length factors (end conditions)
 */
import { BucklingClass, CrossSection, Material, CalcStep } from './types';

/** Imperfection factors — IS 800:2007 Table 7. */
export const IMPERFECTION: Record<BucklingClass, number> = {
  a: 0.21,
  b: 0.34,
  c: 0.49,
  d: 0.76,
};

export type Axis = 'zz' | 'yy';

/**
 * Buckling class of a cross-section — IS 800:2007 Table 10.
 *
 * Rolled I-sections:
 *   h/bf > 1.2 : tf ≤ 40 → a (z-z), b (y-y);  40 < tf ≤ 100 → b (z-z), c (y-y);  tf > 100 → d (z-z), d (y-y)
 *   h/bf ≤ 1.2 : tf ≤ 100 → b (z-z), c (y-y); tf > 100 → d (z-z), d (y-y)
 * Welded I: tf ≤ 40 → b (z-z), c (y-y); tf > 40 → c (z-z), d (y-y)
 * Hollow: hot-rolled → a; cold-formed → b (any axis)
 * Welded box: b generally; c for thick welds with slender panels
 * Channel / angle / T / solid: c (any axis)
 * Built-up members: c (any axis)
 */
export function bucklingClass(section: CrossSection, axis: Axis): BucklingClass {
  const { h, b, tf = 0 } = section.elements;
  switch (section.shape) {
    case 'I':
    case 'BuiltUpI': {
      if (section.shape === 'BuiltUpI' || section.type === 'Welded') {
        if (tf <= 40) return axis === 'zz' ? 'b' : 'c';
        return axis === 'zz' ? 'c' : 'd';
      }
      // rolled I
      const ratio = h / (b || 1);
      if (ratio > 1.2) {
        if (tf <= 40) return axis === 'zz' ? 'a' : 'b';
        if (tf <= 100) return axis === 'zz' ? 'b' : 'c';
        return 'd';
      }
      if (tf <= 100) return axis === 'zz' ? 'b' : 'c';
      return 'd';
    }
    case 'RHS':
    case 'SHS':
    case 'CHS':
      return section.type === 'ColdFormed' ? 'b' : 'a';
    case 'Channel':
    case 'Angle':
    case 'DoubleAngle':
    case 'DoubleChannel':
    case 'Tee':
    case 'Plate':
    case 'Custom':
    default:
      return 'c';
  }
}

export interface BucklingStrength {
  lambda: number; // effective slenderness KL/r
  lambdaBar: number; // non-dimensional λ̄ = √(fy/fcc)
  fcc: number; // Euler stress, MPa
  alpha: number;
  phi: number;
  chi: number; // stress reduction factor ≤ 1
  fcd: number; // design compressive stress, MPa
  cls: BucklingClass;
  steps: CalcStep[];
}

/**
 * Design compressive stress fcd — IS 800:2007 Cl. 7.1.2.
 *   λ̄ = √(fy/fcc),  fcc = π²E/λ²
 *   φ = 0.5[1 + α(λ̄ − 0.2) + λ̄²]
 *   χ = 1/[φ + √(φ² − λ̄²)] ≤ 1.0
 *   fcd = χ·fy/γm0
 */
export function designCompressiveStress(
  lambda: number,
  material: Material,
  cls: BucklingClass,
  gm0: number
): BucklingStrength {
  const alpha = IMPERFECTION[cls];
  const fcc = (Math.PI ** 2 * material.E) / (lambda * lambda);
  const lambdaBar = Math.sqrt(material.fy / fcc);
  const phi = 0.5 * (1 + alpha * (lambdaBar - 0.2) + lambdaBar * lambdaBar);
  const chi = Math.min(1, 1 / (phi + Math.sqrt(Math.max(phi * phi - lambdaBar * lambdaBar, 0))));
  const fcd = (chi * material.fy) / gm0;

  const steps: CalcStep[] = [
    {
      title: 'Euler buckling stress',
      clause: 'Cl. 7.1.2',
      formula: 'fcc = π²E / (KL/r)²',
      terms: [
        { sym: 'E', name: "Young's modulus", value: material.E, unit: 'MPa' },
        { sym: 'KL/r', name: 'Effective slenderness', value: lambda, unit: '—' },
      ],
      result: `fcc = ${fcc.toFixed(1)} MPa`,
    },
    {
      title: 'Non-dimensional effective slenderness',
      clause: 'Cl. 7.1.2',
      formula: 'λ̄ = √(fy/fcc)',
      terms: [
        { sym: 'fy', name: 'Yield stress', value: material.fy, unit: 'MPa' },
        { sym: 'fcc', name: 'Euler stress', value: fcc.toFixed(1), unit: 'MPa' },
      ],
      result: `λ̄ = ${lambdaBar.toFixed(3)}`,
    },
    {
      title: 'Imperfection factor',
      clause: 'Table 7 / Table 10',
      formula: 'α = f(buckling class)',
      terms: [{ sym: 'class', name: 'Buckling class (Table 10)', value: cls }],
      result: `α = ${alpha}`,
    },
    {
      title: 'Perry factor φ and reduction factor χ',
      clause: 'Cl. 7.1.2',
      formula: 'φ = 0.5[1 + α(λ̄ − 0.2) + λ̄²]; χ = 1/[φ + √(φ² − λ̄²)] ≤ 1.0',
      terms: [
        { sym: 'α', name: 'Imperfection factor', value: alpha },
        { sym: 'λ̄', name: 'Non-dimensional slenderness', value: lambdaBar.toFixed(3) },
      ],
      result: `φ = ${phi.toFixed(3)}, χ = ${chi.toFixed(4)}`,
    },
    {
      title: 'Design compressive stress',
      clause: 'Cl. 7.1.2.1',
      formula: 'fcd = χ·fy/γm0',
      terms: [
        { sym: 'χ', name: 'Stress reduction factor', value: chi.toFixed(4) },
        { sym: 'fy', name: 'Yield stress', value: material.fy, unit: 'MPa' },
        { sym: 'γm0', name: 'Partial safety factor', value: gm0 },
      ],
      result: `fcd = ${fcd.toFixed(1)} MPa`,
    },
  ];

  return { lambda, lambdaBar, fcc, alpha, phi, chi, fcd, cls, steps };
}

/** Effective-length presets — IS 800:2007 Table 3 (recommended values). */
export const END_CONDITIONS: Array<{ key: string; label: string; k: number }> = [
  { key: 'ff', label: 'Both ends fixed (rotation + translation)', k: 0.65 },
  { key: 'fp', label: 'Fixed–pinned', k: 0.8 },
  { key: 'pp', label: 'Both ends pinned (hinged)', k: 1.0 },
  { key: 'fr', label: 'Fixed–roller (against sway)', k: 1.0 },
  { key: 'pf', label: 'Pinned–free (cantilever)', k: 2.0 },
  { key: 'sway', label: 'Sway frame (unrestrained top)', k: 1.2 },
];

/** Maximum slenderness — IS 800:2007 Cl. 3.8 (serviceability). */
export const MAX_SLENDERNESS = {
  compression: 180, // Table 3 note / Cl. 3.8
  tensionNoReversal: 400,
  tensionReversal: 180,
  tensionWindSeismic: 250,
  membersInCompressionTension: 180,
};
