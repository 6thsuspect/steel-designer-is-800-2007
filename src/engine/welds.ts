/**
 * Welded connections — IS 800:2007 Cl. 10.5.
 *  - Cl. 10.5.2 : size of fillet welds (min & max)
 *  - Cl. 10.5.3 : effective length / throat thickness
 *  - Cl. 10.5.7 : design strength of fillet weld
 *  - Cl. 10.5.8 : design strength of butt (groove) weld
 *  - Cl. 10.5.9 : stresses in welds combined (von-Mises form)
 *  - Cl. 10.5.10/10.5.11: weld groups with eccentric load (elastic vector method)
 */
import { CheckResult, Material, SafetyFactors, statusForRatio, CalcStep } from './types';

export type WeldType = 'fillet' | 'butt-full' | 'butt-partial';
export type WeldPosition = 'shop' | 'field';

export interface WeldInput {
  material: Material; // parent/plate material (for fu of weld ≈ matching electrode's fu ≥ parent)
  gammas: SafetyFactors;
  weldFu: number; // electrode ultimate stress (MPa), e.g. 410 for E41 electrode
  weldType: WeldType;
  size: number; // fillet weld size s (mm) — or throat for butt
  length: number; // effective length (mm)
  position: WeldPosition;
  /** Forces on the weld group (N, N·mm). */
  normalForce: number; // along weld axis? (tension/compression perpendicular to weld axis — treated per combined formula)
  shearAlongWeld: number; // longitudinal shear (N)
  shearAcrossWeld: number; // transverse shear (N)
  moment?: number; // in-plane moment on weld group (N·mm)
  /** For combined-stress check: normal stress perpendicular to throat σ⊥, τ⊥, τ∥ (MPa). */
  stresses?: { sigmaPerp: number; tauPerp: number; tauParallel: number };
  /** Thinner part thickness for size limits (mm). */
  partThickness: number;
  edgeRounded?: boolean; // max weld size at rounded edge = t − 1.5? else t
  /** Weld group geometry for eccentric analysis. */
  group?: {
    // weld segments as lines: each {x1,y1,x2,y2, throat} in mm (centroid at 0,0)
    segments: Array<{ x1: number; y1: number; x2: number; y2: number; size?: number }>;
    force: { Vx: number; Vy: number; N: number; M: number };
  };
}

export interface WeldResult {
  checks: CheckResult[];
  Fwd: number; // design strength of weld per unit length (N/mm)
}

/**
 * Weld design checks (FR-7.1 … FR-7.6).
 */
export function designWeld(inp: WeldInput): WeldResult {
  const { material, gammas } = inp;
  const checks: CheckResult[] = [];
  const gammaW = inp.position === 'field' ? Math.max(gammas.gmw, 1.5) : gammas.gmw;

  // Effective throat — Cl. 10.5.3
  const K = inp.weldType === 'fillet' ? 0.7 : 1.0;
  const te = K * inp.size;

  // Design stress in the weld — Cl. 10.5.7 (fillet): fwn = fu/√3
  const fwn = inp.weldFu / Math.sqrt(3);
  const fwd = fwn / gammaW;
  const Fwd = te * fwd; // per unit length

  const force = Math.hypot(inp.normalForce, Math.hypot(inp.shearAlongWeld, inp.shearAcrossWeld));
  const capacity = Fwd * inp.length;

  checks.push({
    id: 'w-strength',
    name: 'Weld design strength',
    clause: inp.weldType === 'fillet' ? 'Cl. 10.5.7' : 'Cl. 10.5.8',
    demand: force / 1000,
    capacity: capacity / 1000,
    unit: 'kN',
    ratio: capacity > 0 ? force / capacity : 1.5,
    status: statusForRatio(capacity > 0 ? force / capacity : 1.5),
    steps: [
      {
        title: 'Effective throat thickness',
        clause: 'Cl. 10.5.3',
        formula: inp.weldType === 'fillet' ? 'te = 0.7·s' : 'te = s (full penetration butt ≈ plate)',
        terms: [{ sym: 's', name: 'Weld size', value: inp.size, unit: 'mm' }],
        result: `te = ${te.toFixed(2)} mm`,
      },
      {
        title: 'Design strength of weld',
        clause: inp.weldType === 'fillet' ? 'Cl. 10.5.7' : 'Cl. 10.5.8',
        formula: 'Fwd = te·fw/γmw; fw = fu/√3 (fillet, stress on throat)',
        terms: [
          { sym: 'fu', name: 'Electrode ultimate stress', value: inp.weldFu, unit: 'MPa' },
          { sym: 'γmw', name: `Partial safety factor (${inp.position})`, value: gammaW },
          { sym: 'Lw', name: 'Effective length of weld', value: inp.length, unit: 'mm' },
        ],
        substituted: `Fwd·Lw = ${te.toFixed(2)} × ${(fwd).toFixed(1)} × ${inp.length}`,
        result: `Capacity = ${(capacity / 1000).toFixed(2)} kN; demand = ${(force / 1000).toFixed(2)} kN`,
      },
    ],
    notes:
      inp.weldType === 'butt-full'
        ? ['Full penetration butt weld: strength of the weld equals that of the parent plate (Cl. 10.5.8.1).']
        : inp.weldType === 'butt-partial'
        ? ['Partial penetration butt weld treated as a fillet weld of effective throat = penetration depth (Cl. 10.5.8.2).']
        : [],
  });

  // Min & max weld size — Cl. 10.5.2
  const t = inp.partThickness;
  const minSize = t <= 10 ? 3 : t <= 20 ? 5 : t <= 32 ? 6 : 8;
  const maxSize = inp.edgeRounded ? t - 1.5 : t;
  const sizeOk = inp.size >= minSize && inp.size <= maxSize;
  checks.push({
    id: 'w-size',
    name: 'Weld size limits',
    clause: 'Cl. 10.5.2',
    demand: inp.size,
    capacity: maxSize,
    unit: 'mm',
    ratio: sizeOk ? 0.5 : 1.2,
    status: sizeOk ? 'PASS' : 'FAIL',
    steps: [
      {
        title: 'Minimum size of fillet weld',
        clause: 'Cl. 10.5.2.2 (Table 21)',
        formula: 'smin = 3 (t≤10) / 5 (t≤20) / 6 (t≤32) / 8 (t>32) mm',
        terms: [{ sym: 't', name: 'Thickness of thicker part', value: t, unit: 'mm' }],
        result: `s = ${inp.size} mm, smin = ${minSize} mm → ${inp.size >= minSize ? 'OK' : 'FAIL'}`,
      },
      {
        title: 'Maximum size of fillet weld',
        clause: 'Cl. 10.5.2.3',
        formula: 'smax = t − 1.5 mm (rounded edge) or t (square edge) — thickness of thinner part',
        terms: [{ sym: 't', name: 'Thickness of thinner part', value: t, unit: 'mm' }],
        result: `smax = ${maxSize} mm → ${inp.size <= maxSize ? 'OK' : 'FAIL'}`,
      },
    ],
  });

  // Combined stresses — Cl. 10.5.9
  if (inp.stresses) {
    const { sigmaPerp, tauPerp, tauParallel } = inp.stresses;
    const sigmaEq = Math.sqrt(sigmaPerp ** 2 + 3 * (tauPerp ** 2 + tauParallel ** 2));
    const fwnD = inp.weldFu / gammaW; // equivalent stress limit fu/γmw
    checks.push({
      id: 'w-combined',
      name: 'Combined stresses in weld',
      clause: 'Cl. 10.5.9',
      demand: sigmaEq,
      capacity: fwnD,
      unit: 'MPa',
      ratio: sigmaEq / fwnD,
      status: statusForRatio(sigmaEq / fwnD),
      steps: [
        {
          title: 'Resultant stress on throat (combined)',
          clause: 'Cl. 10.5.9',
          formula: '√(σ⊥² + 3(τ⊥² + τ∥²)) ≤ fu/γmw',
          terms: [
            { sym: 'σ⊥', name: 'Normal stress ⊥ to throat', value: sigmaPerp.toFixed(1), unit: 'MPa' },
            { sym: 'τ⊥', name: 'Shear stress ⊥ to weld axis', value: tauPerp.toFixed(1), unit: 'MPa' },
            { sym: 'τ∥', name: 'Shear stress along weld axis', value: tauParallel.toFixed(1), unit: 'MPa' },
          ],
          result: `σeq = ${sigmaEq.toFixed(1)} MPa ≤ ${fwnD.toFixed(1)} MPa → ${sigmaEq <= fwnD ? 'OK' : 'FAIL'}`,
        },
      ],
    });
  }

  // Weld group with eccentric load (elastic vector) — FR-7.5
  if (inp.group) {
    const res = weldGroupAnalysis(inp.group, inp.material, gammaW, inp.weldFu, inp.weldType === 'fillet' ? 0.7 : 1.0, inp.size);
    checks.push(res);
  }

  void material;
  return { checks, Fwd };
}

/**
 * Weld group under in-plane eccentric shear (+ axial) — elastic vector method
 * (FR-7.5). Treats each segment as a line of weld; unit properties per throat.
 */
export function weldGroupAnalysis(
  group: NonNullable<WeldInput['group']>,
  material: Material,
  gammaW: number,
  weldFu: number,
  K: number,
  defaultSize: number
): CheckResult {
  const segs = group.segments;
  let L = 0;
  let sz = 0;
  let sy = 0;
  for (const s of segs) {
    const l = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    L += l;
    sz += ((s.x1 + s.x2) / 2) * l;
    sy += ((s.y1 + s.y2) / 2) * l;
  }
  const cz = sz / L;
  const cy = sy / L;
  // second moment of line about centroid
  let Ip = 0;
  for (const s of segs) {
    const l = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const zm = (s.x1 + s.x2) / 2 - cz;
    const ym = (s.y1 + s.y2) / 2 - cy;
    // I of a line segment about its own centre ≈ 0 (line), plus parallel term + l³/12·sin²
    const th = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    Ip += l * (zm * zm + ym * ym) + (l ** 3 / 12) * Math.sin(th) ** 2 + (l ** 3 / 12) * Math.cos(th) ** 2;
  }

  const { Vx, Vy, N, M } = group.force;
  // resultant force per unit length at the critical point (farthest segment end)
  let qMax = 0;
  for (const s of segs) {
    for (const pt of [
      { x: s.x1 - cz, y: s.y1 - cy },
      { x: s.x2 - cz, y: s.y2 - cy },
    ]) {
      const qx = Vx / L + (M * pt.y) / Ip;
      const qy = Vy / L + (M * pt.x) / Ip;
      const qn = N / L;
      const q = Math.hypot(qx, qy + qn);
      if (q > qMax) qMax = q;
    }
  }
  const te = K * defaultSize;
  const capacityPerMM = (te * weldFu) / (Math.sqrt(3) * gammaW);
  void material;

  return {
    id: 'w-group',
    name: 'Weld group under eccentric load',
    clause: 'Cl. 10.5.10 (elastic vector method)',
    demand: qMax,
    capacity: capacityPerMM,
    unit: 'N/mm',
    ratio: qMax / capacityPerMM,
    status: statusForRatio(qMax / capacityPerMM),
    steps: [
      {
        title: 'Weld group line properties',
        clause: 'Cl. 10.5.10',
        formula: 'L = Σℓ; centroid; Ip = Σ(ℓ·d² + ℓ³/12)',
        terms: [
          { sym: 'L', name: 'Total effective weld length', value: L.toFixed(0), unit: 'mm' },
          { sym: 'cz', name: 'Centroid z', value: cz.toFixed(1), unit: 'mm' },
          { sym: 'cy', name: 'Centroid y', value: cy.toFixed(1), unit: 'mm' },
          { sym: 'Ip', name: 'Polar moment of weld line', value: Ip.toFixed(0), unit: 'mm³' },
        ],
        result: `L = ${L.toFixed(0)} mm`,
      },
      {
        title: 'Resultant force per unit length (critical point)',
        clause: 'Cl. 10.5.10',
        formula: 'q = |V/L + M·r/Ip| vector sum, ≤ Fwd/te',
        terms: [
          { sym: 'Vx', name: 'Shear x', value: (Vx / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Vy', name: 'Shear y', value: (Vy / 1000).toFixed(2), unit: 'kN' },
          { sym: 'M', name: 'In-plane moment', value: (M / 1e6).toFixed(3), unit: 'kN·m' },
        ],
        result: `qmax = ${qMax.toFixed(1)} N/mm vs ${capacityPerMM.toFixed(1)} N/mm → ${qMax <= capacityPerMM ? 'OK' : 'FAIL'}`,
      },
    ],
    notes: ['Elastic method — suitable for weld groups where plastic redistribution is limited (Cl. 10.5.10).'],
  };
}

/** Effective throat thickness helper (FR-7.2). */
export function effectiveThroat(size: number, weldType: WeldType): number {
  return weldType === 'fillet' ? 0.7 * size : size;
}

/** Design weld size for a given force (FR-7.1). */
export function designFilletWeldSize(
  force: number,
  length: number,
  weldFu: number,
  gammas: SafetyFactors,
  position: WeldPosition,
  partThickness: number
): { size: number; steps: CalcStep[] } {
  const gammaW = position === 'field' ? Math.max(gammas.gmw, 1.5) : gammas.gmw;
  const fwd = weldFu / Math.sqrt(3) / gammaW;
  const teReq = force / (length * fwd);
  const minS = partThickness <= 10 ? 3 : partThickness <= 20 ? 5 : partThickness <= 32 ? 6 : 8;
  const maxS = partThickness - 1.5;
  const size = Math.min(Math.max(Math.ceil((teReq / 0.7) * 2) / 2, minS), maxS);
  return {
    size,
    steps: [
      {
        title: 'Required weld size',
        clause: 'Cl. 10.5.7',
        formula: 'te = F/(Lw·fw); s = te/0.7',
        terms: [
          { sym: 'F', name: 'Design force', value: (force / 1000).toFixed(2), unit: 'kN' },
          { sym: 'Lw', name: 'Effective weld length', value: length, unit: 'mm' },
          { sym: 'fw', name: 'Design weld stress', value: fwd.toFixed(1), unit: 'MPa' },
          { sym: 'smin/smax', name: 'Size limits (Cl. 10.5.2)', value: `${minS}/${maxS.toFixed(1)} mm` },
        ],
        result: `Provide s = ${size} mm (te = ${(0.7 * size).toFixed(1)} mm)`,
      },
    ],
  };
}
