/**
 * Flexural member design — IS 800:2007 Cl. 8.
 *  - Cl. 8.2.1 : design bending strength, laterally supported beams
 *  - Cl. 8.2.2 : lateral torsional buckling (unsupported beams)
 *  - Cl. 8.4   : design shear strength (+ web shear buckling 8.4.2)
 *  - Cl. 8.7.4 : web buckling & web crippling (bearing) at concentrated loads
 *  - Cl. 8.7.2 : bearing at supports
 */
import {
  CheckResult,
  CrossSection,
  Material,
  SafetyFactors,
  SectionClass,
  statusForRatio,
  CalcStep,
} from './types';
import { epsilon } from './materials';
import { warpingI } from './geometry';

export type MomentGradient = 'UBM' | 'centralPointLoad' | 'endMoments' | 'custom';

/** C1 factors for Mcr (Kirby & Nethercot) — simple supports, various M diagrams. */
export const C1_FACTORS: Record<string, number> = {
  UBM: 1.0, // uniform bending
  centralPointLoad: 1.36, // mid-span point load (with restraints at ends)
  endMoments: 1.88, // equal and opposite end moments? ψ=−1
  custom: 1.0,
};

export interface FlexureInput {
  section: CrossSection;
  material: Material;
  gammas: SafetyFactors;
  sectionClass: SectionClass;
  /** Factored design moment (N·mm) about major axis. */
  Mz: number;
  /** Factored design shear (N). */
  V: number;
  /** Laterally supported? If false, LTB per Cl. 8.2.2 is performed. */
  laterallySupported: boolean;
  /** Effective length between lateral restraints of compression flange (mm). */
  LLT?: number;
  /** Moment gradient coefficient C1 (or preset). */
  C1?: number;
  gradient?: MomentGradient;
  /** αLT — imperfection factor for LTB (default 0.21 rolled βb=1, else 0.49). */
  alphaLT?: number;

  /** Web bearing/buckling at a concentrated load/reaction (Cl. 8.7.4). */
  webBearing?: {
    F: number; // factored concentrated force/reaction (N)
    b1: number; // stiff bearing length (mm)
    atEnd: boolean; // end support / load near member end (1-side dispersion)
    /** For welded sections, dispersion through flange uses weld size s. */
    rootRadius?: number;
  };

  /** Serviceability deflection (separate module also available). */
  deflection?: {
    delta: number; // computed deflection (mm)
    limit: number; // allowable (mm)
  };
}

export interface FlexureResult {
  checks: CheckResult[];
  Md: number; // design bending capacity about z-z (N·mm)
  Vd: number;
  Mdb: number; // after LTB if applicable
}

function shearArea(section: CrossSection): number {
  const { h, b, tw = 0, tf = 0 } = section.elements;
  const A = section.props.area;
  switch (section.shape) {
    case 'I':
    case 'BuiltUpI':
    case 'Tee':
      // hot-rolled I/channel major axis: h·tw ; welded: d·tw (conservatively use tw·(h−2tf) if welded)
      return section.type === 'Welded' ? (h - 2 * tf) * tw : h * tw;
    case 'Channel':
      return h * tw;
    case 'DoubleChannel':
      return 2 * h * tw;
    case 'DoubleAngle':
      return 2 * (section.elements.legThickness ?? tf) * h;
    case 'RHS':
    case 'SHS':
      return (A * h) / (b + h); // loaded parallel to depth
    case 'CHS':
      return (2 * A) / Math.PI;
    case 'Angle':
    case 'Plate':
    case 'Custom':
    default:
      return A;
  }
}

/**
 * Design bending & shear strength of a flexural member (FR-4.1 … FR-4.6).
 */
export function designFlexure(inp: FlexureInput): FlexureResult {
  const { section, material, gammas, sectionClass, Mz, V } = inp;
  const p = section.props;
  const checks: CheckResult[] = [];
  const fy = material.fy;

  /* ---------------- Cl. 8.2.1 — moment capacity (supported) ---------------- */
  let beta_b = 1.0;
  let Md = (p.Zpz * fy) / gammas.gm0;
  const mdSteps: CalcStep[] = [];
  if (sectionClass === 'Semi-Compact') {
    beta_b = p.Zze / p.Zpz;
    Md = (p.Zze * fy) / gammas.gm0;
    mdSteps.push({
      title: 'Semi-compact section — elastic modulus used',
      clause: 'Cl. 8.2.1.2',
      formula: 'βb = Ze/Zp ≤ 1.0; Md = βb·Zp·fy/γm0 = Ze·fy/γm0',
      terms: [
        { sym: 'Ze', name: 'Elastic modulus', value: p.Zze.toFixed(0), unit: 'mm³' },
        { sym: 'Zp', name: 'Plastic modulus', value: p.Zpz.toFixed(0), unit: 'mm³' },
      ],
      result: `βb = ${beta_b.toFixed(3)}`,
    });
  } else if (sectionClass === 'Slender') {
    // Effective modulus — flange overhangs beyond the semi-compact limit deducted
    const eps = epsilon(fy);
    const tf = section.elements.flangeThickness ?? section.elements.tw ?? 10;
    const bFlat = section.elements.flangeOutstand ?? 0;
    const be = 15.7 * eps * tf; // semi-compact limit width
    if (bFlat > be && bFlat > 0) {
      const dA = (bFlat - be) * tf * (section.shape === 'DoubleAngle' ? 2 : section.shape === 'DoubleChannel' ? 2 : 2);
      const dI = dA * (p.height / 2) ** 2;
      const Zeff = Math.max(p.Zze - dI / (p.height / 2), p.Zze * 0.3);
      Md = (Zeff * fy) / gammas.gm0;
      beta_b = Zeff / p.Zpz;
      mdSteps.push({
        title: 'Slender section — effective section modulus',
        clause: 'Cl. 3.7.2 / 8.2.1 (effective area)',
        formula: 'be = 15.7ε·t (compression flange outstand limit); Ze,eff from reduced section',
        terms: [
          { sym: 'be', name: 'Effective outstand width', value: be.toFixed(1), unit: 'mm' },
          { sym: 'Ze,eff', name: 'Effective elastic modulus', value: Zeff.toFixed(0), unit: 'mm³' },
        ],
        result: `Md based on Ze,eff = ${Zeff.toFixed(0)} mm³`,
      });
    } else {
      Md = (p.Zze * fy) / gammas.gm0;
      beta_b = p.Zze / p.Zpz;
    }
  }
  mdSteps.unshift({
    title: 'Design bending strength (laterally supported)',
    clause: 'Cl. 8.2.1',
    formula: 'Md = βb·Zp·fy/γm0  (βb = 1.0 plastic & compact)',
    terms: [
      { sym: 'βb', name: 'Section constant', value: beta_b.toFixed(3) },
      { sym: 'Zp', name: 'Plastic section modulus (z-z)', value: p.Zpz.toFixed(0), unit: 'mm³' },
      { sym: 'fy', name: 'Yield stress', value: fy, unit: 'MPa' },
      { sym: 'γm0', name: 'Partial safety factor (Table 5)', value: gammas.gm0 },
    ],
    substituted: `Md = ${beta_b.toFixed(3)} × ${p.Zpz.toFixed(0)} × ${fy} / ${gammas.gm0}`,
    result: `Md = ${(Md / 1e6).toFixed(3)} kN·m`,
  });

  /* ---------------- Cl. 8.2.2 — lateral torsional buckling ---------------- */
  let Mdb = Md;
  if (!inp.laterallySupported && inp.LLT && inp.LLT > 0) {
    const LLT = inp.LLT;
    const C1 = inp.C1 ?? C1_FACTORS[inp.gradient ?? 'UBM'] ?? 1.0;
    const Iy = p.Iyy;
    const Iw = p.Cw > 0 ? p.Cw : warpingI(Iy, p.height);
    const J = p.J > 0 ? p.J : 1;
    const Mcr =
      C1 *
      ((Math.PI ** 2 * material.E * Iy) / (LLT * LLT)) *
      Math.sqrt(Iw / Iy + (LLT * LLT * material.G * J) / (Math.PI ** 2 * material.E * Iy));
    const alphaLT = inp.alphaLT ?? (inp.section.type === 'Welded' || beta_b < 0.99 ? 0.49 : 0.21);
    const lambdaLT = Math.sqrt((beta_b * p.Zpz * fy) / Mcr);
    const phiLT = 0.5 * (1 + alphaLT * (lambdaLT - 0.2) + lambdaLT * lambdaLT);
    const chiLT = Math.min(1, 1 / (phiLT + Math.sqrt(Math.max(phiLT * phiLT - lambdaLT * lambdaLT, 0))));
    const fbd = (chiLT * fy) / gammas.gm0;
    Mdb = beta_b * p.Zpz * fbd;
    checks.push({
      id: 'f-ltb',
      name: 'Lateral torsional buckling',
      clause: 'Cl. 8.2.2',
      demand: Mz / 1e6,
      capacity: Mdb / 1e6,
      unit: 'kN·m',
      ratio: Mz / Mdb,
      status: statusForRatio(Mz / Mdb),
      steps: [
        {
          title: 'Elastic critical moment',
          clause: 'Cl. 8.2.2',
          formula: 'Mcr = C1·(π²EIy/L²)·√(Iw/Iy + L²GJ/(π²EIy))',
          terms: [
            { sym: 'C1', name: 'Moment gradient factor', value: C1 },
            { sym: 'LLT', name: 'Effective length between restraints', value: LLT, unit: 'mm' },
            { sym: 'Iy', name: 'Second moment of area (y-y)', value: Iy.toFixed(0), unit: 'mm⁴' },
            { sym: 'Iw', name: 'Warping constant', value: Iw.toExponential(3), unit: 'mm⁶' },
            { sym: 'J', name: 'Torsion constant', value: J.toExponential(3), unit: 'mm⁴' },
          ],
          result: `Mcr = ${(Mcr / 1e6).toFixed(3)} kN·m`,
        },
        {
          title: 'Non-dimensional slenderness for LTB',
          clause: 'Cl. 8.2.2',
          formula: 'λLT = √(βb·Zp·fy/Mcr); φLT = 0.5[1 + αLT(λLT − 0.2) + λLT²]; χLT = 1/[φLT + √(φLT² − λLT²)]',
          terms: [
            { sym: 'αLT', name: 'LTB imperfection factor', value: alphaLT },
            { sym: 'λLT', name: 'LTB slenderness', value: lambdaLT.toFixed(3) },
          ],
          result: `φLT = ${phiLT.toFixed(3)}, χLT = ${chiLT.toFixed(4)}`,
        },
        {
          title: 'Design bending strength (LTB)',
          clause: 'Cl. 8.2.2',
          formula: 'Mdb = βb·Zp·fbd ≤ Md; fbd = χLT·fy/γm0',
          terms: [
            { sym: 'χLT', name: 'LTB reduction factor', value: chiLT.toFixed(4) },
            { sym: 'fbd', name: 'Design bending stress', value: fbd.toFixed(1), unit: 'MPa' },
          ],
          result: `Mdb = ${(Mdb / 1e6).toFixed(3)} kN·m`,
        },
      ],
    });
  } else {
    checks.push({
      id: 'f-moment',
      name: 'Design bending strength',
      clause: 'Cl. 8.2.1',
      demand: Mz / 1e6,
      capacity: Md / 1e6,
      unit: 'kN·m',
      ratio: Mz / Md,
      status: statusForRatio(Mz / Md),
      steps: mdSteps,
    });
  }

  /* ---------------- Cl. 8.4 — shear ---------------- */
  const Av = shearArea(section);
  const Vd = (Av * fy) / (Math.sqrt(3) * gammas.gm0);
  const vSteps: CalcStep[] = [
    {
      title: 'Plastic shear resistance',
      clause: 'Cl. 8.4.1',
      formula: 'Vd = Av·fy/(√3·γm0)',
      terms: [
        { sym: 'Av', name: 'Shear area', value: Av.toFixed(0), unit: 'mm²' },
        { sym: 'fy', name: 'Yield stress', value: fy, unit: 'MPa' },
        { sym: 'γm0', name: 'Partial safety factor', value: gammas.gm0 },
      ],
      substituted: `Vd = ${Av.toFixed(0)} × ${fy} / (√3 × ${gammas.gm0})`,
      result: `Vd = ${(Vd / 1000).toFixed(2)} kN`,
    },
  ];

  // Cl. 8.4.2 — web shear buckling when d/tw > 67ε (unstiffened)
  const tw = section.elements.tw ?? 0;
  const dw = section.elements.webDepth ?? 0;
  if (dw > 0 && tw > 0) {
    const eps = epsilon(fy);
    const slendernessWeb = dw / tw;
    if (slendernessWeb > 67 * eps) {
      const kv = 5.34; // unstiffened web
      const tauCr = (kv * Math.PI ** 2 * material.E) / (12 * (1 - material.mu ** 2)) / (slendernessWeb ** 2);
      const lambdaW = Math.sqrt(fy / (Math.sqrt(3) * tauCr));
      let tauB: number;
      if (lambdaW <= 0.8) tauB = fy / (Math.sqrt(3) * gammas.gm0);
      else if (lambdaW < 1.2) tauB = ((1 - 0.8 * (lambdaW - 0.8)) * fy) / (Math.sqrt(3) * gammas.gm0);
      else tauB = fy / (Math.sqrt(3) * lambdaW * lambdaW * gammas.gm0);
      const Vdb = tauB * dw * tw;
      vSteps.push({
        title: 'Web shear buckling check',
        clause: 'Cl. 8.4.2',
        formula: 'd/tw > 67ε → Vdb = τb·dw·tw (τb per three-regime curve)',
        terms: [
          { sym: 'd/tw', name: 'Web slenderness', value: slendernessWeb.toFixed(1) },
          { sym: '67ε', name: 'Limit', value: (67 * eps).toFixed(1) },
          { sym: 'τcr,e', name: 'Elastic critical shear stress', value: tauCr.toFixed(1), unit: 'MPa' },
          { sym: 'λw', name: 'Web slenderness parameter', value: lambdaW.toFixed(3) },
          { sym: 'τb', name: 'Buckling shear stress', value: tauB.toFixed(1), unit: 'MPa' },
        ],
        result: `Vdb = ${(Vdb / 1000).toFixed(2)} kN (governs over Vd if lower)`,
      });
    } else {
      vSteps.push({
        title: 'Web shear buckling check',
        clause: 'Cl. 8.4.2',
        formula: 'check required only when d/tw > 67ε (unstiffened)',
        terms: [
          { sym: 'd/tw', name: 'Web slenderness', value: slendernessWeb.toFixed(1) },
          { sym: '67ε', name: 'Limit', value: (67 * eps).toFixed(1) },
        ],
        result: 'Not required — web is stocky',
      });
    }
  }

  checks.push({
    id: 'f-shear',
    name: 'Design shear strength',
    clause: 'Cl. 8.4',
    demand: V / 1000,
    capacity: Vd / 1000,
    unit: 'kN',
    ratio: V / Vd,
    status: statusForRatio(V / Vd),
    steps: vSteps,
  });

  /* ---------------- Cl. 8.7.4 — web buckling & crippling ---------------- */
  if (inp.webBearing) {
    const wb = inp.webBearing;
    const r = wb.rootRadius ?? section.elements.r ?? 0;
    const tf = section.elements.tf ?? 0;
    const n1 = 2.5 * (tf + r); // 1:2.5 dispersion through flange + root, per side
    const nDisp = wb.atEnd ? n1 : 2 * n1;
    const beff = wb.b1 + nDisp;

    // (a) Web crippling (bearing yield)
    const Fw = (beff * tw * sectionProps_fyw(inp)) / gammas.gm0;
    checks.push({
      id: 'f-cripple',
      name: 'Web crippling (bearing yield)',
      clause: 'Cl. 8.7.4',
      demand: wb.F / 1000,
      capacity: Fw / 1000,
      unit: 'kN',
      ratio: wb.F / Fw,
      status: statusForRatio(wb.F / Fw),
      steps: [
        {
          title: 'Effective bearing length (1:2.5 dispersion through flange)',
          clause: 'Cl. 8.7.4',
          formula: 'n = 2.5(tf + r) per dispersed side; beff = b1 + n (end) or b1 + 2n (interior)',
          terms: [
            { sym: 'b1', name: 'Stiff bearing length', value: wb.b1, unit: 'mm' },
            { sym: 'tf', name: 'Flange thickness', value: tf, unit: 'mm' },
            { sym: 'r', name: 'Root radius / weld size', value: r, unit: 'mm' },
            { sym: 'n', name: 'Dispersion length per side', value: n1.toFixed(1), unit: 'mm' },
          ],
          result: `beff = ${beff.toFixed(1)} mm`,
        },
        {
          title: 'Web crippling resistance',
          clause: 'Cl. 8.7.4',
          formula: 'Fw = (b1 + n)·tw·fyw/γm0',
          terms: [
            { sym: 'tw', name: 'Web thickness', value: tw, unit: 'mm' },
            { sym: 'fyw', name: 'Web yield stress', value: sectionProps_fyw(inp), unit: 'MPa' },
            { sym: 'γm0', name: 'Partial safety factor', value: gammas.gm0 },
          ],
          substituted: `Fw = ${beff.toFixed(1)} × ${tw} × ${sectionProps_fyw(inp)} / ${gammas.gm0}`,
          result: `Fw = ${(Fw / 1000).toFixed(2)} kN`,
        },
      ],
    });

    // (b) Web buckling — web as a strut (curve c), effective length 0.7d
    const Le = 0.7 * (section.elements.webDepth || section.props.height);
    const rWeb = tw / Math.sqrt(12);
    const lambdaWeb = Le / rWeb;
    // fcd via simplified Perry (buckling class c) — inline to avoid circular imports
    const alphaC = 0.49;
    const fcc = (Math.PI ** 2 * material.E) / lambdaWeb ** 2;
    const lamBar = Math.sqrt(fy / fcc);
    const phiC = 0.5 * (1 + alphaC * (lamBar - 0.2) + lamBar * lamBar);
    const chiC = Math.min(1, 1 / (phiC + Math.sqrt(Math.max(phiC * phiC - lamBar * lamBar, 0))));
    const fcdWeb = (chiC * fy) / gammas.gm0;
    const Fwb = beff * tw * fcdWeb;
    checks.push({
      id: 'f-webbuckle',
      name: 'Web buckling under concentrated load',
      clause: 'Cl. 8.7.4 (curve c)',
      demand: wb.F / 1000,
      capacity: Fwb / 1000,
      unit: 'kN',
      ratio: wb.F / Fwb,
      status: statusForRatio(wb.F / Fwb),
      steps: [
        {
          title: 'Web as compression strut',
          clause: 'Cl. 8.7.4',
          formula: "Le = 0.7d; r = tw/√12; fcd per Cl. 7.1.2 (buckling class 'c')",
          terms: [
            { sym: 'Le', name: 'Effective length of web', value: Le.toFixed(0), unit: 'mm' },
            { sym: 'r', name: 'Radius of gyration of web', value: rWeb.toFixed(2), unit: 'mm' },
            { sym: 'λ', name: 'Slenderness', value: lambdaWeb.toFixed(1) },
            { sym: 'fcd', name: 'Design compressive stress', value: fcdWeb.toFixed(1), unit: 'MPa' },
          ],
          result: `fcd = ${fcdWeb.toFixed(1)} MPa`,
        },
        {
          title: 'Web buckling resistance',
          clause: 'Cl. 8.7.4',
          formula: 'Fwb = (b1 + n)·tw·fcd',
          terms: [
            { sym: 'beff', name: 'Effective bearing length', value: beff.toFixed(1), unit: 'mm' },
            { sym: 'tw', name: 'Web thickness', value: tw, unit: 'mm' },
          ],
          result: `Fwb = ${(Fwb / 1000).toFixed(2)} kN`,
        },
      ],
      notes: ['If inadequate, provide bearing stiffeners (Cl. 8.7.4) — see Stiffener Design module.'],
    });
  }

  /* ---------------- Cl. 9.4.2 preview: high shear moment reduction ---------- */
  if (V > 0.6 * Vd) {
    const betaHigh = Math.pow((2 * V) / Vd - 1, 2);
    // flange contribution (approx for I-sections)
    const tf = section.elements.tf ?? 0;
    const bf = section.elements.b ?? 0;
    const h = section.props.height;
    const Mfd = tf > 0 && bf > 0 ? (bf * tf * (h - tf) * fy) / gammas.gm0 : Md;
    const Mwd = Math.max(Md - Mfd, 0.05 * Md);
    const Mdv = Math.max(Mfd + (1 - betaHigh) * Mwd, (1.2 * p.Zze * fy) / gammas.gm0 * 0 + Mfd);
    checks.push({
      id: 'f-highshear',
      name: 'Moment capacity under high shear',
      clause: 'Cl. 9.4.2 / 8.2.1.3',
      demand: Mz / 1e6,
      capacity: Math.min(Mdv, Md) / 1e6,
      unit: 'kN·m',
      ratio: Mz / Math.min(Mdv, Md),
      status: statusForRatio(Mz / Math.min(Mdv, Md)),
      steps: [
        {
          title: 'High shear (V > 0.6 Vd) — reduced moment capacity',
          clause: 'Cl. 9.4.2',
          formula: 'β = (2V/Vd − 1)²; Mdv = Mfd + (1 − β)·Mwd',
          terms: [
            { sym: 'V/Vd', name: 'Shear utilization', value: (V / Vd).toFixed(3) },
            { sym: 'β', name: 'Reduction parameter', value: betaHigh.toFixed(3) },
            { sym: 'Mfd', name: 'Flange moment capacity', value: (Mfd / 1e6).toFixed(3), unit: 'kN·m' },
            { sym: 'Mwd', name: 'Web moment capacity', value: (Mwd / 1e6).toFixed(3), unit: 'kN·m' },
          ],
          result: `Mdv = ${(Math.min(Mdv, Md) / 1e6).toFixed(3)} kN·m`,
        },
      ],
    });
  }

  const govCap = Math.min(inp.laterallySupported ? Md : Mdb, Md);
  const overallRatio = Mz / govCap;
  checks.unshift({
    id: 'f-governing',
    name: 'Governing moment capacity',
    clause: 'Cl. 8.2',
    demand: Mz / 1e6,
    capacity: govCap / 1e6,
    unit: 'kN·m',
    ratio: overallRatio,
    status: statusForRatio(overallRatio),
    governing: true,
    steps: mdSteps.length ? mdSteps : [],
  });

  return { checks, Md, Vd, Mdb: govCap };
}

function sectionProps_fyw(inp: FlexureInput): number {
  return inp.material.fy;
}
