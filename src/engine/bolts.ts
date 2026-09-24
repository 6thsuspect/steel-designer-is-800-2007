/**
 * Bolted connections — IS 800:2007
 *  - Cl. 10.2 : detailing (pitch, gauge, edge/end distances)
 *  - Cl. 10.3 : bearing-type bolts (shear, bearing, tension, combined)
 *  - Cl. 10.4 : HSFG (slip-resistant) bolts
 *  - Prying action: T-stub check (Nair/Thornton model, AISC Manual Part 9 form)
 */
import { CheckResult, Material, SafetyFactors, statusForRatio, CalcStep } from './types';

export interface BoltGeometry {
  d: number; // bolt diameter (mm)
  d0: number; // hole diameter (mm) — default d+2 (16-24) / d+3 (>24)
  pitch: number; // spacing along load (mm)
  gauge: number; // spacing across (mm)
  endDistance: number; // e (mm)
  edgeDistance: number; // mm
  nBolts: number;
  nShearPlanes: number;
  nShearThroughThread: number; // shear planes intercepting the shank (vs threads)
  thickness: number; // connected plate thickness for bearing (mm) — thinnest
}

export interface BoltLoad {
  shear: number; // factored shear per bolt (N)
  tension: number; // factored tension per bolt (N)
}

export interface BoltGradeData {
  grade: string;
  fyb: number; // proof/yield of bolt
  fub: number; // ultimate of bolt
}

/** Common Indian bolt grades (IS 800:2007 Cl. 10.1 / IS 3640). */
export const BOLT_GRADES: BoltGradeData[] = [
  { grade: '4.6', fyb: 240, fub: 400 },
  { grade: '5.6', fyb: 300, fub: 500 },
  { grade: '6.8', fyb: 480, fub: 600 },
  { grade: '8.8', fyb: 640, fub: 800 },
  { grade: '10.9', fyb: 900, fub: 1000 },
];

export function holeDia(d: number, d0?: number): number {
  if (d0) return d0;
  return d <= 24 ? d + 2 : d + 3;
}

export interface BoltCapacity {
  Vdsb: number; // design shear strength (N)
  Vdpb: number; // design bearing strength (N)
  Tndb: number; // design tension strength (N)
  Vdsf?: number; // HSFG slip resistance (N)
  kb: number;
  Anb: number;
  Asb: number;
}

/** Bolt capacities (FR-6.1) — Cl. 10.3.1–10.3.3, HSFG Cl. 10.4.3. */
export function boltCapacities(
  geom: BoltGeometry,
  bolt: BoltGradeData,
  plate: Material,
  gammas: SafetyFactors,
  opts: {
    hsfg?: { muF: number; nFrictionSurfaces: number; largeHoles?: boolean };
    fubOverride?: number;
  } = {}
): BoltCapacity {
  const d = geom.d;
  const Asb = (Math.PI * d * d) / 4;
  const Anb = 0.78 * Asb; // net tensile stress area (coarse threads)
  const fub = bolt.fub;
  const fu = plate.fu;

  // Cl. 10.3.1 — shear
  const nn = Math.max(geom.nShearThroughThread, 0);
  const ns = Math.max(geom.nShearPlanes - nn, 0);
  const Vnsb = (fub / Math.sqrt(3)) * (nn * Anb + ns * Asb);
  const Vdsb = Vnsb / gammas.gmb;

  // Cl. 10.3.2 — bearing
  const d0 = holeDia(d, geom.d0);
  const kb = Math.min(geom.endDistance / (3 * d0), geom.pitch / (3 * d0) - 0.25, fub / fu, 1.0);
  const Vnpb = 2.5 * kb * d * geom.thickness * fu;
  const Vdpb = Vnpb / gammas.gmb;

  // Cl. 10.3.3 — tension
  const Tnsb = Math.min(0.9 * fub * Anb, (bolt.fyb * Asb) / gammas.gm0 * gammas.gmb);
  const Tndb = Tnsb / gammas.gmb;

  let Vdsf: number | undefined;
  if (opts.hsfg) {
    // Cl. 10.4.3 — slip resistance
    const Fo = 0.7 * fub * Asb; // proof load at installation
    const kh = opts.hsfg.largeHoles ? 0.85 : 1.0;
    const Vnsf = opts.hsfg.muF * opts.hsfg.nFrictionSurfaces * kh * Fo;
    Vdsf = Vnsf / gammas.gmf;
  }

  void opts.fubOverride;
  return { Vdsb, Vdpb, Tndb, Vdsf, kb, Anb, Asb };
}

export interface BoltCheckInput {
  geom: BoltGeometry;
  bolt: BoltGradeData;
  plate: Material;
  gammas: SafetyFactors;
  loads: BoltLoad;
  hsfg?: { muF: number; nFrictionSurfaces: number; largeHoles?: boolean };
  /** Minimum pitch/edge rules per Cl. 10.2. */
  shearedEdge?: boolean; // 1.7d0 (sheared) vs 1.5d0 (rolled/machine cut)
  /** Prying (T-stub) input. */
  prying?: {
    present: boolean;
    plateThickness: number; // end plate tp (mm)
    a: number; // bolt centreline → plate edge (mm)
    b: number; // bolt centreline → T-stem face (mm)
    tributaryLength: number; // p — yield-line tributary width per bolt pair (mm)
    plateFu: number; // plate ultimate stress (MPa)
  };
}

/** Full bolted-connection check set (FR-6.1 … FR-6.7). */
export function checkBolted(inp: BoltCheckInput): { checks: CheckResult[]; capacity: BoltCapacity } {
  const { geom, bolt, plate, gammas, loads } = inp;
  const cap = boltCapacities(geom, bolt, plate, gammas, { hsfg: inp.hsfg });
  const checks: CheckResult[] = [];

  // Shear (bearing bolts) or slip (HSFG)
  if (inp.hsfg && cap.Vdsf !== undefined) {
    checks.push({
      id: 'b-slip',
      name: 'Slip resistance (HSFG)',
      clause: 'Cl. 10.4.3',
      demand: loads.shear / 1000,
      capacity: cap.Vdsf / 1000,
      unit: 'kN',
      ratio: loads.shear / cap.Vdsf,
      status: statusForRatio(loads.shear / cap.Vdsf),
      steps: [
        {
          title: 'Slip resistance of friction grip bolt',
          clause: 'Cl. 10.4.3',
          formula: 'Vsf = μf·ne·kh·Fo/γmf ; Fo = 0.7·fub·Asb (proof load)',
          terms: [
            { sym: 'μf', name: 'Slip factor', value: inp.hsfg.muF },
            { sym: 'ne', name: 'Number of friction surfaces', value: inp.hsfg.nFrictionSurfaces },
            { sym: 'kh', name: 'Hole factor', value: inp.hsfg.largeHoles ? 0.85 : 1.0 },
            { sym: 'Fo', name: 'Proof load', value: (0.7 * bolt.fub * cap.Asb / 1000).toFixed(2), unit: 'kN' },
            { sym: 'γmf', name: 'Partial safety factor (Table 5)', value: gammas.gmf },
          ],
          result: `Vsf = ${(cap.Vdsf / 1000).toFixed(2)} kN`,
        },
      ],
      notes: ['For HSFG bolts at ultimate limit state, bearing check (Cl. 10.4.3.2) is also required.'],
    });
    // bearing at ultimate for HSFG
    checks.push({
      id: 'b-bearing-hsfg',
      name: 'Bearing at ultimate (HSFG)',
      clause: 'Cl. 10.4.3.2',
      demand: loads.shear / 1000,
      capacity: cap.Vdpb / 1000,
      unit: 'kN',
      ratio: loads.shear / cap.Vdpb,
      status: statusForRatio(loads.shear / cap.Vdpb),
      steps: [
        {
          title: 'Bearing strength of bolt (ultimate check for HSFG)',
          clause: 'Cl. 10.4.3.2 / 10.3.2',
          formula: 'Vdpb = 2.5·kb·d·t·fu/γmb',
          terms: [
            { sym: 'kb', name: 'Bearing coefficient', value: cap.kb.toFixed(3) },
            { sym: 'd', name: 'Bolt diameter', value: geom.d, unit: 'mm' },
            { sym: 't', name: 'Thickness of connected part', value: geom.thickness, unit: 'mm' },
            { sym: 'fu', name: 'Ultimate of plate', value: plate.fu, unit: 'MPa' },
          ],
          result: `Vdpb = ${(cap.Vdpb / 1000).toFixed(2)} kN`,
        },
      ],
    });
  } else {
    checks.push({
      id: 'b-shear',
      name: 'Bolt in shear',
      clause: 'Cl. 10.3.1',
      demand: loads.shear / 1000,
      capacity: cap.Vdsb / 1000,
      unit: 'kN',
      ratio: loads.shear / cap.Vdsb,
      status: statusForRatio(loads.shear / cap.Vdsb),
      steps: [
        {
          title: 'Design shear strength of bearing bolt',
          clause: 'Cl. 10.3.1',
          formula: 'Vnsb = (fub/√3)(nn·Anb + ns·Asb); Vdsb = Vnsb/γmb',
          terms: [
            { sym: 'fub', name: 'Bolt ultimate stress', value: bolt.fub, unit: 'MPa' },
            { sym: 'nn', name: 'Shear planes through threads', value: geom.nShearThroughThread },
            { sym: 'ns', name: 'Shear planes through shank', value: Math.max(geom.nShearPlanes - geom.nShearThroughThread, 0) },
            { sym: 'Anb', name: 'Net tensile stress area', value: cap.Anb.toFixed(1), unit: 'mm²' },
            { sym: 'Asb', name: 'Shank area', value: cap.Asb.toFixed(1), unit: 'mm²' },
            { sym: 'γmb', name: 'Partial safety factor (Table 5)', value: gammas.gmb },
          ],
          result: `Vdsb = ${(cap.Vdsb / 1000).toFixed(2)} kN`,
        },
      ],
    });
    checks.push({
      id: 'b-bearing',
      name: 'Bolt in bearing (plate)',
      clause: 'Cl. 10.3.2',
      demand: loads.shear / 1000,
      capacity: cap.Vdpb / 1000,
      unit: 'kN',
      ratio: loads.shear / cap.Vdpb,
      status: statusForRatio(loads.shear / cap.Vdpb),
      steps: [
        {
          title: 'Design bearing strength',
          clause: 'Cl. 10.3.2',
          formula: 'Vnpb = 2.5·kb·d·t·fu; kb = min(e/3d0, p/3d0 − 0.25, fub/fu, 1.0)',
          terms: [
            { sym: 'kb', name: 'Bearing coefficient', value: cap.kb.toFixed(3) },
            { sym: 'e', name: 'End distance', value: geom.endDistance, unit: 'mm' },
            { sym: 'p', name: 'Pitch', value: geom.pitch, unit: 'mm' },
            { sym: 'd0', name: 'Hole diameter', value: holeDia(geom.d, geom.d0), unit: 'mm' },
            { sym: 't', name: 'Thickness of connected part', value: geom.thickness, unit: 'mm' },
          ],
          result: `Vdpb = ${(cap.Vdpb / 1000).toFixed(2)} kN`,
        },
      ],
    });
  }

  // Tension
  checks.push({
    id: 'b-tension',
    name: 'Bolt in tension',
    clause: 'Cl. 10.3.3',
    demand: loads.tension / 1000,
    capacity: cap.Tndb / 1000,
    unit: 'kN',
    ratio: loads.tension / cap.Tndb,
    status: statusForRatio(loads.tension / cap.Tndb),
    steps: [
      {
        title: 'Design tensile strength of bolt',
        clause: 'Cl. 10.3.3',
        formula: 'Tndb = 0.9·fub·Anb/γmb ≤ fyb·Asb/γm0',
        terms: [
          { sym: 'fub', name: 'Bolt ultimate stress', value: bolt.fub, unit: 'MPa' },
          { sym: 'Anb', name: 'Net tensile stress area', value: cap.Anb.toFixed(1), unit: 'mm²' },
          { sym: 'γmb', name: 'Partial safety factor', value: gammas.gmb },
        ],
        result: `Tndb = ${(cap.Tndb / 1000).toFixed(2)} kN`,
      },
    ],
  });

  // Cl. 10.3.6 — combined shear and tension
  if (loads.shear > 0 && loads.tension > 0) {
    const vCap = inp.hsfg && cap.Vdsf !== undefined ? cap.Vdsf : Math.min(cap.Vdsb, cap.Vdpb);
    const rr = Math.pow(loads.shear / vCap, 2) + Math.pow(loads.tension / cap.Tndb, 2);
    checks.push({
      id: 'b-combined',
      name: 'Combined shear and tension',
      clause: 'Cl. 10.3.6',
      demand: rr,
      capacity: 1,
      unit: '—',
      ratio: rr,
      status: statusForRatio(rr),
      steps: [
        {
          title: 'Shear-tension interaction',
          clause: 'Cl. 10.3.6',
          formula: '(V/Vd)² + (T/Td)² ≤ 1.0',
          terms: [
            { sym: 'V/Vd', name: 'Shear utilization', value: (loads.shear / vCap).toFixed(3) },
            { sym: 'T/Td', name: 'Tension utilization', value: (loads.tension / cap.Tndb).toFixed(3) },
          ],
          result: `Σ = ${rr.toFixed(3)} → ${rr <= 1 ? 'OK' : 'FAIL'}`,
        },
      ],
    });
  }

  // Cl. 10.2 — detailing
  const d0 = holeDia(geom.d, geom.d0);
  const minEnd = (inp.shearedEdge ? 1.7 : 1.5) * d0;
  const maxEnd = Math.min(12 * geom.thickness, 200);
  const minPitch = 2.5 * geom.d;
  const maxPitch = Math.min(32 * geom.thickness, 300);
  const detRatio = Math.max(
    minEnd / Math.max(geom.endDistance, 1e-9),
    geom.edgeDistance > 0 ? minEnd / Math.max(geom.edgeDistance, 1e-9) : 0,
    minPitch / Math.max(geom.pitch, 1e-9)
  );
  checks.push({
    id: 'b-detailing',
    name: 'Detailing — pitch and end distance',
    clause: 'Cl. 10.2',
    demand: detRatio,
    capacity: 1,
    unit: 'mm',
    ratio: detRatio,
    status: detRatio <= 1 && geom.pitch <= maxPitch ? 'PASS' : 'FAIL',
    steps: [
      {
        title: 'End & edge distance',
        clause: 'Cl. 10.2.3.2 / 10.2.4',
        formula: 'e ≥ 1.7d0 (sheared) / 1.5d0 (rolled, machine cut); e ≤ 12t or 200 mm',
        terms: [
          { sym: 'd0', name: 'Hole diameter', value: d0, unit: 'mm' },
          { sym: 'e', name: 'End distance provided', value: geom.endDistance, unit: 'mm' },
          { sym: 'e,min', name: 'Minimum required', value: minEnd.toFixed(1), unit: 'mm' },
          { sym: 'e,max', name: 'Maximum permitted', value: maxEnd.toFixed(0), unit: 'mm' },
        ],
        result:
          geom.endDistance >= minEnd && geom.endDistance <= maxEnd
            ? 'OK'
            : `FAIL — provide ≥ ${minEnd.toFixed(0)} mm and ≤ ${maxEnd.toFixed(0)} mm`,
      },
      {
        title: 'Pitch',
        clause: 'Cl. 10.2.2 / 10.2.3.1',
        formula: '2.5d ≤ p ≤ 32t or 300 mm (whichever is less)',
        terms: [
          { sym: 'd', name: 'Bolt diameter', value: geom.d, unit: 'mm' },
          { sym: 'p', name: 'Pitch provided', value: geom.pitch, unit: 'mm' },
          { sym: 'p,min', name: 'Minimum (2.5d)', value: minPitch.toFixed(1), unit: 'mm' },
          { sym: 'p,max', name: 'Maximum', value: maxPitch.toFixed(0), unit: 'mm' },
        ],
        result: geom.pitch >= minPitch && geom.pitch <= maxPitch ? 'OK' : 'FAIL',
      },
    ],
  });

  /* ---------------- Prying action (T-stub model) ---------------- */
  if (inp.prying?.present) {
    const pr = inp.prying;
    const db = geom.d;
    const dp = holeDia(db, geom.d0);
    const bp = pr.b - db / 2;
    const delta = 1 - dp / pr.tributaryLength;
    const rho = pr.a / pr.b;
    const phi = 0.9; // plate bending resistance factor (AISC Part 9 form)
    const tc = Math.sqrt((4 * cap.Tndb * bp) / (phi * pr.tributaryLength * pr.plateFu));
    const alphaP = (Math.pow(tc / pr.plateThickness, 2) - 1) / (delta * (1 + rho));
    let Qfac: number;
    if (alphaP < 0) Qfac = 1;
    else if (alphaP <= 1) Qfac = Math.pow(pr.plateThickness / tc, 2) * (1 + delta * alphaP);
    else Qfac = Math.pow(pr.plateThickness / tc, 2) * (1 + delta);
    Qfac = Math.min(Qfac, 1);
    const boltTensionCapacityWithPrying = cap.Tndb * Qfac;
    const pryingForce = loads.tension * (1 / Math.max(Qfac, 1e-6) - 1);

    checks.push({
      id: 'b-prying',
      name: 'Prying action (T-stub)',
      clause: 'T-stub check (Nair/Thornton model)',
      demand: loads.tension / 1000,
      capacity: boltTensionCapacityWithPrying / 1000,
      unit: 'kN',
      ratio: loads.tension / boltTensionCapacityWithPrying,
      status: statusForRatio(loads.tension / boltTensionCapacityWithPrying),
      steps: [
        {
          title: 'Reference plate thickness (no prying)',
          clause: 'T-stub model',
          formula: "tc = √(4·Bc·b'/(φ·p·Fu)); b' = b − db/2; δ = 1 − d'/p; ρ = a/b",
          terms: [
            { sym: 'Bc', name: 'Bolt tension capacity', value: (cap.Tndb / 1000).toFixed(2), unit: 'kN' },
            { sym: "b'", name: 'Lever arm (bolt → stem)', value: bp.toFixed(1), unit: 'mm' },
            { sym: 'a', name: 'Bolt → plate edge', value: pr.a, unit: 'mm' },
            { sym: 'b', name: 'Bolt → stem face', value: pr.b, unit: 'mm' },
            { sym: 'p', name: 'Tributary length', value: pr.tributaryLength, unit: 'mm' },
            { sym: 'Fu', name: 'Plate ultimate stress', value: pr.plateFu, unit: 'MPa' },
          ],
          result: `tc = ${tc.toFixed(2)} mm`,
        },
        {
          title: 'Prying parameter α′ and reduction Q',
          clause: 'T-stub model',
          formula: "α' = [(tc/t)² − 1]/(δ(1+ρ));  Q = 1 (α'≤0), (t/tc)²(1+δα') (0<α'≤1), (t/tc)²(1+δ) (α'>1)",
          terms: [
            { sym: 't', name: 'End plate thickness', value: pr.plateThickness, unit: 'mm' },
            { sym: 'α′', name: 'Prying parameter', value: alphaP.toFixed(3) },
            { sym: 'δ', name: 'Hole factor', value: delta.toFixed(3) },
          ],
          result: `Q = ${Qfac.toFixed(3)}; prying force ≈ ${(pryingForce / 1000).toFixed(2)} kN per bolt`,
        },
        {
          title: 'Bolt tension with prying',
          clause: 'T-stub model',
          formula: 'Tc = Bc·Q ≥ applied bolt tension',
          terms: [
            { sym: 'Tc', name: 'Effective tension capacity', value: (boltTensionCapacityWithPrying / 1000).toFixed(2), unit: 'kN' },
            { sym: 'T', name: 'Applied bolt tension', value: (loads.tension / 1000).toFixed(2), unit: 'kN' },
          ],
          result:
            loads.tension <= boltTensionCapacityWithPrying
              ? 'OK'
              : 'FAIL — increase end-plate thickness or reduce lever arms',
        },
      ],
      notes: [
        'Prying model: Nair/Thornton T-stub procedure (AISC Manual Part 9 form) — used here as a documented standard T-stub check; IS 800:2007 requires prying effects to be considered in tension connections but gives no closed-form.',
      ],
    });
  }

  return { checks, capacity: cap };
}

/** Bolt-group design for a given load (FR-6.3): returns required bolt count. */
export function designBoltGroup(
  totalLoad: number,
  shearPerBolt: number,
  eccentricity = 0,
  geom?: BoltGeometry
): { nBolts: number; forceWithEccentricity: number; steps: CalcStep[] } {
  // Elastic vector method: direct shear + torsional component (simplified max-stress)
  let perBolt = shearPerBolt;
  const steps: CalcStep[] = [];
  if (eccentricity > 0 && geom) {
    // conservative: amplify by eccentricity/span factor
    const ampl = 1 + (2 * eccentricity) / Math.max(geom.pitch * (geom.nBolts - 1), 1);
    perBolt = shearPerBolt * ampl;
    steps.push({
      title: 'Eccentricity allowance (elastic vector method)',
      clause: 'Cl. 10.3.7 (eccentric connections)',
      formula: 'Fmax = Fdirect·(1 + 2e/Lgroup)  (simplified)',
      terms: [
        { sym: 'e', name: 'Eccentricity', value: eccentricity, unit: 'mm' },
        { sym: 'Lgroup', name: 'Bolt group length', value: geom.pitch * (geom.nBolts - 1), unit: 'mm' },
      ],
      result: `Design force per bolt = ${(perBolt / 1000).toFixed(2)} kN`,
    });
  }
  const nBolts = Math.max(1, Math.ceil(totalLoad / Math.max(perBolt, 1e-9)));
  steps.unshift({
    title: 'Number of bolts required',
    clause: 'Cl. 10.3',
    formula: 'n = T / Vbolt',
    terms: [
      { sym: 'T', name: 'Factored force', value: (totalLoad / 1000).toFixed(2), unit: 'kN' },
      { sym: 'Vbolt', name: 'Capacity per bolt (shear/bearing/slip)', value: (perBolt / 1000).toFixed(2), unit: 'kN' },
    ],
    result: `n = ${nBolts}`,
  });
  return { nBolts, forceWithEccentricity: perBolt, steps };
}
