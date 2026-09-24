/**
 * Tension member design — IS 800:2007 Cl. 6.
 *  - Cl. 6.2 : design strength due to yielding of gross section
 *  - Cl. 6.3 : design strength due to rupture of net section (incl. shear lag β)
 *  - Cl. 6.4 : design strength due to block shear
 *  - Cl. 10.12: lug angle connection rules
 */
import { CheckResult, CrossSection, Material, SafetyFactors, statusForRatio, CalcStep } from './types';

export interface TensionInput {
  section: CrossSection;
  material: Material;
  gammas: SafetyFactors;
  /** Factored tensile force (N). */
  T: number;
  /** Net area after bolt-hole deductions (mm2). If omitted, computed from plate/angle data. */
  netArea?: number;
  /** Bolt holes: [diameter of hole, number of holes in chain] for plate/angle deduction. */
  holeDia?: number;
  nHoles?: number;
  memberWidth?: number; // plates: gross width (mm)
  memberThickness?: number; // plates: thickness (mm)

  /** Shear-lag data for angles/I connected by some elements only (Cl. 6.3.3). */
  shearLag?: {
    useBeta: boolean;
    w1: number; // outstand width of connected leg? (bs calculation)
    w2: number; // outstand width of outstanding leg
    t: number; // thickness of connected element
    bs: number; // shear lag width = w1 + w2 − t
    Lc: number; // length of end connection (pitch length between outermost fasteners)
    A1: number; // net area of connected leg
    A2: number; // gross area of outstanding leg
  };

  /** Block shear (Cl. 6.4). */
  blockShear?: {
    Avg: number; // gross area in shear (mm2)
    Avn: number; // net area in shear (mm2)
    Atg: number; // gross area in tension (mm2)
    Atn: number; // net area in tension (mm2)
  };

  /** Lug angle connection (Cl. 10.12). */
  lugAngle?: {
    present: boolean;
    lugArea: number; // area of lug angle (mm2)
    memberType: 'angle' | 'channel';
    /** Force in outstanding leg (N) used for fastener over-strength rules. */
    forceOutstandingLeg: number;
    /** Capacity of fasteners lug→gusset (N) and lug→member (N). */
    fastenerCapToGusset: number;
    fastenerCapToMember: number;
    nBoltsLugToGusset: number;
    /** Consider whole member area effective (lug angle rule). */
    wholeAreaEffective: boolean;
  };

  /** Max slenderness check (Cl. 3.8). */
  slenderness?: { lambda: number; limit: number };
}

export interface TensionResult {
  checks: CheckResult[];
  Tdg: number; // governing design tensile strength (N)
  governing: string;
}

/**
 * Design strength of a tension member (FR-2.1 … FR-2.5).
 * Td = min(Tdg_yield, Tdn_rupture, Tdb_block); Td ≥ T required.
 */
export function designTension(inp: TensionInput): TensionResult {
  const { section, material, gammas, T } = inp;
  const Ag = section.props.area;
  const checks: CheckResult[] = [];

  /* ---------------- Cl. 6.2 — yielding of gross section ---------------- */
  const Tdg = (Ag * material.fy) / gammas.gm0;
  {
    const steps: CalcStep[] = [
      {
        title: 'Design strength in yielding of the gross section',
        clause: 'Cl. 6.2',
        formula: 'Tdg = Ag·fy / γm0',
        terms: [
          { sym: 'Ag', name: 'Gross area of cross-section', value: Ag.toFixed(0), unit: 'mm²' },
          { sym: 'fy', name: 'Yield stress', value: material.fy, unit: 'MPa' },
          { sym: 'γm0', name: 'Partial safety factor (Table 5)', value: gammas.gm0 },
        ],
        substituted: `Tdg = (${Ag.toFixed(0)} × ${material.fy}) / ${gammas.gm0}`,
        result: `Tdg = ${(Tdg / 1000).toFixed(2)} kN`,
      },
    ];
    checks.push({
      id: 't-yield',
      name: 'Yielding of gross section',
      clause: 'Cl. 6.2',
      demand: T / 1000,
      capacity: Tdg / 1000,
      unit: 'kN',
      ratio: T / Tdg,
      status: statusForRatio(T / Tdg),
      steps,
    });
  }

  /* ---------------- Cl. 6.3 — rupture of net section ---------------- */
  let An = inp.netArea ?? Ag;
  if (inp.netArea === undefined && inp.holeDia && inp.nHoles && inp.memberThickness) {
    const w = inp.memberWidth ?? section.elements.b;
    An = (w - inp.nHoles * inp.holeDia) * inp.memberThickness;
  }

  let beta = 1.0;
  let Tdn = (0.9 * An * material.fu) / gammas.gm1;
  const ruptureSteps: CalcStep[] = [];

  if (inp.shearLag?.useBeta) {
    // Cl. 6.3.3 — angles connected by one leg (shear lag)
    const s = inp.shearLag;
    const bsOverLc = s.bs / s.Lc;
    beta = 1.4 - 0.076 * (s.w1 / s.t) * (material.fy / material.fu) * bsOverLc;
    const betaMax = (material.fu * gammas.gm1) / (material.fy * gammas.gm0);
    const betaClamp = Math.min(Math.max(beta, 0.7), betaMax);
    const AnShearLag = s.A1 + s.A2 * betaClamp;
    Tdn = (0.9 * AnShearLag * material.fu) / gammas.gm1;
    beta = betaClamp;
    ruptureSteps.push(
      {
        title: 'Shear lag factor β (angles connected by one leg)',
        clause: 'Cl. 6.3.3',
        formula: 'β = 1.4 − 0.076(w/t)(fy/fu)(bs/Lc) ≤ fu·γm1/(fy·γm0), ≥ 0.7',
        terms: [
          { sym: 'w1', name: 'Outstand width of connected leg', value: s.w1, unit: 'mm' },
          { sym: 't', name: 'Thickness of connected leg', value: s.t, unit: 'mm' },
          { sym: 'bs', name: 'Shear lag width', value: s.bs, unit: 'mm' },
          { sym: 'Lc', name: 'Length of end connection', value: s.Lc, unit: 'mm' },
          { sym: 'βmax', name: 'Upper limit fu·γm1/(fy·γm0)', value: betaMax.toFixed(3) },
        ],
        result: `β = ${betaClamp.toFixed(3)}`,
      },
      {
        title: 'Effective net area with shear lag',
        clause: 'Cl. 6.3.3',
        formula: 'An = A1 + A2·β',
        terms: [
          { sym: 'A1', name: 'Net area of connected leg', value: s.A1.toFixed(0), unit: 'mm²' },
          { sym: 'A2', name: 'Gross area of outstanding leg', value: s.A2.toFixed(0), unit: 'mm²' },
          { sym: 'β', name: 'Shear lag factor', value: beta.toFixed(3) },
        ],
        result: `An = ${AnShearLag.toFixed(0)} mm²`,
      }
    );
  }

  ruptureSteps.unshift({
    title: 'Net sectional area',
    clause: 'Cl. 6.3.1',
    formula: 'An = Ag − deductions (bolt holes)',
    terms: [
      { sym: 'Ag', name: 'Gross area', value: Ag.toFixed(0), unit: 'mm²' },
      { sym: 'An', name: 'Net area used', value: An.toFixed(0), unit: 'mm²' },
    ],
    result: `An = ${An.toFixed(0)} mm²`,
  });
  ruptureSteps.push({
    title: 'Design strength in rupture of the net section',
    clause: 'Cl. 6.3.1',
    formula: 'Tdn = 0.9·An·fu / γm1',
    terms: [
      { sym: 'An', name: 'Effective net area', value: An.toFixed(0), unit: 'mm²' },
      { sym: 'fu', name: 'Ultimate tensile stress', value: material.fu, unit: 'MPa' },
      { sym: 'γm1', name: 'Partial safety factor (Table 5)', value: gammas.gm1 },
    ],
    substituted: `Tdn = (0.9 × ${An.toFixed(0)} × ${material.fu}) / ${gammas.gm1}`,
    result: `Tdn = ${(Tdn / 1000).toFixed(2)} kN`,
  });

  checks.push({
    id: 't-rupture',
    name: 'Rupture of net section',
    clause: 'Cl. 6.3',
    demand: T / 1000,
    capacity: Tdn / 1000,
    unit: 'kN',
    ratio: T / Tdn,
    status: statusForRatio(T / Tdn),
    steps: ruptureSteps,
  });

  /* ---------------- Cl. 6.4 — block shear ---------------- */
  if (inp.blockShear) {
    const { Avg, Avn, Atg, Atn } = inp.blockShear;
    const mode1 = (Avg * material.fy) / (Math.sqrt(3) * gammas.gm0) + (0.9 * Atn * material.fu) / gammas.gm1;
    const mode2 = (0.9 * Avn * material.fu) / (Math.sqrt(3) * gammas.gm1) + (Atg * material.fy) / gammas.gm0;
    const Tdb = Math.min(mode1, mode2);
    checks.push({
      id: 't-block',
      name: 'Block shear failure',
      clause: 'Cl. 6.4.1',
      demand: T / 1000,
      capacity: Tdb / 1000,
      unit: 'kN',
      ratio: T / Tdb,
      status: statusForRatio(T / Tdb),
      steps: [
        {
          title: 'Block shear — shear yielding + tension rupture',
          clause: 'Cl. 6.4.1 (a)',
          formula: 'Tdb1 = Avg·fy/(√3·γm0) + 0.9·Atn·fu/γm1',
          terms: [
            { sym: 'Avg', name: 'Gross area in shear', value: Avg.toFixed(0), unit: 'mm²' },
            { sym: 'Atn', name: 'Net area in tension', value: Atn.toFixed(0), unit: 'mm²' },
          ],
          result: `Tdb1 = ${(mode1 / 1000).toFixed(2)} kN`,
        },
        {
          title: 'Block shear — shear rupture + tension yielding',
          clause: 'Cl. 6.4.1 (b)',
          formula: 'Tdb2 = 0.9·Avn·fu/(√3·γm1) + Atg·fy/γm0',
          terms: [
            { sym: 'Avn', name: 'Net area in shear', value: Avn.toFixed(0), unit: 'mm²' },
            { sym: 'Atg', name: 'Gross area in tension', value: Atg.toFixed(0), unit: 'mm²' },
          ],
          result: `Tdb2 = ${(mode2 / 1000).toFixed(2)} kN`,
        },
        {
          title: 'Design block shear strength',
          clause: 'Cl. 6.4.1',
          formula: 'Tdb = min(Tdb1, Tdb2)',
          terms: [],
          result: `Tdb = ${(Tdb / 1000).toFixed(2)} kN`,
        },
      ],
    });
  }

  /* ---------------- Cl. 10.12 — lug angle connection ---------------- */
  if (inp.lugAngle?.present) {
    const lug = inp.lugAngle;
    const ratioArea = lug.lugArea / Ag;
    const areaOk = ratioArea <= 0.1;
    const mult = lug.memberType === 'angle' ? { gusset: 1.2, member: 1.4 } : { gusset: 1.1, member: 1.2 };
    const reqGusset = mult.gusset * lug.forceOutstandingLeg;
    const reqMember = mult.member * lug.forceOutstandingLeg;
    const gussetOk = lug.fastenerCapToGusset >= reqGusset;
    const memberOk = lug.fastenerCapToMember >= reqMember;
    const boltsOk = lug.nBoltsLugToGusset >= 2;

    checks.push({
      id: 't-lug',
      name: 'Lug angle connection rules',
      clause: 'Cl. 10.12',
      demand: 1,
      capacity: 1,
      unit: '—',
      ratio: Math.max(
        ratioArea / 0.1,
        reqGusset / Math.max(lug.fastenerCapToGusset, 1e-9),
        reqMember / Math.max(lug.fastenerCapToMember, 1e-9),
        2 / Math.max(lug.nBoltsLugToGusset, 1e-9)
      ),
      status:
        areaOk && gussetOk && memberOk && boltsOk
          ? statusForRatio(
              Math.max(
                ratioArea / 0.1,
                reqGusset / Math.max(lug.fastenerCapToGusset, 1e-9),
                reqMember / Math.max(lug.fastenerCapToMember, 1e-9),
                2 / Math.max(lug.nBoltsLugToGusset, 1e-9)
              )
            )
          : 'FAIL',
      steps: [
        {
          title: 'Lug angle area limit',
          clause: 'Cl. 10.12',
          formula: 'A(lug) ≤ 0.10·A(member); whole area of member effective (gross less holes)',
          terms: [
            { sym: 'A(lug)', name: 'Area of lug angle', value: lug.lugArea.toFixed(0), unit: 'mm²' },
            { sym: 'A(member)', name: 'Area of main member', value: Ag.toFixed(0), unit: 'mm²' },
          ],
          result: `A(lug)/A(member) = ${ratioArea.toFixed(3)} → ${areaOk ? 'OK' : 'FAIL (> 10%)'}`,
        },
        {
          title: 'Fasteners lug→gusset over-strength',
          clause: 'Cl. 10.12',
          formula: `Capacity(lug→gusset) ≥ ${mult.gusset} × force in outstanding leg`,
          terms: [
            { sym: 'F(leg)', name: 'Force in outstanding leg', value: (lug.forceOutstandingLeg / 1000).toFixed(2), unit: 'kN' },
            { sym: 'Cap', name: 'Capacity lug→gusset', value: (lug.fastenerCapToGusset / 1000).toFixed(2), unit: 'kN' },
          ],
          result: `${(reqGusset / 1000).toFixed(2)} kN required → ${gussetOk ? 'OK' : 'FAIL'}`,
        },
        {
          title: 'Fasteners lug→member over-strength',
          clause: 'Cl. 10.12',
          formula: `Capacity(lug→member) ≥ ${mult.member} × force in outstanding leg`,
          terms: [
            { sym: 'F(leg)', name: 'Force in outstanding leg', value: (lug.forceOutstandingLeg / 1000).toFixed(2), unit: 'kN' },
            { sym: 'Cap', name: 'Capacity lug→member', value: (lug.fastenerCapToMember / 1000).toFixed(2), unit: 'kN' },
          ],
          result: `${(reqMember / 1000).toFixed(2)} kN required → ${memberOk ? 'OK' : 'FAIL'}`,
        },
        {
          title: 'Minimum fasteners attaching lug to gusset',
          clause: 'Cl. 10.12',
          formula: 'n ≥ 2 bolts (or equivalent weld length)',
          terms: [{ sym: 'n', name: 'Bolts lug→gusset', value: lug.nBoltsLugToGusset }],
          result: boltsOk ? 'OK' : 'FAIL',
        },
      ],
      notes: [
        lug.wholeAreaEffective
          ? 'Whole area of member (gross less bolt holes) treated as effective per Cl. 10.12.'
          : 'Standard net-section (shear lag) treatment used.',
      ],
    });
  }

  /* ---------------- Slenderness (Cl. 3.8) ---------------- */
  if (inp.slenderness) {
    const { lambda, limit } = inp.slenderness;
    const ratio = lambda / limit;
    checks.push({
      id: 't-slenderness',
      name: 'Slenderness limit',
      clause: 'Cl. 3.8',
      demand: lambda,
      capacity: limit,
      unit: '—',
      ratio,
      status: statusForRatio(ratio),
      steps: [
        {
          title: 'Maximum slenderness of tension member',
          clause: 'Cl. 3.8',
          formula: 'KL/r ≤ limit (400 no reversal / 180 reversal / 250 wind & seismic)',
          terms: [
            { sym: 'KL/r', name: 'Slenderness', value: lambda.toFixed(1) },
            { sym: 'limit', name: 'Maximum permitted', value: limit },
          ],
          result: `${lambda.toFixed(1)} → ${ratio <= 1 ? 'OK' : 'FAIL'}`,
        },
      ],
    });
  }

  /* ---------------- Governing strength ---------------- */
  const strengths: Array<{ name: string; Td: number }> = [
    { name: 'Yielding of gross section (Cl. 6.2)', Td: Tdg },
    { name: 'Rupture of net section (Cl. 6.3)', Td: Tdn },
  ];
  if (inp.blockShear) {
    const b = checks.find((c) => c.id === 't-block');
    if (b?.capacity) strengths.push({ name: 'Block shear (Cl. 6.4)', Td: b.capacity * 1000 });
  }
  const gov = strengths.reduce((a, b) => (a.Td <= b.Td ? a : b));
  const overallRatio = T / gov.Td;
  checks.unshift({
    id: 't-governing',
    name: 'Governing design tensile strength Td',
    clause: 'Cl. 6.1',
    demand: T / 1000,
    capacity: gov.Td / 1000,
    unit: 'kN',
    ratio: overallRatio,
    status: statusForRatio(overallRatio),
    governing: true,
    steps: [
      {
        title: 'Design tensile strength',
        clause: 'Cl. 6.1',
        formula: 'Td = min(Tdg, Tdn, Tdb)',
        terms: strengths.map((s) => ({ sym: s.name.split('(')[0].trim(), name: s.name, value: (s.Td / 1000).toFixed(2), unit: 'kN' })),
        result: `Td = ${(gov.Td / 1000).toFixed(2)} kN — governed by ${gov.name}`,
      },
    ],
  });

  return { checks, Tdg: gov.Td, governing: gov.name };
}
