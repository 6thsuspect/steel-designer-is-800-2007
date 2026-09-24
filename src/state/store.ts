/**
 * Application state model — project, design cases & UI input types.
 * (All calculation inputs; results are computed live by the engine.)
 */
import { SteelGrade, SafetyFactors } from '../engine/types';
import { CustomSectionInput } from '../engine/sections';
import { BoltGradeData } from '../engine/bolts';

export type ModuleKey =
  | 'design-basis'
  | 'tension'
  | 'compression'
  | 'flexure'
  | 'combined'
  | 'bolts'
  | 'welds'
  | 'base-plate'
  | 'gusset'
  | 'beam-column'
  | 'stiffener'
  | 'plate-girder'
  | 'splice'
  | 'purlin'
  | 'truss'
  | 'crane'
  | 'plate-element'
  | 'built-up'
  | 'special-members'
  | 'fatigue'
  | 'seismic'
  | 'serviceability'
  | 'durability'
  | 'report';

export interface ModuleDef {
  key: ModuleKey;
  no: number;
  title: string;
  group: string;
  phase: 1 | 2 | 3 | 4;
  implemented: boolean;
  frs: string[];
}

/** The 24 modules per the PRD (§4), grouped A–E. */
export const MODULES: ModuleDef[] = [
  { key: 'design-basis', no: 1, title: 'Design Basis & General', group: 'A. Project & Design Setup', phase: 1, implemented: true, frs: ['Project setup', 'LSD method', 'Load combinations (IS 875)', 'Material & safety factor library', 'Section database + custom', 'Automatic section classification'] },
  { key: 'tension', no: 2, title: 'Tension Member Design', group: 'B. Member Design', phase: 1, implemented: true, frs: ['Gross yielding (Cl. 6.2)', 'Net rupture (Cl. 6.3)', 'Block shear (Cl. 6.4)', 'Governing Tdg', 'Lug angle check (Cl. 10.12)'] },
  { key: 'compression', no: 3, title: 'Compression Member Design', group: 'B. Member Design', phase: 1, implemented: true, frs: ['Effective length KL', 'Slenderness KL/r', 'Buckling class (Table 10)', 'fcd (Cl. 7.1.2)', 'Design strength Pd', 'Built-up: lacing & battens (Cl. 7.4 & 7.5)'] },
  { key: 'flexure', no: 4, title: 'Flexural Member Design', group: 'B. Member Design', phase: 1, implemented: true, frs: ['Shear strength (Cl. 8.4)', 'Bending strength (Cl. 8.2)', 'LTB check (Cl. 8.2.2)', 'Effective Ze (semi-compact/slender)', 'Web buckling & crippling (Cl. 8.7)', 'Bearing at supports', 'Deflection serviceability'] },
  { key: 'combined', no: 5, title: 'Combined Axial Force & Bending', group: 'B. Member Design', phase: 2, implemented: true, frs: ['Axial compression + bending (Cl. 9.3)', 'Axial tension + bending (Cl. 9.2)', 'Shear + bending (Cl. 9.4)', 'Member stability under combined loading'] },
  { key: 'bolts', no: 6, title: 'Bolted Connection Design', group: 'C. Connection Design', phase: 1, implemented: true, frs: ['Shear, tension, bearing (Cl. 10.3)', 'Combined shear + tension', 'Bolt group design', 'HSFG slip (Cl. 10.4)', 'Prying action', 'Plate net section & block shear', 'Pitch/gauge/edge rules (Cl. 10.2)', 'Connection eccentricity'] },
  { key: 'welds', no: 7, title: 'Welded Connection Design', group: 'C. Connection Design', phase: 1, implemented: true, frs: ['Fillet & butt welds', 'Effective throat (Cl. 10.5.3)', 'Strength in shear/tension/compression (Cl. 10.5)', 'Combined weld stresses (Cl. 10.5.9)', 'Weld group eccentric shear (Cl. 10.5.10)', 'Min/max weld size (Cl. 10.5.2)'] },
  { key: 'plate-element', no: 8, title: 'Plate & Element Design', group: 'D. Component & System Design', phase: 4, implemented: false, frs: ['Slender plate elements', 'Web & flange design (plate girders)', 'Stiffened/unstiffened plates', 'Plate buckling strength'] },
  { key: 'built-up', no: 9, title: 'Built-Up Member Design', group: 'D. Component & System Design', phase: 4, implemented: false, frs: ['Lacing & battening (in Module 3)', 'Shear transfer', 'Connections for built-up components'] },
  { key: 'base-plate', no: 10, title: 'Column & Base Connection', group: 'D. Component & System Design', phase: 2, implemented: false, frs: ['Base plate axial/tension/moment', 'Anchor bolts', 'Bearing on concrete', 'Base-plate thickness'] },
  { key: 'gusset', no: 11, title: 'Gusset Plate Design', group: 'D. Component & System Design', phase: 2, implemented: false, frs: ['Tension & compression', 'Whitmore section', 'Block shear & net section', 'Gusset buckling', 'Bolt/weld to member'] },
  { key: 'beam-column', no: 12, title: 'Beam-to-Column Connections', group: 'D. Component & System Design', phase: 2, implemented: false, frs: ['Fin-plate & cleat templates', 'Simple shear connections', 'Moment connections (end plate)', 'Connection eccentricity'] },
  { key: 'stiffener', no: 13, title: 'Stiffener Design', group: 'D. Component & System Design', phase: 2, implemented: false, frs: ['Bearing stiffeners (Cl. 8.7.4)', 'Intermediate web stiffeners', 'Load-carrying stiffeners', 'Torsional & longitudinal stiffeners'] },
  { key: 'plate-girder', no: 14, title: 'Plate Girder Design', group: 'D. Component & System Design', phase: 3, implemented: false, frs: ['Integrated plate girder design', 'Web & flange sizing', 'Shear buckling & stiffeners', 'Bearing stiffeners & splices', 'Bending–shear interaction'] },
  { key: 'splice', no: 15, title: 'Splice Design', group: 'D. Component & System Design', phase: 3, implemented: false, frs: ['Beam/column/tension/compression splices', 'Bolted & welded splices', 'Flange & web splices'] },
  { key: 'purlin', no: 16, title: 'Purlin / Girt Design', group: 'D. Component & System Design', phase: 3, implemented: false, frs: ['Biaxial bending', 'Shear & combined checks', 'Sag rods', 'Stability & deflection'] },
  { key: 'truss', no: 17, title: 'Truss Member & Joint Design', group: 'D. Component & System Design', phase: 3, implemented: false, frs: ['Truss tension/compression members', 'Gusset joints', 'Bolted/welded joints', 'Joint eccentricity'] },
  { key: 'crane', no: 18, title: 'Crane / Gantry Beam Design', group: 'D. Component & System Design', phase: 3, implemented: false, frs: ['Vertical & horizontal bending', 'Shear, combined bending, LTB', 'Web buckling & crippling', 'Fatigue considerations'] },
  { key: 'fatigue', no: 19, title: 'Fatigue Design', group: 'E. Specialized Analysis & Reporting', phase: 3, implemented: false, frs: ['Stress ranges & cycles', 'Detail categories', 'Constant/variable amplitude', 'Welded & bolted details'] },
  { key: 'seismic', no: 20, title: 'Seismic Design', group: 'E. Specialized Analysis & Reporting', phase: 3, implemented: false, frs: ['Ductility in bracings/connections', 'IS 1893 / IS 13920 provisions', 'Moment-resisting systems'] },
  { key: 'serviceability', no: 21, title: 'Serviceability Checks', group: 'E. Specialized Analysis & Reporting', phase: 4, implemented: true, frs: ['Beam/column deflection', 'Frame drift', 'Vibration & local deformation'] },
  { key: 'durability', no: 22, title: 'Durability & Detailing', group: 'E. Specialized Analysis & Reporting', phase: 4, implemented: false, frs: ['Corrosion protection checklist', 'Minimum thickness', 'Drainage/ventilation/access guidance'] },
  { key: 'special-members', no: 23, title: 'Design of Special Members', group: 'B. Member Design', phase: 4, implemented: false, frs: ['Angles, channels, I, box, RHS, SHS', 'Generic built-up sections'] },
  { key: 'report', no: 24, title: 'Design Report & Verification', group: 'E. Specialized Analysis & Reporting', phase: 1, implemented: true, frs: ['Comprehensive design report', 'Input summary, properties, forces', 'Clause-wise calculations, UR, PASS/FAIL', 'PDF & DOCX export'] },
];

export interface SectionSelection {
  kind: 'catalog' | 'custom';
  name: string;
  custom?: CustomSectionInput;
}

export interface MaterialSelection {
  grade: SteelGrade;
  band: string;
  customFy?: number;
  customFu?: number;
}

export interface CaseBase {
  id: string;
  module: ModuleKey;
  name: string;
  notes?: string;
  section: SectionSelection;
  material: MaterialSelection;
}

export interface TensionCaseInput {
  T_kN: number;
  useHoles: boolean;
  holeDia: number;
  nHoles: number;
  plateWidth: number;
  plateThickness: number;
  useShearLag: boolean;
  w1: number;
  w2: number;
  lagT: number;
  Lc: number;
  A1: number;
  A2: number;
  useBlockShear: boolean;
  Avg: number;
  Avn: number;
  Atg: number;
  Atn: number;
  useLug: boolean;
  lugArea: number;
  lugMemberType: 'angle' | 'channel';
  forceLeg_kN: number;
  capGusset_kN: number;
  capMember_kN: number;
  nBoltsLug: number;
  checkSlenderness: boolean;
  lambda: number;
  slendernessLimit: number;
}

export interface CompressionCaseInput {
  P_kN: number;
  endZ: string; // END_CONDITIONS key or 'custom'
  endY: string;
  Lz: number; // actual length z (mm) — KL computed by end condition
  Ly: number;
  Kz: number;
  Ky: number;
  classZz: string; // 'auto' | a|b|c|d
  classYy: string;
  builtUpMode: 'none' | 'lacing' | 'batten';
  // lacing
  lacingSpacing: number;
  lacingTheta: number;
  flatWidth: number;
  flatThickness: number;
  LcBar: number;
  nLacingPlanes: 1 | 2;
  singleLacing: boolean;
  connectionCap_kN: number;
  // battens
  nPanels: number;
  panelLength: number;
  battenWidth: number;
  battenThickness: number;
  nBattens: number;
  memberDepth: number;
}

export interface FlexureCaseInput {
  Mz_kNm: number;
  V_kN: number;
  laterallySupported: boolean;
  LLT: number;
  gradient: string;
  C1: number;
  useWebBearing: boolean;
  F_kN: number;
  b1: number;
  atEnd: boolean;
  useDeflection: boolean;
  delta: number;
  span: number;
  limitRatio: number;
}

export interface CombinedCaseInput {
  P_kN: number; // + tension / − compression
  Mz_kNm: number;
  My_kNm: number;
  V_kN: number;
  // capacities (kN / kN·m) — user-provided or computed from modules
  Td_kN: number;
  Pd_kN: number;
  Mdz_kNm: number;
  Mdy_kNm: number;
  Vd_kN: number;
  KLz: number;
  Cm: number;
  useAmplification: boolean;
}

export interface BoltCaseInput {
  boltGrade: string;
  d: number;
  pitch: number;
  gauge: number;
  endDist: number;
  edgeDist: number;
  nBolts: number;
  nShearPlanes: number;
  nThreadPlanes: number;
  thickness: number;
  shear_kN: number;
  tension_kN: number;
  hsfg: boolean;
  muF: number;
  nFriction: number;
  largeHoles: boolean;
  shearedEdge: boolean;
  usePrying: boolean;
  plateTp: number;
  pryingA: number;
  pryingB: number;
  pryingP: number;
  pryingFu: number;
  // group design
  totalLoad_kN: number;
  eccentricity: number;
}

export interface WeldCaseInput {
  weldType: 'fillet' | 'butt-full' | 'butt-partial';
  size: number;
  length: number;
  position: 'shop' | 'field';
  weldFu: number;
  partThickness: number;
  edgeRounded: boolean;
  N_kN: number;
  Valong_kN: number;
  Vacross_kN: number;
  useCombined: boolean;
  sigmaPerp: number;
  tauPerp: number;
  tauPar: number;
  useGroup: boolean;
  groupH: number;
  groupW: number;
  groupVx_kN: number;
  groupVy_kN: number;
  groupM_kNm: number;
}

export interface ServiceabilityCaseInput {
  span: number;
  loadCase: 'udl' | 'point' | 'cantilever-udl' | 'cantilever-point' | 'manual';
  w_kNpm: number;
  P_kN: number;
  E: number;
  useManual: boolean;
  manualDelta: number;
  limitRatio: number;
  deltaLive: number;
  limitRatioLive: number;
}

export type CaseInput =
  | TensionCaseInput
  | CompressionCaseInput
  | FlexureCaseInput
  | CombinedCaseInput
  | BoltCaseInput
  | WeldCaseInput
  | ServiceabilityCaseInput;

export interface DesignCase {
  id: string;
  module: ModuleKey;
  name: string;
  notes?: string;
  section: SectionSelection;
  material: MaterialSelection;
  input: Record<string, number | string | boolean>;
}

export interface LoadCombo {
  id: string;
  name: string;
  dl: number;
  ll: number;
  wl: number;
  eq: number;
  custom: boolean;
}

export interface ProjectState {
  name: string;
  description: string;
  author: string;
  designMethod: 'LSD';
  gammas: SafetyFactors;
  loadCombos: LoadCombo[];
  cases: DesignCase[];
  selectedId: string | null;
  activeTab: 'input' | 'results' | 'report';
}

export const DEFAULT_COMBOS: LoadCombo[] = [
  { id: 'c1', name: '1.5 (DL + LL)', dl: 1.5, ll: 1.5, wl: 0, eq: 0, custom: false },
  { id: 'c2', name: '1.5 (DL + WL) / 0.9 DL + 1.5 WL', dl: 1.5, ll: 0, wl: 1.5, eq: 0, custom: false },
  { id: 'c3', name: '1.2 (DL + LL + WL)', dl: 1.2, ll: 1.2, wl: 1.2, eq: 0, custom: false },
  { id: 'c4', name: '1.5 (DL + EQ)', dl: 1.5, ll: 0, wl: 0, eq: 1.5, custom: false },
  { id: 'c5', name: '1.2 (DL + LL + EQ)', dl: 1.2, ll: 1.2, wl: 0, eq: 1.2, custom: false },
];

export function defaultInput(module: ModuleKey): Record<string, number | string | boolean> {
  switch (module) {
    case 'tension':
      return {
        T_kN: 150, useHoles: true, holeDia: 18, nHoles: 2, plateWidth: 100, plateThickness: 10,
        useShearLag: false, w1: 80, w2: 55, lagT: 10, Lc: 150, A1: 700, A2: 550,
        useBlockShear: false, Avg: 2000, Avn: 1400, Atg: 600, Atn: 510,
        useLug: false, lugArea: 800, lugMemberType: 'angle', forceLeg_kN: 40, capGusset_kN: 50, capMember_kN: 58, nBoltsLug: 2,
        checkSlenderness: true, lambda: 180, slendernessLimit: 400,
      } as TensionCaseInput as never;
    case 'compression':
      return {
        P_kN: 500, endZ: 'pp', endY: 'pp', Lz: 4000, Ly: 4000, Kz: 1, Ky: 1,
        classZz: 'auto', classYy: 'auto', builtUpMode: 'none',
        lacingSpacing: 600, lacingTheta: 60, flatWidth: 50, flatThickness: 8, LcBar: 400, nLacingPlanes: 1, singleLacing: true, connectionCap_kN: 80,
        nPanels: 6, panelLength: 500, battenWidth: 55, battenThickness: 8, nBattens: 1, memberDepth: 200,
      } as never;
    case 'flexure':
      return {
        Mz_kNm: 120, V_kN: 150, laterallySupported: true, LLT: 3000, gradient: 'UBM', C1: 1,
        useWebBearing: false, F_kN: 150, b1: 50, atEnd: true,
        useDeflection: true, delta: 15, span: 6000, limitRatio: 300,
      } as never;
    case 'combined':
      return {
        P_kN: -300, Mz_kNm: 80, My_kNm: 10, V_kN: 60,
        Td_kN: 1200, Pd_kN: 1000, Mdz_kNm: 250, Mdy_kNm: 30, Vd_kN: 400,
        KLz: 4000, Cm: 0.9, useAmplification: true,
      } as never;
    case 'bolts':
      return {
        boltGrade: '8.8', d: 20, pitch: 60, gauge: 60, endDist: 35, edgeDist: 35, nBolts: 4,
        nShearPlanes: 1, nThreadPlanes: 1, thickness: 10, shear_kN: 40, tension_kN: 20,
        hsfg: false, muF: 0.2, nFriction: 1, largeHoles: false, shearedEdge: true,
        usePrying: false, plateTp: 12, pryingA: 35, pryingB: 45, pryingP: 70, pryingFu: 410,
        totalLoad_kN: 200, eccentricity: 0,
      } as never;
    case 'welds':
      return {
        weldType: 'fillet', size: 6, length: 300, position: 'shop', weldFu: 410, partThickness: 10, edgeRounded: false,
        N_kN: 0, Valong_kN: 150, Vacross_kN: 0,
        useCombined: false, sigmaPerp: 50, tauPerp: 30, tauPar: 80,
        useGroup: false, groupH: 200, groupW: 100, groupVx_kN: 80, groupVy_kN: 40, groupM_kNm: 15,
      } as never;
    case 'serviceability':
      return {
        span: 6000, loadCase: 'udl', w_kNpm: 10, P_kN: 50, E: 200000,
        useManual: false, manualDelta: 15, limitRatio: 300, deltaLive: 8, limitRatioLive: 360,
      } as never;
    default:
      return {} as never;
  }
}

export function defaultCase(module: ModuleKey, n: number, section: SectionSelection = { kind: 'catalog', name: 'ISMB 300' }, material: MaterialSelection = { grade: 'E250', band: 't<=20' }): DesignCase {
  return {
    id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    module,
    name: `Case ${n}`,
    section,
    material,
    input: defaultInput(module),
  };
}

export function newProject(): ProjectState {
  return {
    name: 'Untitled Project',
    description: '',
    author: '',
    designMethod: 'LSD',
    gammas: { gm0: 1.1, gm1: 1.25, gmb: 1.25, gmf: 1.25, gmw: 1.25, gmp: 1.1 },
    loadCombos: DEFAULT_COMBOS,
    cases: [],
    selectedId: null,
    activeTab: 'input',
  };
}

/* ------------------------------------------------------------------ */
/* Tiny observable store (no external deps)                            */
/* ------------------------------------------------------------------ */

let state: ProjectState = loadLocal() ?? newProject();
const listeners = new Set<() => void>();

/* Undo/redo history (FR-1.12) — kept outside the serialised project state. */
const past: ProjectState[] = [];
const future: ProjectState[] = [];
const HISTORY_CAP = 50;
let replaying = false;

export function getState(): ProjectState {
  return state;
}

export function setState(fn: (s: ProjectState) => ProjectState): void {
  const next = fn(state);
  if (next === state) return;
  if (!replaying) {
    past.push(state);
    if (past.length > HISTORY_CAP) past.shift();
    future.length = 0;
  }
  state = next;
  saveLocal(state);
  listeners.forEach((l) => l());
}

export function canUndo(): boolean {
  return past.length > 0;
}
export function canRedo(): boolean {
  return future.length > 0;
}

export function undo(): void {
  const prev = past.pop();
  if (!prev) return;
  future.push(state);
  replaying = true;
  state = prev;
  saveLocal(state);
  listeners.forEach((l) => l());
  replaying = false;
}

export function redo(): void {
  const next = future.pop();
  if (!next) return;
  past.push(state);
  replaying = true;
  state = next;
  saveLocal(state);
  listeners.forEach((l) => l());
  replaying = false;
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function saveLocal(s: ProjectState): void {
  try {
    localStorage.setItem('steel-designer-is800-project', JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function loadLocal(): ProjectState | null {
  try {
    const raw = localStorage.getItem('steel-designer-is800-project');
    return raw ? (JSON.parse(raw) as ProjectState) : null;
  } catch {
    return null;
  }
}

export type BoltGradeInfo = BoltGradeData;
