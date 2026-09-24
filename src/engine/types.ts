/**
 * Shared types for the IS 800:2007 calculation engine.
 *
 * Every design check produces a structured, clause-referenced result so that
 * Module 24 (Design Report) can present transparent step-by-step calculations.
 */

/** Reference to an IS 800:2007 clause / table. */
export interface ClauseRef {
  clause: string; // e.g. 'Cl. 6.2', 'Table 10'
  title?: string;
}

/** A single symbol/value pair shown in a calculation step. */
export interface CalcTerm {
  sym: string; // symbol, e.g. 'Ag'
  name: string; // description
  value: number | string;
  unit?: string;
  ref?: string; // clause or source of the value
}

/** One transparent calculation step (formula → substitution → result). */
export interface CalcStep {
  title: string;
  clause: string; // IS 800:2007 reference
  formula: string; // symbolic formula
  terms: CalcTerm[];
  substituted?: string; // formula with numbers inserted
  result: string; // final result with unit
}

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

/** A single design check with utilization ratio and full calc trail. */
export interface CheckResult {
  id: string;
  name: string;
  clause: string;
  demand?: number;
  capacity?: number;
  unit: string;
  ratio: number; // utilization = demand/capacity (0 for pure info)
  status: CheckStatus;
  steps: CalcStep[];
  notes?: string[];
  /** Governing = the check with the highest utilization in its group. */
  governing?: boolean;
}

/** Status thresholds per PRD (traffic-light): FAIL > 1.0, amber WARN ≥ 0.95. */
export function statusForRatio(ratio: number): CheckStatus {
  if (ratio > 1.0) return 'FAIL';
  if (ratio >= 0.95) return 'WARN';
  return 'PASS';
}

/** Section classification per IS 800:2007 Cl. 3.7 / Table 2. */
export type SectionClass = 'Plastic' | 'Compact' | 'Semi-Compact' | 'Slender';

/** Buckling classes per IS 800:2007 Table 10. */
export type BucklingClass = 'a' | 'b' | 'c' | 'd';

export type SteelGrade = 'E250' | 'E275' | 'E350' | 'E410' | 'Custom';

/** Material with optional thickness-dependent yield override. */
export interface Material {
  grade: SteelGrade;
  /** Selected thickness band key, see materials.ts */
  thicknessBand: string;
  fy: number; // MPa (design value used)
  fu: number; // MPa
  E: number; // MPa
  G: number; // MPa
  mu: number;
  density: number; // kg/m3
  custom?: boolean;
}

/** Partial safety factors — IS 800:2007 Table 5 (editable per FR-1.4). */
export interface SafetyFactors {
  gm0: number; // yielding / gross section (γm0 = 1.10)
  gm1: number; // ultimate stress / rupture (γm1 = 1.25)
  gmb: number; // bolts (γmb = 1.25)
  gmf: number; // friction, HSFG slip (γmf = 1.25)
  gmw: number; // welds (1.25 shop / 1.50 field)
  gmp: number; // pins (γmp = 1.10)
}

/** Cross-section element widths used for classification (Table 2). */
export interface SectionElements {
  /** Flange outstand width b (mm) for I/channel/T/angle legs. */
  flangeOutstand?: number;
  flangeThickness?: number;
  /** Flat web depth d (mm). */
  webDepth?: number;
  webThickness?: number;
  /** Internal element width (box/RHS flange) b (mm). */
  internalWidth?: number;
  internalThickness?: number;
  /** Angle leg widths (flat = leg − t). */
  leg1?: number;
  leg2?: number;
  legThickness?: number;
  /** CHS diameter / thickness. */
  diameter?: number;
  /** Overall dims used by buckling-class rules. */
  h: number;
  b: number;
  tw?: number;
  tf?: number;
  r?: number;
}

/** A closed polygon (list of vertices, any winding). */
export type Polygon = Array<{ x: number; y: number }>;

/** Computed geometric properties of a cross-section. */
export interface SectionProperties {
  area: number; // mm2
  cy: number; // centroid from bottom, mm
  cz: number; // centroid from left, mm (usually 0 for symmetric)
  Izz: number; // mm4 — major axis (strong)
  Iyy: number; // mm4 — minor axis (weak)
  rz: number; // mm
  ry: number; // mm
  Zze: number; // mm3 — elastic modulus about z-z
  Zye: number; // mm3 — elastic modulus about y-y
  Zpz: number; // mm3 — plastic modulus about z-z
  Zpy: number; // mm3 — plastic modulus about y-y
  J: number; // mm4 — St. Venant torsion constant (approx.)
  Cw: number; // mm6 — warping constant (approx. for I/box)
  /** total outline height/width for convenience */
  height: number;
  width: number;
}

export type SectionShape =
  | 'I'
  | 'Channel'
  | 'Angle'
  | 'Tee'
  | 'RHS'
  | 'SHS'
  | 'CHS'
  | 'Plate'
  | 'DoubleAngle'
  | 'DoubleChannel'
  | 'BuiltUpI'
  | 'Custom';

export type SectionType =
  | 'Rolled'
  | 'Welded'
  | 'ColdFormed'
  | 'BuiltUp';

/** Full cross-section description consumed by all design modules. */
export interface CrossSection {
  name: string;
  shape: SectionShape;
  type: SectionType;
  /** source: 'SP6' standard catalogue or 'custom' */
  source: 'SP6' | 'custom' | 'built-up';
  mass?: number; // kg/m
  dims: Record<string, number>; // shape-specific dimensions (mm)
  elements: SectionElements;
  props: SectionProperties;
  /** Polygons in mm, section centred on centroid (z right, y up). */
  polygons: Polygon[];
}
