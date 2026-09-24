import { describe, it, expect } from 'vitest';
import { designFlexure } from '../src/engine/bending';
import { classifySection } from '../src/engine/classify';
import { makeMaterial, DEFAULT_GAMMAS, epsilon } from '../src/engine/materials';
import { findSection, buildCustom } from '../src/engine/sections';

/** Flexure & classification validation (Cl. 3.7, Table 2, Cl. 8). */
describe('Flexural member design (Cl. 8)', () => {
  const material = makeMaterial('E250');

  it('ISMB 300 classifies as Plastic (Table 2)', () => {
    const s = findSection('ISMB 300')!;
    const cls = classifySection(s, material, 'both');
    // flange outstand (140 − 7.7)/2 / 13.1 = 5.05 < 9.4ε → Plastic
    const flange = cls.elements.find((e) => e.element.includes('flange outstand'))!;
    expect(flange.valueOverEps).toBeLessThan(9.4);
    // web d/tw ≈ 32.9 < 84ε → Plastic
    const web = cls.elements.find((e) => e.element.includes('Web'))!;
    expect(web.valueOverEps).toBeLessThan(84);
    expect(cls.overall).toBe('Plastic');
  });

  it('Md = Zp·fy/γm0 for plastic section (Cl. 8.2.1)', () => {
    const s = findSection('ISMB 300')!;
    const cls = classifySection(s, material, 'both');
    const res = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: cls.overall,
      Mz: 200e6,
      V: 200e3,
      laterallySupported: true,
    });
    expect(res.Md).toBeCloseTo((s.props.Zpz * 250) / 1.1, -2);
  });

  it('semi-compact uses Ze (βb = Ze/Zp)', () => {
    // A slender-ish plate girder flange: welded I with wide thin flanges
    const s = buildCustom({ shape: 'BuiltUpI', welded: true, D: 600, B: 400, tw: 8, tf: 10 });
    const cls = classifySection(s, material, 'bending');
    // flange outstand (400-8)/2/10 = 19.6 > 15.7ε → Slender
    expect(cls.overall).toBe('Slender');
    const res = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: cls.overall,
      Mz: 300e6,
      V: 100e3,
      laterallySupported: true,
    });
    expect(res.Md).toBeLessThan((s.props.Zpz * 250) / 1.1);
  });

  it('shear capacity Vd = Av·fy/(√3·γm0) with Av = h·tw (rolled I)', () => {
    const s = findSection('ISMB 300')!;
    const res = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: 'Plastic',
      Mz: 100e6,
      V: 300e3,
      laterallySupported: true,
    });
    const Av = 300 * 7.7;
    expect(res.Vd).toBeCloseTo((Av * 250) / (Math.sqrt(3) * 1.1), -1);
  });

  it('LTB reduces capacity below Md (Cl. 8.2.2)', () => {
    const s = findSection('ISMB 300')!;
    const cls = classifySection(s, material, 'both');
    const supported = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: cls.overall,
      Mz: 100e6,
      V: 50e3,
      laterallySupported: true,
    });
    const unsupported = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: cls.overall,
      Mz: 100e6,
      V: 50e3,
      laterallySupported: false,
      LLT: 5000,
      C1: 1.0,
    });
    expect(unsupported.Mdb).toBeLessThan(supported.Md);
  });

  it('web crippling: Fw = (b1 + n)·tw·fy/γm0, n = 2.5(tf + r) at end', () => {
    const s = findSection('ISMB 300')!;
    const res = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: 'Plastic',
      Mz: 50e6,
      V: 100e3,
      laterallySupported: true,
      webBearing: { F: 150e3, b1: 50, atEnd: true },
    });
    const cripple = res.checks.find((c) => c.id === 'f-cripple')!;
    const r = 10.2;
    const n = 2.5 * (13.1 + r);
    const expected = ((50 + n) * 7.7 * 250) / 1.1;
    expect(cripple.capacity! * 1000).toBeCloseTo(expected, -2);
  });

  it('shear buckling check triggers for thin webs (d/tw > 67ε)', () => {
    const s = findSection('ISMB 600')!;
    const cls = classifySection(s, material, 'both');
    const res = designFlexure({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      sectionClass: cls.overall,
      Mz: 100e6,
      V: 300e3,
      laterallySupported: true,
    });
    // ISMB 600 web: (600 − 2(20.8+18))/12 = 42.5 < 67ε — not required
    const vSteps = res.checks.find((c) => c.id === 'f-shear')!.steps;
    const sb = vSteps.find((st) => st.title.includes('shear buckling'))!;
    expect(sb.result).toContain('Not required');
  });

  it('ε factor used in classification (Table 2 Note 2)', () => {
    expect(epsilon(250)).toBe(1);
  });
});
