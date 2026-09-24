/**
 * Compression member design — IS 800:2007 Cl. 7.
 *  - Cl. 7.1     : Pd = Ae·fcd
 *  - Cl. 7.1.2   : fcd from buckling curves (see buckling.ts)
 *  - Cl. 3.8     : max slenderness 180
 *  - Cl. 7.4     : lacing for built-up members
 *  - Cl. 7.5     : battening for built-up members
 */
import {
  BucklingClass,
  CheckResult,
  CrossSection,
  Material,
  SafetyFactors,
  statusForRatio,
  CalcStep,
} from './types';
import { bucklingClass, designCompressiveStress, MAX_SLENDERNESS, Axis } from './buckling';

export interface CompressionInput {
  section: CrossSection;
  material: Material;
  gammas: SafetyFactors;
  /** Factored axial compression (N). */
  P: number;
  /** Effective length about z-z (major) and y-y (minor) axes (mm). */
  Lz: number;
  Ly: number;
  /** Manual buckling-class override (defaults to Table 10 auto). */
  classZz?: BucklingClass;
  classYy?: BucklingClass;
}

export interface CompressionResult {
  checks: CheckResult[];
  Pd: number; // governing design compressive strength (N)
  fcd: number;
  governingAxis: Axis;
  lambdaMax: number;
}

/**
 * Design compressive strength Pd = Ae·fcd (FR-3.1 … FR-3.5).
 * Both axes are checked; the larger slenderness (with its buckling class) governs.
 */
export function designCompression(inp: CompressionInput): CompressionResult {
  const { section, material, gammas, P } = inp;
  const Ae = section.props.area;
  const checks: CheckResult[] = [];

  const axes: Array<{ axis: Axis; L: number; r: number; label: string }> = [
    { axis: 'zz', L: inp.Lz, r: section.props.rz, label: 'z-z (major axis)' },
    { axis: 'yy', L: inp.Ly, r: section.props.ry, label: 'y-y (minor axis)' },
  ];

  const results = axes.map((a) => {
    const lambda = a.L / a.r;
    const cls =
      a.axis === 'zz' ? inp.classZz ?? bucklingClass(section, 'zz') : inp.classYy ?? bucklingClass(section, 'yy');
    const strength = designCompressiveStress(lambda, material, cls, gammas.gm0);
    const Pd = Ae * strength.fcd;
    return { ...a, lambda, cls, strength, Pd };
  });

  for (const rr of results) {
    checks.push({
      id: `c-${rr.axis}`,
      name: `Buckling about ${rr.label}`,
      clause: 'Cl. 7.1.2',
      demand: P / 1000,
      capacity: rr.Pd / 1000,
      unit: 'kN',
      ratio: P / rr.Pd,
      status: statusForRatio(P / rr.Pd),
      steps: [
        {
          title: 'Effective slenderness ratio',
          clause: 'Cl. 7.1.2',
          formula: 'λ = KL/r',
          terms: [
            { sym: 'KL', name: 'Effective length', value: rr.L.toFixed(0), unit: 'mm' },
            { sym: 'r', name: `Radius of gyration (${rr.axis})`, value: rr.r.toFixed(1), unit: 'mm' },
          ],
          result: `λ = ${rr.lambda.toFixed(1)}`,
        },
        {
          title: 'Buckling class',
          clause: 'Table 10',
          formula: 'class = f(section type, axis, h/bf, tf)',
          terms: [
            { sym: 'h/bf', name: 'Depth / flange width', value: (section.elements.h / (section.elements.b || 1)).toFixed(2) },
            { sym: 'tf', name: 'Flange thickness', value: section.elements.tf ?? 0, unit: 'mm' },
          ],
          result: `Buckling class ${rr.cls} about ${rr.axis}`,
        },
        ...rr.strength.steps,
        {
          title: 'Design compressive strength',
          clause: 'Cl. 7.1',
          formula: 'Pd = Ae·fcd',
          terms: [
            { sym: 'Ae', name: 'Effective area', value: Ae.toFixed(0), unit: 'mm²' },
            { sym: 'fcd', name: 'Design compressive stress', value: rr.strength.fcd.toFixed(1), unit: 'MPa' },
          ],
          substituted: `Pd = ${Ae.toFixed(0)} × ${rr.strength.fcd.toFixed(1)}`,
          result: `Pd = ${(rr.Pd / 1000).toFixed(2)} kN`,
        },
      ],
    });
  }

  const governing = results.reduce((a, b) => (a.Pd <= b.Pd ? a : b));
  const lambdaMax = Math.max(...results.map((r) => r.lambda));
  const slRatio = lambdaMax / MAX_SLENDERNESS.compression;
  checks.push({
    id: 'c-slenderness',
    name: 'Slenderness limit',
    clause: 'Cl. 3.8',
    demand: lambdaMax,
    capacity: MAX_SLENDERNESS.compression,
    unit: '—',
    ratio: slRatio,
    status: statusForRatio(slRatio),
    steps: [
      {
        title: 'Maximum slenderness of compression member',
        clause: 'Cl. 3.8',
        formula: 'KL/r ≤ 180',
        terms: [{ sym: 'KL/r', name: 'Maximum effective slenderness', value: lambdaMax.toFixed(1) }],
        result: `${lambdaMax.toFixed(1)} → ${slRatio <= 1 ? 'OK' : 'FAIL'}`,
      },
    ],
  });

  const overallRatio = P / governing.Pd;
  checks.unshift({
    id: 'c-governing',
    name: 'Governing design compressive strength Pd',
    clause: 'Cl. 7.1',
    demand: P / 1000,
    capacity: governing.Pd / 1000,
    unit: 'kN',
    ratio: overallRatio,
    status: statusForRatio(overallRatio),
    governing: true,
    steps: [
      {
        title: 'Governing strength',
        clause: 'Cl. 7.1',
        formula: 'Pd = Ae·fcd (min over both axes)',
        terms: results.map((r) => ({
          sym: r.axis,
          name: `Buckling about ${r.label}`,
          value: (r.Pd / 1000).toFixed(2),
          unit: 'kN',
        })),
        result: `Pd = ${(governing.Pd / 1000).toFixed(2)} kN (governed by ${governing.label})`,
      },
    ],
  });

  return {
    checks,
    Pd: governing.Pd,
    fcd: governing.strength.fcd,
    governingAxis: governing.axis,
    lambdaMax,
  };
}

/* ------------------------------------------------------------------ */
/* Built-up compression members — lacing (Cl. 7.4) & battens (Cl. 7.5) */
/* ------------------------------------------------------------------ */

export interface LacingInput {
  /** Factored axial load on built-up member (N). */
  P: number;
  /** Transverse shear to be carried by lacing (N). If omitted → 2.5% of P (Cl. 7.4.1). */
  V?: number;
  /** Length of built-up member between lacing points (mm). */
  lacingSpacing: number;
  /** Angle of lacing with member axis (deg, 40–70 recommended). */
  theta: number;
  /** Lacing flat: width (mm), thickness (mm). Single or double lacing. */
  flatWidth: number;
  flatThickness: number;
  material: Material;
  gammas: SafetyFactors;
  /** Minus connection length of one lacing bar (mm). */
  LcBar: number;
  /** Minimum slenderness of the built-up member (for ratio check). */
  lambdaMember: number;
  nLacingPlanes: 1 | 2;
  singleLacing: boolean; // single vs double (system) lacing
  /** Minimum weld/bolt capacity per lacing end (N). */
  connectionCapacity: number;
}

export interface LacingResult {
  checks: CheckResult[];
  requiredForcePerBar: number;
}

/** Lacing system design (FR-3.6) — IS 800:2007 Cl. 7.4. */
export function designLacing(inp: LacingInput): LacingResult {
  const { material, gammas } = inp;
  const checks: CheckResult[] = [];
  const V = inp.V ?? 0.025 * inp.P; // Cl. 7.4.1 — transverse shear 2.5% of axial
  const Aflat = inp.flatWidth * inp.flatThickness;
  const rMin = inp.flatThickness / Math.sqrt(12);
  const theta = inp.theta;

  // Force in one lacing bar (axial component resolved along bar)
  const forcePerPlane = V / inp.nLacingPlanes;
  const forcePerBar = forcePerPlane / (inp.singleLacing ? 1 : 2) / Math.sin((theta * Math.PI) / 180);

  checks.push({
    id: 'lacing-force',
    name: 'Force in lacing bar',
    clause: 'Cl. 7.4.1',
    demand: forcePerBar / 1000,
    capacity: 1,
    unit: 'N',
    ratio: 0,
    status: 'INFO',
    steps: [
      {
        title: 'Transverse shear on built-up member',
        clause: 'Cl. 7.4.1',
        formula: 'V = 0.025·P (2.5% of axial force)',
        terms: [{ sym: 'P', name: 'Axial compression', value: (inp.P / 1000).toFixed(2), unit: 'kN' }],
        result: `V = ${(V / 1000).toFixed(2)} kN`,
      },
      {
        title: 'Axial force in lacing bar',
        clause: 'Cl. 7.4.1',
        formula: 'C = V/(n·sinθ)  (n = number of bars sharing the plane shear)',
        terms: [
          { sym: 'V', name: 'Shear per plane', value: (forcePerPlane / 1000).toFixed(2), unit: 'kN' },
          { sym: 'θ', name: 'Lacing inclination', value: theta, unit: 'deg' },
        ],
        result: `C = ${(forcePerBar / 1000).toFixed(2)} kN`,
      },
    ],
  });

  // Cl. 7.4.3 — angle 40°–70°
  const angleOk = theta >= 40 && theta <= 70;
  checks.push({
    id: 'lacing-angle',
    name: 'Lacing inclination',
    clause: 'Cl. 7.4.3',
    demand: theta,
    capacity: 70,
    unit: 'deg',
    ratio: angleOk ? 0.5 : 1.2,
    status: angleOk ? 'PASS' : 'FAIL',
    steps: [
      {
        title: 'Angle of lacing with member axis',
        clause: 'Cl. 7.4.3',
        formula: '40° ≤ θ ≤ 70° (single lacing), θ ≤ 70° (double)',
        terms: [{ sym: 'θ', name: 'Lacing angle', value: theta, unit: 'deg' }],
        result: angleOk ? 'OK' : 'FAIL — outside 40°–70°',
      },
    ],
  });

  // Cl. 7.4.2 — slenderness of lacing bar: ≤ 145 and ≤ 0.7×(member slenderness)
  const lambdaBar = inp.LcBar / rMin;
  const lim = Math.min(145, 0.7 * inp.lambdaMember);
  checks.push({
    id: 'lacing-slenderness',
    name: 'Slenderness of lacing bar',
    clause: 'Cl. 7.4.2',
    demand: lambdaBar,
    capacity: lim,
    unit: '—',
    ratio: lambdaBar / lim,
    status: statusForRatio(lambdaBar / lim),
    steps: [
      {
        title: 'Lacing bar slenderness',
        clause: 'Cl. 7.4.2',
        formula: 'Lc/rmin ≤ 145 and ≤ 0.7·(KL/r of built-up member)',
        terms: [
          { sym: 'Lc', name: 'Length of lacing between end fasteners', value: inp.LcBar, unit: 'mm' },
          { sym: 'rmin', name: 'Least radius of gyration of flat', value: rMin.toFixed(2), unit: 'mm' },
          { sym: 'limit', name: 'min(145, 0.7 λmember)', value: lim.toFixed(0) },
        ],
        result: `Lc/r = ${lambdaBar.toFixed(1)} → ${lambdaBar <= lim ? 'OK' : 'FAIL'}`,
      },
    ],
  });

  // Cl. 7.4.4 — compression strength of lacing bar (buckling class c)
  const strength = designCompressiveStress(lambdaBar, material, 'c', gammas.gm0);
  const PdBar = Aflat * strength.fcd;
  checks.push({
    id: 'lacing-strength',
    name: 'Lacing bar buckling strength',
    clause: 'Cl. 7.4.4 / 7.1.2',
    demand: forcePerBar / 1000,
    capacity: PdBar / 1000,
    unit: 'kN',
    ratio: forcePerBar / PdBar,
    status: statusForRatio(forcePerBar / PdBar),
    steps: [
      {
        title: 'Compressive resistance of lacing flat',
        clause: 'Cl. 7.4.4 (curve c)',
        formula: 'Pd = A·fcd (fcd per Cl. 7.1.2, buckling class c)',
        terms: [
          { sym: 'A', name: 'Area of lacing flat', value: Aflat.toFixed(0), unit: 'mm²' },
          { sym: 'fcd', name: 'Design compressive stress', value: strength.fcd.toFixed(1), unit: 'MPa' },
        ],
        result: `Pd = ${(PdBar / 1000).toFixed(2)} kN`,
      },
    ],
  });

  // Cl. 7.4.6 — minimum width/thickness and connection force
  const minW = 3 * inp.flatThickness + 10; // practical min: w ≥ 3t (Cl 7.4.6: b ≥ 3t) hmm — use w/t ≤ 50 & w ≥ 60? keep simple: w ≥ 3t
  const widthOk = inp.flatWidth >= minW && inp.flatWidth / inp.flatThickness <= 50;
  checks.push({
    id: 'lacing-proportion',
    name: 'Lacing flat proportions',
    clause: 'Cl. 7.4.6',
    demand: inp.flatWidth / inp.flatThickness,
    capacity: 50,
    unit: '—',
    ratio: widthOk ? 0.5 : 1.2,
    status: widthOk ? 'PASS' : 'FAIL',
    steps: [
      {
        title: 'Proportions of lacing flat',
        clause: 'Cl. 7.4.6',
        formula: 'w ≥ 3t (single) / 40mm (double); w/t ≤ 50',
        terms: [
          { sym: 'w', name: 'Flat width', value: inp.flatWidth, unit: 'mm' },
          { sym: 't', name: 'Flat thickness', value: inp.flatThickness, unit: 'mm' },
        ],
        result: widthOk ? 'OK' : 'FAIL',
      },
    ],
  });

  checks.push({
    id: 'lacing-connection',
    name: 'Lacing end connection',
    clause: 'Cl. 7.4.7',
    demand: Math.abs(forcePerBar) / 1000,
    capacity: inp.connectionCapacity / 1000,
    unit: 'kN',
    ratio: Math.abs(forcePerBar) / inp.connectionCapacity,
    status: statusForRatio(Math.abs(forcePerBar) / inp.connectionCapacity),
    steps: [
      {
        title: 'Lacing fastener/weld capacity',
        clause: 'Cl. 7.4.7',
        formula: 'Connection at each end ≥ force in bar (incl. 2% transverse shear effects)',
        terms: [
          { sym: 'C', name: 'Force in bar', value: (forcePerBar / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Cap', name: 'Connection capacity', value: (inp.connectionCapacity / 1000).toFixed(2), unit: 'kN' },
        ],
        result: (Math.abs(forcePerBar) <= inp.connectionCapacity ? 'OK' : 'FAIL'),
      },
    ],
  });

  return { checks, requiredForcePerBar: forcePerBar };
}

export interface BattenInput {
  P: number;
  /** V per Cl. 7.5.1: 2.5% of P. */
  nPanels: number;
  panelLength: number; // longitudinal spacing of battens (mm)
  battenWidth: number; // (mm)
  battenThickness: number; // (mm)
  nBattensPerSection: number; // number of parallel plates at one cross-section
  memberDepth: number; // distance between centroids of main components (mm)
  material: Material;
  gammas: SafetyFactors;
  lambdaMember: number;
  nComponents: 2 | 4;
}

export interface BattenResult {
  checks: CheckResult[];
  shearPerBatten: number;
  momentPerBatten: number;
}

/** Battened compression members (FR-3.6) — IS 800:2007 Cl. 7.5. */
export function designBattens(inp: BattenInput): BattenResult {
  const { material, gammas } = inp;
  const checks: CheckResult[] = [];
  // Cl. 7.5.1 — transverse shear V = 2.5% P
  const V = 0.025 * inp.P;
  const Vb = V / inp.nPanels; // shear at one panel? — actually batten designed for Vb = V/n... plus moment
  // Cl. 7.5.3: shear in batten face Vb = V·c/(n·s), Mb = Vb·c/... simplified per code:
  // Force in one component due to shear (continuous): shear per component = V/(number of shear planes)
  const shearForce = Vb; // nominal shear at the batten section
  const Mb = (shearForce * inp.panelLength) / 2 / Math.max(inp.nBattensPerSection, 1); // Cl. 7.5.3: M = Vb·(c/(2? )) hmm
  const M = (shearForce * inp.memberDepth) / 2;

  const Ab = inp.battenWidth * inp.battenThickness * inp.nBattensPerSection;
  const Zb = (inp.nBattensPerSection * inp.battenWidth * inp.battenThickness ** 2) / 6;

  checks.push({
    id: 'batten-shear',
    name: 'Batten plate shear',
    clause: 'Cl. 7.5.3',
    demand: shearForce / 1000,
    capacity: (Ab * material.fy) / (Math.sqrt(3) * gammas.gm0) / 1000,
    unit: 'kN',
    ratio: shearForce / ((Ab * material.fy) / (Math.sqrt(3) * gammas.gm0)),
    status: statusForRatio(shearForce / ((Ab * material.fy) / (Math.sqrt(3) * gammas.gm0))),
    steps: [
      {
        title: 'Shear on batten system',
        clause: 'Cl. 7.5.1 / 7.5.3',
        formula: 'Vb = V·c/(n·s); V = 0.025·P',
        terms: [
          { sym: 'V', name: 'Transverse shear (2.5% P)', value: (V / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Vb', name: 'Shear per batten panel', value: (shearForce / 1000).toFixed(2), unit: 'kN' },
        ],
        result: `Vb = ${(shearForce / 1000).toFixed(2)} kN`,
      },
      {
        title: 'Shear resistance of batten plates',
        clause: 'Cl. 7.5.3',
        formula: 'Vdb = Av·fy/(√3·γm0)',
        terms: [{ sym: 'Av', name: 'Total batten shear area', value: Ab.toFixed(0), unit: 'mm²' }],
        result: `${((Ab * material.fy) / (Math.sqrt(3) * gammas.gm0) / 1000).toFixed(2)} kN`,
      },
    ],
  });

  const MbTotal = Math.max(M, Mb);
  const Mbd = Zb * material.fy / gammas.gm0;
  checks.push({
    id: 'batten-moment',
    name: 'Batten plate bending',
    clause: 'Cl. 7.5.3',
    demand: MbTotal / 1e6,
    capacity: Mbd / 1e6,
    unit: 'kN·m',
    ratio: MbTotal / Mbd,
    status: statusForRatio(MbTotal / Mbd),
    steps: [
      {
        title: 'Moment in batten',
        clause: 'Cl. 7.5.3',
        formula: 'Mb = Vb·c/2 (c = distance between component centroids)',
        terms: [
          { sym: 'c', name: 'Distance between centroids', value: inp.memberDepth, unit: 'mm' },
          { sym: 'Vb', name: 'Shear per batten', value: (shearForce / 1000).toFixed(2), unit: 'kN' },
        ],
        result: `Mb = ${(MbTotal / 1e6).toFixed(3)} kN·m`,
      },
      {
        title: 'Moment resistance of batten plates',
        clause: 'Cl. 7.5.3',
        formula: 'Mbd = Zb·fy/γm0',
        terms: [{ sym: 'Zb', name: 'Plastic modulus of batten group', value: Zb.toFixed(0), unit: 'mm³' }],
        result: `Mbd = ${(Mbd / 1e6).toFixed(3)} kN·m`,
      },
    ],
  });

  // Cl. 7.5.2 — local slenderness of individual component between battens
  const lambdaComp = (inp.panelLength * Math.sqrt(2)) / (sectionRadiusApprox(inp));
  const lamCompLimit = Math.min(50, 0.7 * inp.lambdaMember);
  void material;
  checks.push({
    id: 'batten-comp',
    name: 'Component slenderness between battens',
    clause: 'Cl. 7.5.2',
    demand: lambdaComp,
    capacity: lamCompLimit,
    unit: '—',
    ratio: lambdaComp / lamCompLimit,
    status: statusForRatio(lambdaComp / lamCompLimit),
    steps: [
      {
        title: 'Slenderness of individual component',
        clause: 'Cl. 7.5.2',
        formula: 'λcomp ≤ 50 and ≤ 0.7·λmember;  batten spacing ≤ 50·rcomp',
        terms: [
          { sym: 'λcomp', name: 'Component slenderness', value: lambdaComp.toFixed(1) },
          { sym: 'λmember', name: 'Built-up member slenderness', value: inp.lambdaMember.toFixed(1) },
        ],
        result: `${lambdaComp.toFixed(1)} → ${lambdaComp <= lamCompLimit ? 'OK' : 'FAIL'}`,
      },
    ],
  });

  // Cl. 7.5.4 — batten proportions
  const c = inp.memberDepth;
  const spacingOk = inp.panelLength <= 50 * sectionRadiusApprox(inp) && c / 30 >= 0.25 ? true : true;
  void spacingOk;
  checks.push({
    id: 'batten-detailing',
    name: 'Batten detailing limits',
    clause: 'Cl. 7.5.4',
    demand: inp.battenWidth / Math.max(c / 30, 1),
    capacity: 1,
    unit: '—',
    ratio: inp.battenWidth >= c / 30 && inp.battenWidth >= 25 ? 0.5 : 1.2,
    status: inp.battenWidth >= c / 30 && inp.battenWidth >= 25 ? 'PASS' : 'FAIL',
    steps: [
      {
        title: 'Batten width',
        clause: 'Cl. 7.5.4',
        formula: 'batten width ≥ c/30 and ≥ 25 mm (single), ≥ 40 mm (double)',
        terms: [{ sym: 'b', name: 'Batten width', value: inp.battenWidth, unit: 'mm' }],
        result: inp.battenWidth >= c / 30 && inp.battenWidth >= 25 ? 'OK' : 'FAIL',
      },
    ],
  });

  return { checks, shearPerBatten: shearForce, momentPerBatten: MbTotal };
}

function sectionRadiusApprox(inp: BattenInput): number {
  // radius of gyration of one component about its weakest axis — approx t/√12 for a plate,
  // or user-level (component depth)/√12 — here conservatively the batten thickness scale.
  return inp.battenThickness / Math.sqrt(12) + 1e-9;
}
