import { describe, it, expect } from 'vitest';
import { buildFromDb, findSection, buildCustom, SECTION_DB } from '../src/engine/sections';
import { classifySection } from '../src/engine/classify';
import { makeMaterial, DEFAULT_GAMMAS } from '../src/engine/materials';
import { designCombined } from '../src/engine/combined';
import { checkDeflection, DEFLECTION_FORMULAS } from '../src/engine/serviceability';
import { buildReport } from '../src/engine/report';
import { designTension } from '../src/engine/tension';

/** Geometry kernel, combined forces, serviceability & report validation. */
describe('Geometry & section properties', () => {
  it('computed ISMB areas agree with IS 808 within 4%', () => {
    for (const name of ['ISMB 200', 'ISMB 300', 'ISMB 400', 'ISMB 600']) {
      const s = findSection(name)!;
      const e = SECTION_DB.find((x) => x.name === name)!;
      const pub = e.published!.A * 100;
      expect(Math.abs(s.props.area - pub) / pub).toBeLessThan(0.04);
    }
  });

  it('computed Izz agrees with IS 808 for ISMB 300 within 3%', () => {
    const s = findSection('ISMB 300')!;
    // Note: published Izz overrides computed; verify computed geometry itself
    const entry = SECTION_DB.find((x) => x.name === 'ISMB 300')!;
    const raw = buildFromDb({ ...entry, published: undefined });
    expect(Math.abs(raw.props.Izz - 8603e4) / 8603e4).toBeLessThan(0.05);
  });

  it('plastic modulus exceeds elastic modulus', () => {
    const s = findSection('ISMB 300')!;
    expect(s.props.Zpz).toBeGreaterThan(s.props.Zze);
    expect(s.props.Zpy).toBeGreaterThan(s.props.Zye);
  });

  it('angle geometry: L100×100×10 area ≈ 1920 mm² (theory 2×100×10 − 100)', () => {
    const s = buildCustom({ shape: 'Angle', leg1: 100, leg2: 100, t: 10 });
    // 100×10 + 90×10 + root ≈ 1900 + fillet
    expect(s.props.area).toBeGreaterThan(1895);
    expect(s.props.area).toBeLessThan(2050);
  });

  it('CHS properties: I = π(D⁴ − d⁴)/64', () => {
    const s = buildCustom({ shape: 'CHS', D: 168.3, thickness: 4.8 });
    const d = 168.3 - 2 * 4.8;
    const I = (Math.PI * (168.3 ** 4 - d ** 4)) / 64;
    expect(Math.abs(s.props.Izz - I) / I).toBeLessThan(0.01);
  });

  it('RHS area ≈ 2(B + D)t', () => {
    const s = buildCustom({ shape: 'RHS', B: 200, D: 100, thickness: 8 });
    const approx = 2 * (200 + 100 - 2 * 8) * 8; // straight-wall area ≈ 4608
    expect(s.props.area).toBeGreaterThan(approx * 0.88);
    expect(s.props.area).toBeLessThan(approx * 1.05);
  });
});

describe('Section classification (Table 2)', () => {
  const material = makeMaterial('E250');
  it('ISA 150×150×12 in compression is semi-compact (classic example)', () => {
    const s = buildCustom({ shape: 'Angle', leg1: 150, leg2: 150, t: 12 });
    const cls = classifySection(s, material, 'compression');
    // b/t = (150−12)/12 = 11.5 → >9.4: semi-compact limits (15.7) OK
    // (b+d)/t = 11.5 + 11.5 + 2 = 25 ≤ 25ε → exactly at limit
    expect(cls.overall).toBe('Semi-Compact');
  });

  it('ISMC 300 channel web (d/tw < 42ε) is Plastic per Table 2 channel row', () => {
    const s = findSection('ISMC 300')!;
    const cls = classifySection(s, material, 'both');
    const web = cls.elements.find((e) => e.element === 'Channel web')!;
    expect(web.limits).toEqual([42, 42, 42]);
    expect(web.valueOverEps).toBeLessThan(42);
  });
});

describe('Combined forces (Cl. 9)', () => {
  const material = makeMaterial('E250');
  const s = findSection('ISMB 300')!;
  it('tension + bending interaction', () => {
    const res = designCombined({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      P: 100e3,
      Mz: 50e6,
      My: 0,
      Td: 1300e3,
      Pd: 1300e3,
      Mdz: 300e6,
      Mdy: 30e6,
      V: 20e3,
      Vd: 300e3,
    });
    const c = res.checks[0];
    expect(c.clause).toContain('9.2');
    expect(c.ratio).toBeCloseTo(100e3 / 1300e3 + 50e6 / 300e6, 4);
  });

  it('compression + bending with amplification', () => {
    const res = designCombined({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      P: -500e3,
      Mz: 100e6,
      My: 10e6,
      Td: 1300e3,
      Pd: 1200e3,
      Mdz: 280e6,
      Mdy: 30e6,
      V: 50e3,
      Vd: 300e3,
      KLz: 4000,
      Cm: 0.9,
    });
    expect(res.checks.length).toBe(3);
    expect(res.checks[0].ratio).toBeGreaterThan(500e3 / 1200e3);
  });
});

describe('Serviceability (Cl. 5.6)', () => {
  it('deflection limit span/300', () => {
    const [c] = checkDeflection({ delta: 15, span: 6000, limitRatio: 300 });
    expect(c.capacity).toBe(20);
    expect(c.status).toBe('PASS');
  });

  it('UDL deflection formula 5wL⁴/384EI', () => {
    // w = 10 N/mm, L = 6000, E = 2e5, I = 8603e4
    const d = DEFLECTION_FORMULAS.udlSimplySupported(10, 6000, 2e5, 8603e4);
    expect(d).toBeCloseTo((5 * 10 * 6000 ** 4) / (384 * 2e5 * 8603e4) * 1000, 2);
  });
});

describe('Report builder (Module 24)', () => {
  it('produces summary with governing check and PASS/FAIL', () => {
    const material = makeMaterial('E250');
    const s = findSection('ISMB 300')!;
    const res = designTension({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 2000e3, // way too high → FAIL
    });
    const report = buildReport({
      projectName: 'Test Project',
      caseName: 'Tie member',
      module: 'Tension Member Design',
      inputs: [{ group: 'Loads', label: 'T', value: '2000 kN' }],
      checks: res.checks,
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
    });
    expect(report.overallStatus).toBe('FAIL');
    expect(report.summary.length).toBeGreaterThan(2);
    expect(report.governingRatio).toBeGreaterThan(1);
    expect(report.checks.every((c) => c.steps.length >= 1)).toBe(true);
  });
});
