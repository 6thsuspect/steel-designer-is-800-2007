/**
 * Integration smoke tests — UI evaluate layer (module inputs → engine → report).
 * Verifies the display-unit convention end-to-end and that every implemented
 * module produces a complete clause-wise report.
 */
import { describe, it, expect } from 'vitest';
import { evaluateCase, evaluateTension, evaluateFlexure, evaluateBolts } from '../src/modules/evaluate';
import { newProject, defaultCase, MODULES, ModuleKey } from '../src/state/store';

const IMPL: ModuleKey[] = ['tension', 'compression', 'flexure', 'combined', 'bolts', 'welds', 'serviceability'];

describe('UI evaluate layer', () => {
  const ctx = newProject();

  it('every implemented module evaluates to checks + a complete report', () => {
    for (const key of IMPL) {
      const cs = defaultCase(key, 1);
      const out = evaluateCase(cs, ctx)!;
      expect(out, key).toBeTruthy();
      expect(out.checks.length, key).toBeGreaterThan(0);
      expect(out.report.summary.length, key).toBe(out.checks.length);
      expect(out.report.inputs.length, key).toBeGreaterThan(0);
      expect(out.report.overallStatus, key).toMatch(/PASS|WARN|FAIL/);
      // display units: plate/beam capacities must be kN / kN·m scale, not raw N
      for (const c of out.checks) {
        if (c.unit === 'kN' && c.capacity) expect(Math.abs(c.capacity), `${key}/${c.id}`).toBeLessThan(1e6);
        if (c.unit === 'kN·m' && c.capacity) expect(Math.abs(c.capacity), `${key}/${c.id}`).toBeLessThan(1e5);
      }
    }
  });

  it('planned modules map to no evaluator (honest Phase roadmap)', () => {
    const planned = MODULES.filter((m) => !m.implemented);
    expect(planned.length).toBe(15);
    for (const m of planned) {
      expect(evaluateCase(defaultCase(m.key, 1), ctx)).toBeNull();
    }
  });

  it('tension plate 100×10 E250 — Tdg = Ag·fy/γm0 = 227.27 kN', () => {
    const cs = defaultCase('tension', 1, {
      kind: 'custom',
      name: 'PL 100×10',
      custom: { shape: 'Plate', B: 100, thickness: 10 },
    }, { grade: 'E250', band: 't<=20' });
    cs.input = { ...cs.input, T_kN: 150, useHoles: true, nHoles: 2, holeDia: 18, plateWidth: 100, plateThickness: 10 };
    const out = evaluateTension(cs, ctx);
    const y = out.checks.find((c) => c.id === 't-yield')!;
    expect(y.capacity).toBeCloseTo(227.27, 1);
    expect(y.unit).toBe('kN');
    // net rupture: An = (100 − 2×18)×10 = 640 mm² → 0.9×640×410/1.25 = 188.93 kN
    const n = out.checks.find((c) => c.id === 't-rupture')!;
    expect(n.capacity).toBeCloseTo(188.93, 1);
  });

  it('flexure ISMB 300 classifies Plastic and reports the class as an INFO check', () => {
    const cs = defaultCase('flexure', 1, { kind: 'catalog', name: 'ISMB 300' }, { grade: 'E250', band: 't<=20' });
    cs.input = { ...cs.input, Mz_kNm: 100, V_kN: 50, laterallySupported: true, useDeflection: false };
    const out = evaluateFlexure(cs, ctx);
    expect(out.classification).toBe('Plastic');
    const cls = out.checks.find((c) => c.id === 'f-class')!;
    expect(cls.status).toBe('INFO');
    // Md = Zp·fy/γm0 — ISMB 300 Zp ≈ 818 cm³ → ≈ 186 kN·m (allow band)
    const b = out.checks.find((c) => c.id.startsWith('f-') && c.id !== 'f-class' && c.unit === 'kN·m');
    expect(b!.capacity).toBeGreaterThan(150);
    expect(b!.capacity).toBeLessThan(220);
  });

  it('bolt case wires HSFG slip capacities and bolt-group sizing', () => {
    const cs = defaultCase('bolts', 1);
    cs.input = { ...cs.input, boltGrade: '8.8', d: 20, hsfg: true, muF: 0.2, nFriction: 1, totalLoad_kN: 200 };
    const out = evaluateBolts(cs, ctx);
    const grp = out.checks.find((c) => c.id === 'b-group')!;
    // slip ≈ 28.15 kN/bolt (engine-verified at μf = 0.2) → 200/28.15 → 8 bolts
    expect(grp.capacity).toBe(8);
    expect(out.report.overallStatus).toMatch(/PASS|WARN|FAIL/);
  });
});
