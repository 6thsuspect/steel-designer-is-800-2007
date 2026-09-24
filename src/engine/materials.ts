/**
 * Material properties and partial safety factors — IS 800:2007
 * Table 1 (designation of steels) and Table 5 (partial safety factors).
 */
import { Material, SafetyFactors, SteelGrade } from './types';

/** Elastic constants — IS 800:2007 Cl. 2.4. */
export const E_STEEL = 200_000; // MPa (2 × 10^5)
export const G_STEEL = 76_900; // MPa (0.769 × 10^5)
export const MU_STEEL = 0.3;
export const RHO_STEEL = 7850; // kg/m3

/** Default partial safety factors — IS 800:2007 Table 5. */
export const DEFAULT_GAMMAS: SafetyFactors = {
  gm0: 1.1, // γm0 — yielding of gross section (Cl. 6.2, 8.2, …)
  gm1: 1.25, // γm1 — ultimate stress (rupture, block shear) (Cl. 6.3, 6.4, …)
  gmb: 1.25, // γmb — bolts in bearing/shear/tension (Cl. 10.3)
  gmf: 1.25, // γmf — friction (HSFG slip resistance) (Cl. 10.4.3)
  gmw: 1.25, // γmw — welds (1.25 shop, 1.50 field) (Cl. 10.5)
  gmp: 1.1, // γmp — pins (Cl. 10.5? / Table 5 note)
};

export interface SteelGradeData {
  grade: SteelGrade;
  label: string;
  /** fu (MPa) — same for all thickness bands. */
  fu: number;
  /** Yield stress by thickness band (Table 1). */
  bands: Array<{ key: string; label: string; tMin: number; tMax: number; fy: number }>;
}

/**
 * IS 800:2007 Table 1 — steels commonly used in India (IS 2062 equivalents).
 * fy decreases with plate thickness; fu is band-independent.
 */
export const STEEL_GRADES: SteelGradeData[] = [
  {
    grade: 'E250',
    label: 'E250 (Fe 410 W)',
    fu: 410,
    bands: [
      { key: 't<=20', label: 't ≤ 20 mm', tMin: 0, tMax: 20, fy: 250 },
      { key: '20<t<=40', label: '20 < t ≤ 40 mm', tMin: 20, tMax: 40, fy: 240 },
      { key: 't>40', label: 't > 40 mm', tMin: 40, tMax: 1000, fy: 230 },
    ],
  },
  {
    grade: 'E275',
    label: 'E275 (Fe 430)',
    fu: 430,
    bands: [
      { key: 't<=20', label: 't ≤ 20 mm', tMin: 0, tMax: 20, fy: 275 },
      { key: '20<t<=40', label: '20 < t ≤ 40 mm', tMin: 20, tMax: 40, fy: 265 },
      { key: 't>40', label: 't > 40 mm', tMin: 40, tMax: 1000, fy: 255 },
    ],
  },
  {
    grade: 'E350',
    label: 'E350 (Fe 490)',
    fu: 490,
    bands: [
      { key: 't<=20', label: 't ≤ 20 mm', tMin: 0, tMax: 20, fy: 350 },
      { key: '20<t<=40', label: '20 < t ≤ 40 mm', tMin: 20, tMax: 40, fy: 340 },
      { key: 't>40', label: 't > 40 mm', tMin: 40, tMax: 1000, fy: 330 },
    ],
  },
  {
    grade: 'E410',
    label: 'E410 (Fe 540)',
    fu: 540,
    bands: [
      { key: 't<=20', label: 't ≤ 20 mm', tMin: 0, tMax: 20, fy: 410 },
      { key: '20<t<=40', label: '20 < t ≤ 40 mm', tMin: 20, tMax: 40, fy: 390 },
      { key: 't>40', label: 't > 40 mm', tMin: 40, tMax: 1000, fy: 380 },
    ],
  },
];

/** Build a Material from grade + thickness band (FR-1.4). */
export function makeMaterial(
  grade: SteelGrade,
  thicknessBand = 't<=20',
  customFy?: number,
  customFu?: number
): Material {
  const data = STEEL_GRADES.find((g) => g.grade === grade);
  if (!data || grade === 'Custom') {
    return {
      grade: 'Custom',
      thicknessBand: 'custom',
      fy: customFy ?? 250,
      fu: customFu ?? 410,
      E: E_STEEL,
      G: G_STEEL,
      mu: MU_STEEL,
      density: RHO_STEEL,
      custom: true,
    };
  }
  const band = data.bands.find((b) => b.key === thicknessBand) ?? data.bands[0];
  return {
    grade,
    thicknessBand: band.key,
    fy: band.fy,
    fu: data.fu,
    E: E_STEEL,
    G: G_STEEL,
    mu: MU_STEEL,
    density: RHO_STEEL,
  };
}

/** ε = √(250/fy) — the slenderness ratio normaliser used throughout IS 800:2007. */
export function epsilon(fy: number): number {
  return Math.sqrt(250 / fy);
}
