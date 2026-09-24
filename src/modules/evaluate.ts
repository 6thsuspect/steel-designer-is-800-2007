/**
 * Design-case evaluators: map saved case inputs → engine calls → checks +
 * report rows. Pure functions (worker-safe), shared by module UIs and exports.
 */
import {
  CheckResult,
  CrossSection,
  Material,
  SafetyFactors,
} from '../engine/types';
import {
  makeMaterial,
  findSection,
  buildCustom,
  CustomSectionInput,
  classifySection,
  designTension,
  designCompression,
  designLacing,
  designBattens,
  designFlexure,
  designCombined,
  checkBolted,
  designBoltGroup,
  boltCapacities,
  BOLT_GRADES,
  holeDia,
  designWeld,
  checkDeflection,
  DEFLECTION_FORMULAS,
  buildReport,
  DesignReport,
  ReportInputRow,
  END_CONDITIONS,
  BucklingClass,
  SectionClass,
} from '../engine';
import { DesignCase, ProjectState, ModuleKey } from '../state/store';

const n = (o: Record<string, unknown>, k: string): number => Number(o[k] ?? 0);
const s = (o: Record<string, unknown>, k: string): string => String(o[k] ?? '');
const b = (o: Record<string, unknown>, k: string): boolean => Boolean(o[k]);

export function buildSection(sel: DesignCase['section']): CrossSection {
  if (sel.kind === 'catalog') return findSection(sel.name) ?? findSection('ISMB 300')!;
  return buildCustom((sel.custom ?? { shape: 'I' }) as CustomSectionInput);
}

export function buildMaterial(sel: DesignCase['material']): Material {
  return makeMaterial(sel.grade, sel.band, sel.customFy, sel.customFu);
}

export interface EvalOutput {
  checks: CheckResult[];
  rows: ReportInputRow[];
  section: CrossSection;
  material: Material;
  classification?: SectionClass;
  diagram: { mode: 'tension' | 'compression' | 'beam' | 'connection'; value: number; unit: string; span?: number };
  report: DesignReport;
}

function report(ctx: ProjectState, cs: DesignCase, out: Omit<EvalOutput, 'report'>, moduleTitle: string): DesignReport {
  return buildReport({
    projectName: ctx.name,
    caseName: cs.name,
    module: moduleTitle,
    author: ctx.author || undefined,
    inputs: out.rows,
    checks: out.checks,
    section: out.section,
    material: out.material,
    gammas: ctx.gammas,
  });
}

export function evaluateTension(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const gammas: SafetyFactors = ctx.gammas;
  const rows: ReportInputRow[] = [
    { group: 'Loads', label: 'Factored tension T', value: `${n(inp, 'T_kN')} kN`, ref: 'Cl. 6.1' },
  ];
  if (b(inp, 'useHoles')) {
    rows.push(
      { group: 'Connection', label: 'Bolt holes', value: `${n(inp, 'nHoles')} × ⌀${n(inp, 'holeDia')} mm` },
      { group: 'Connection', label: 'Plate width × thickness', value: `${n(inp, 'plateWidth')} × ${n(inp, 'plateThickness')} mm` }
    );
  }
  const res = designTension({
    section,
    material,
    gammas,
    T: n(inp, 'T_kN') * 1000,
    holeDia: b(inp, 'useHoles') ? n(inp, 'holeDia') : undefined,
    nHoles: b(inp, 'useHoles') ? n(inp, 'nHoles') : undefined,
    memberWidth: n(inp, 'plateWidth'),
    memberThickness: n(inp, 'plateThickness'),
    shearLag: b(inp, 'useShearLag')
      ? {
          useBeta: true,
          w1: n(inp, 'w1'),
          w2: n(inp, 'w2'),
          t: n(inp, 'lagT'),
          bs: n(inp, 'w1') + n(inp, 'w2') - n(inp, 'lagT'),
          Lc: n(inp, 'Lc'),
          A1: n(inp, 'A1'),
          A2: n(inp, 'A2'),
        }
      : undefined,
    blockShear: b(inp, 'useBlockShear')
      ? { Avg: n(inp, 'Avg'), Avn: n(inp, 'Avn'), Atg: n(inp, 'Atg'), Atn: n(inp, 'Atn') }
      : undefined,
    lugAngle: b(inp, 'useLug')
      ? {
          present: true,
          lugArea: n(inp, 'lugArea'),
          memberType: s(inp, 'lugMemberType') === 'channel' ? 'channel' : 'angle',
          forceOutstandingLeg: n(inp, 'forceLeg_kN') * 1000,
          fastenerCapToGusset: n(inp, 'capGusset_kN') * 1000,
          fastenerCapToMember: n(inp, 'capMember_kN') * 1000,
          nBoltsLugToGusset: n(inp, 'nBoltsLug'),
          wholeAreaEffective: true,
        }
      : undefined,
    slenderness: b(inp, 'checkSlenderness')
      ? { lambda: n(inp, 'lambda'), limit: n(inp, 'slendernessLimit') }
      : undefined,
  });
  const out = {
    checks: res.checks,
    rows,
    section,
    material,
    diagram: { mode: 'tension' as const, value: n(inp, 'T_kN'), unit: 'kN' },
  };
  return { ...out, report: report(ctx, cs, out, 'Tension Member Design') };
}

export function evaluateCompression(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const ez = END_CONDITIONS.find((e) => e.key === s(inp, 'endZ'));
  const ey = END_CONDITIONS.find((e) => e.key === s(inp, 'endY'));
  const Kz = ez?.k ?? n(inp, 'Kz');
  const Ky = ey?.k ?? n(inp, 'Ky');
  const Lz = n(inp, 'Lz');
  const Ly = n(inp, 'Ly');
  const rows: ReportInputRow[] = [
    { group: 'Loads', label: 'Factored compression P', value: `${n(inp, 'P_kN')} kN`, ref: 'Cl. 7.1' },
    { group: 'Geometry', label: 'Effective length z-z', value: `${(Kz * Lz).toFixed(0)} mm (${Kz} × ${Lz})`, ref: 'Table 3' },
    { group: 'Geometry', label: 'Effective length y-y', value: `${(Ky * Ly).toFixed(0)} mm (${Ky} × ${Ly})`, ref: 'Table 3' },
  ];
  const res = designCompression({
    section,
    material,
    gammas: ctx.gammas,
    P: n(inp, 'P_kN') * 1000,
    Lz: Kz * Lz,
    Ly: Ky * Ly,
    classZz: s(inp, 'classZz') !== 'auto' ? (s(inp, 'classZz') as BucklingClass) : undefined,
    classYy: s(inp, 'classYy') !== 'auto' ? (s(inp, 'classYy') as BucklingClass) : undefined,
  });
  let checks = res.checks;

  if (s(inp, 'builtUpMode') === 'lacing') {
    const lace = designLacing({
      P: n(inp, 'P_kN') * 1000,
      lacingSpacing: n(inp, 'lacingSpacing'),
      theta: n(inp, 'lacingTheta'),
      flatWidth: n(inp, 'flatWidth'),
      flatThickness: n(inp, 'flatThickness'),
      material,
      gammas: ctx.gammas,
      LcBar: n(inp, 'LcBar'),
      lambdaMember: res.lambdaMax,
      nLacingPlanes: (n(inp, 'nLacingPlanes') === 2 ? 2 : 1) as 1 | 2,
      singleLacing: b(inp, 'singleLacing'),
      connectionCapacity: n(inp, 'connectionCap_kN') * 1000,
    });
    checks = [...checks, ...lace.checks];
    rows.push({ group: 'Built-up', label: 'Lacing system', value: `flat ${n(inp, 'flatWidth')}×${n(inp, 'flatThickness')}, θ=${n(inp, 'lacingTheta')}°`, ref: 'Cl. 7.4' });
  } else if (s(inp, 'builtUpMode') === 'batten') {
    const bat = designBattens({
      P: n(inp, 'P_kN') * 1000,
      nPanels: n(inp, 'nPanels'),
      panelLength: n(inp, 'panelLength'),
      battenWidth: n(inp, 'battenWidth'),
      battenThickness: n(inp, 'battenThickness'),
      nBattensPerSection: n(inp, 'nBattens'),
      memberDepth: n(inp, 'memberDepth'),
      material,
      gammas: ctx.gammas,
      lambdaMember: res.lambdaMax,
      nComponents: 2,
    });
    checks = [...checks, ...bat.checks];
    rows.push({ group: 'Built-up', label: 'Battened system', value: `batten ${n(inp, 'battenWidth')}×${n(inp, 'battenThickness')} @ ${n(inp, 'panelLength')}`, ref: 'Cl. 7.5' });
  }

  const out = {
    checks,
    rows,
    section,
    material,
    diagram: { mode: 'compression' as const, value: n(inp, 'P_kN'), unit: 'kN', span: Lz },
  };
  return { ...out, report: report(ctx, cs, out, 'Compression Member Design') };
}

export function evaluateFlexure(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const cls = classifySection(section, material, 'both');
  const rows: ReportInputRow[] = [
    { group: 'Loads', label: 'Design moment Mz', value: `${n(inp, 'Mz_kNm')} kN·m`, ref: 'Cl. 8.2' },
    { group: 'Loads', label: 'Design shear V', value: `${n(inp, 'V_kN')} kN`, ref: 'Cl. 8.4' },
    { group: 'Classification', label: 'Section class (Table 2)', value: cls.overall, ref: 'Table 2' },
    {
      group: 'Geometry',
      label: 'Lateral support',
      value: b(inp, 'laterallySupported') ? 'Compression flange supported' : `Unsupported, LLT = ${n(inp, 'LLT')} mm`,
    },
  ];
  const res = designFlexure({
    section,
    material,
    gammas: ctx.gammas,
    sectionClass: cls.overall,
    Mz: n(inp, 'Mz_kNm') * 1e6,
    V: n(inp, 'V_kN') * 1000,
    laterallySupported: b(inp, 'laterallySupported'),
    LLT: n(inp, 'LLT'),
    C1: n(inp, 'C1') || undefined,
    gradient: 'custom',
    webBearing: b(inp, 'useWebBearing')
      ? { F: n(inp, 'F_kN') * 1000, b1: n(inp, 'b1'), atEnd: b(inp, 'atEnd') }
      : undefined,
  });
  let checks: CheckResult[] = [...res.checks];
  // classification as info check
  checks.push({
    id: 'f-class',
    name: 'Section classification',
    clause: 'Table 2 / Cl. 3.7',
    demand: 0,
    capacity: 0,
    unit: '—',
    ratio: 0,
    status: 'INFO',
    steps: cls.steps,
    notes: [`Overall class: ${cls.overall}`, cls.shearBucklingNeeded ? 'Web shear buckling check required (d/tw > 67ε).' : ''],
  });
  if (b(inp, 'useDeflection')) {
    checks = [
      ...checks,
      ...checkDeflection({
        delta: n(inp, 'delta'),
        span: n(inp, 'span'),
        limitRatio: n(inp, 'limitRatio'),
      }),
    ];
  }
  const out = {
    checks,
    rows,
    section,
    material,
    classification: cls.overall,
    diagram: { mode: 'beam' as const, value: n(inp, 'Mz_kNm'), unit: 'kN·m', span: n(inp, 'span') || 6000 },
  };
  return { ...out, report: report(ctx, cs, out, 'Flexural Member Design') };
}

export function evaluateCombined(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const rows: ReportInputRow[] = [
    { group: 'Forces', label: 'Axial P (+ tension / − compression)', value: `${n(inp, 'P_kN')} kN` },
    { group: 'Forces', label: 'Mz / My', value: `${n(inp, 'Mz_kNm')} / ${n(inp, 'My_kNm')} kN·m` },
    { group: 'Forces', label: 'Shear V', value: `${n(inp, 'V_kN')} kN` },
    { group: 'Capacities', label: 'Td / Pd / Mdz / Mdy / Vd', value: `${n(inp, 'Td_kN')} kN · ${n(inp, 'Pd_kN')} kN · ${n(inp, 'Mdz_kNm')} · ${n(inp, 'Mdy_kNm')} kN·m · ${n(inp, 'Vd_kN')} kN` },
  ];
  const res = designCombined({
    section,
    material,
    gammas: ctx.gammas,
    P: n(inp, 'P_kN') * 1000,
    Mz: n(inp, 'Mz_kNm') * 1e6,
    My: n(inp, 'My_kNm') * 1e6,
    Td: n(inp, 'Td_kN') * 1000,
    Pd: n(inp, 'Pd_kN') * 1000,
    Mdz: n(inp, 'Mdz_kNm') * 1e6,
    Mdy: n(inp, 'Mdy_kNm') * 1e6,
    V: n(inp, 'V_kN') * 1000,
    Vd: n(inp, 'Vd_kN') * 1000,
    KLz: n(inp, 'KLz') || undefined,
    Cm: n(inp, 'Cm') || 1,
    m: b(inp, 'useAmplification') ? undefined : 1,
  });
  const out = {
    checks: res.checks,
    rows,
    section,
    material,
    diagram: { mode: n(inp, 'P_kN') >= 0 ? ('tension' as const) : ('compression' as const), value: Math.abs(n(inp, 'P_kN')), unit: 'kN' },
  };
  return { ...out, report: report(ctx, cs, out, 'Combined Axial Force & Bending') };
}

export function evaluateBolts(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const bolt = BOLT_GRADES.find((g) => g.grade === s(inp, 'boltGrade')) ?? BOLT_GRADES[3];
  const geom = {
    d: n(inp, 'd'),
    d0: holeDia(n(inp, 'd')),
    pitch: n(inp, 'pitch'),
    gauge: n(inp, 'gauge'),
    endDistance: n(inp, 'endDist'),
    edgeDistance: n(inp, 'edgeDist'),
    nBolts: n(inp, 'nBolts'),
    nShearPlanes: n(inp, 'nShearPlanes'),
    nShearThroughThread: n(inp, 'nThreadPlanes'),
    thickness: n(inp, 'thickness'),
  };
  const rows: ReportInputRow[] = [
    { group: 'Bolt', label: 'Grade / diameter', value: `${s(inp, 'boltGrade')} M${n(inp, 'd')}`, ref: 'Cl. 10.1' },
    { group: 'Geometry', label: 'Pitch / gauge', value: `${n(inp, 'pitch')} / ${n(inp, 'gauge')} mm`, ref: 'Cl. 10.2' },
    { group: 'Geometry', label: 'End / edge distance', value: `${n(inp, 'endDist')} / ${n(inp, 'edgeDist')} mm`, ref: 'Cl. 10.2.3' },
    { group: 'Loads', label: 'Shear / tension per bolt', value: `${n(inp, 'shear_kN')} / ${n(inp, 'tension_kN')} kN` },
    { group: 'Type', label: 'Connection type', value: b(inp, 'hsfg') ? `HSFG (μf = ${n(inp, 'muF')}, ne = ${n(inp, 'nFriction')})` : 'Bearing-type' },
  ];
  const res = checkBolted({
    geom,
    bolt,
    plate: material,
    gammas: ctx.gammas,
    loads: { shear: n(inp, 'shear_kN') * 1000, tension: n(inp, 'tension_kN') * 1000 },
    hsfg: b(inp, 'hsfg')
      ? { muF: n(inp, 'muF'), nFrictionSurfaces: n(inp, 'nFriction'), largeHoles: b(inp, 'largeHoles') }
      : undefined,
    shearedEdge: b(inp, 'shearedEdge'),
    prying: b(inp, 'usePrying')
      ? {
          present: true,
          plateThickness: n(inp, 'plateTp'),
          a: n(inp, 'pryingA'),
          b: n(inp, 'pryingB'),
          tributaryLength: n(inp, 'pryingP'),
          plateFu: n(inp, 'pryingFu'),
        }
      : undefined,
  });

  // bolt-group sizing (FR-6.3)
  const cap = boltCapacities(geom, bolt, material, ctx.gammas, {
    hsfg: b(inp, 'hsfg') ? { muF: n(inp, 'muF'), nFrictionSurfaces: n(inp, 'nFriction') } : undefined,
  });
  const perBolt = b(inp, 'hsfg') && cap.Vdsf ? cap.Vdsf : Math.min(cap.Vdsb, cap.Vdpb);
  const grp = designBoltGroup(n(inp, 'totalLoad_kN') * 1000, perBolt, n(inp, 'eccentricity'), geom);
  const checks: CheckResult[] = [
    ...res.checks,
    {
      id: 'b-group',
      name: 'Bolt group sizing',
      clause: 'Cl. 10.3.7',
      demand: n(inp, 'nBolts'),
      capacity: grp.nBolts,
      unit: 'no.',
      ratio: grp.nBolts / Math.max(n(inp, 'nBolts'), 1),
      status: n(inp, 'nBolts') >= grp.nBolts ? 'PASS' : 'FAIL',
      steps: grp.steps,
    },
  ];
  const out = {
    checks,
    rows,
    section,
    material,
    diagram: { mode: 'connection' as const, value: n(inp, 'shear_kN'), unit: 'kN' },
  };
  return { ...out, report: report(ctx, cs, out, 'Bolted Connection Design') };
}

export function evaluateWelds(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const rows: ReportInputRow[] = [
    { group: 'Weld', label: 'Type / size / length', value: `${s(inp, 'weldType')} ${n(inp, 'size')} mm × ${n(inp, 'length')} mm` },
    { group: 'Weld', label: 'Electrode fu / position', value: `${n(inp, 'weldFu')} MPa · ${s(inp, 'position')}`, ref: 'Cl. 10.5.7' },
    { group: 'Loads', label: 'N / Vall / Vacc', value: `${n(inp, 'N_kN')} / ${n(inp, 'Valong_kN')} / ${n(inp, 'Vacross_kN')} kN` },
  ];
  const wt = s(inp, 'weldType') as 'fillet' | 'butt-full' | 'butt-partial';
  const res = designWeld({
    material,
    gammas: ctx.gammas,
    weldFu: n(inp, 'weldFu'),
    weldType: wt,
    size: n(inp, 'size'),
    length: n(inp, 'length'),
    position: s(inp, 'position') === 'field' ? 'field' : 'shop',
    normalForce: n(inp, 'N_kN') * 1000,
    shearAlongWeld: n(inp, 'Valong_kN') * 1000,
    shearAcrossWeld: n(inp, 'Vacross_kN') * 1000,
    partThickness: n(inp, 'partThickness'),
    edgeRounded: b(inp, 'edgeRounded'),
    stresses: b(inp, 'useCombined')
      ? { sigmaPerp: n(inp, 'sigmaPerp'), tauPerp: n(inp, 'tauPerp'), tauParallel: n(inp, 'tauPar') }
      : undefined,
    group: b(inp, 'useGroup')
      ? {
          segments: [
            { x1: n(inp, 'groupW') / 2, y1: -n(inp, 'groupH') / 2, x2: n(inp, 'groupW') / 2, y2: n(inp, 'groupH') / 2 },
            { x1: -n(inp, 'groupW') / 2, y1: -n(inp, 'groupH') / 2, x2: -n(inp, 'groupW') / 2, y2: n(inp, 'groupH') / 2 },
          ],
          force: { Vx: n(inp, 'groupVx_kN') * 1000, Vy: n(inp, 'groupVy_kN') * 1000, N: 0, M: n(inp, 'groupM_kNm') * 1e6 },
        }
      : undefined,
  });
  const out = {
    checks: res.checks,
    rows,
    section,
    material,
    diagram: { mode: 'connection' as const, value: n(inp, 'Valong_kN'), unit: 'kN' },
  };
  return { ...out, report: report(ctx, cs, out, 'Welded Connection Design') };
}

export function evaluateServiceability(cs: DesignCase, ctx: ProjectState): EvalOutput {
  const inp = cs.input;
  const section = buildSection(cs.section);
  const material = buildMaterial(cs.material);
  const E = n(inp, 'E') || 200000;
  const I = section.props.Izz;
  let delta = n(inp, 'manualDelta');
  const w = n(inp, 'w_kNpm'); // kN/m → N/mm
  const P = n(inp, 'P_kN') * 1000;
  const L = n(inp, 'span');
  if (!b(inp, 'useManual')) {
    switch (s(inp, 'loadCase')) {
      case 'udl':
        delta = DEFLECTION_FORMULAS.udlSimplySupported(w, L, E, I);
        break;
      case 'point':
        delta = DEFLECTION_FORMULAS.pointLoadMid(P, L, E, I);
        break;
      case 'cantilever-udl':
        delta = DEFLECTION_FORMULAS.cantileverUDL(w, L, E, I);
        break;
      case 'cantilever-point':
        delta = DEFLECTION_FORMULAS.cantileverPoint(P, L, E, I);
        break;
    }
  }
  const checks = checkDeflection({
    delta,
    span: L,
    limitRatio: n(inp, 'limitRatio'),
    deltaLive: n(inp, 'deltaLive'),
    limitRatioLive: n(inp, 'limitRatioLive'),
  });
  const rows: ReportInputRow[] = [
    { group: 'Loads', label: 'Loading', value: b(inp, 'useManual') ? 'Manual deflection entry' : s(inp, 'loadCase') },
    { group: 'Loads', label: 'Span', value: `${L} mm` },
    { group: 'Results', label: 'Computed deflection δ', value: `${delta.toFixed(2)} mm` },
    { group: 'Criteria', label: 'Limit', value: `span/${n(inp, 'limitRatio')}`, ref: 'Cl. 5.6.1' },
  ];
  const out = {
    checks,
    rows,
    section,
    material,
    diagram: { mode: 'beam' as const, value: delta, unit: 'mm', span: L },
  };
  return { ...out, report: report(ctx, cs, out, 'Serviceability Checks') };
}

const EVALUATORS: Partial<Record<ModuleKey, (cs: DesignCase, ctx: ProjectState) => EvalOutput>> = {
  tension: evaluateTension,
  compression: evaluateCompression,
  flexure: evaluateFlexure,
  combined: evaluateCombined,
  bolts: evaluateBolts,
  welds: evaluateWelds,
  serviceability: evaluateServiceability,
};

export function evaluateCase(cs: DesignCase, ctx: ProjectState): EvalOutput | null {
  const fn = EVALUATORS[cs.module];
  return fn ? fn(cs, ctx) : null;
}
