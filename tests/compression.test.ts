import { describe, it, expect } from 'vitest';
import { designCompressiveStress, bucklingClass, IMPERFECTION } from '../src/engine/buckling';
import { designCompression } from '../src/engine/compression';
import { makeMaterial, DEFAULT_GAMMAS, epsilon } from '../src/engine/materials';
import { buildFromDb, buildCustom, findSection } from '../src/engine/sections';

/**
 * Validation against a published worked example:
 * ISHB 400 column (A = 10466 mm², rz = 166.1, ry = 51.6), L = 3.5 m,
 * both ends restrained (K = 0.65), fy = 250.
 * λy = 0.65 × 3500 / 51.6 = 44.09; buckling class y-y = 'b';
 * fcd ≈ 200 MPa (Table 9(b) interpolation) → Perry formula check below.
 */
describe('Compression member design (Cl. 7)', () => {
  const material = makeMaterial('E250');

  it('Perry–Robertson fcd matches Table 9(b) value at λ = 44.09 (class b)', () => {
    const s = designCompressiveStress(44.09, material, 'b', 1.1);
    // Worked example: fcd = 200 MPa (from Table 9(b))
    expect(s.fcd).toBeGreaterThan(195);
    expect(s.fcd).toBeLessThan(206);
  });

  it('χ = 1.0 at very low slenderness', () => {
    const s = designCompressiveStress(10, material, 'b', 1.1);
    expect(s.chi).toBeCloseTo(1.0, 3);
    expect(s.fcd).toBeCloseTo(250 / 1.1, 1);
  });

  it('imperfection factors (Table 7)', () => {
    expect(IMPERFECTION.a).toBe(0.21);
    expect(IMPERFECTION.b).toBe(0.34);
    expect(IMPERFECTION.c).toBe(0.49);
    expect(IMPERFECTION.d).toBe(0.76);
  });

  it('buckling classes (Table 10) — ISMB 400 (h/b = 2.86 > 1.2, tf = 16 ≤ 40)', () => {
    const s = findSection('ISMB 400')!;
    expect(bucklingClass(s, 'zz')).toBe('a');
    expect(bucklingClass(s, 'yy')).toBe('b');
  });

  it('buckling class — welded I tf ≤ 40: b (z-z), c (y-y)', () => {
    const s = buildCustom({ shape: 'BuiltUpI', welded: true, D: 500, B: 250, tw: 10, tf: 20 });
    expect(bucklingClass(s, 'zz')).toBe('b');
    expect(bucklingClass(s, 'yy')).toBe('c');
  });

  it('buckling class — channel / angle / solid: c; hot-rolled hollow: a', () => {
    const ch = buildCustom({ shape: 'Channel', D: 200, B: 75, tw: 6, tf: 9 });
    expect(bucklingClass(ch, 'zz')).toBe('c');
    expect(bucklingClass(ch, 'yy')).toBe('c');
    const ang = buildCustom({ shape: 'Angle', leg1: 60, leg2: 60, t: 5 });
    expect(bucklingClass(ang, 'zz')).toBe('c');
    const chs = buildCustom({ shape: 'CHS', D: 168, thickness: 5 });
    expect(bucklingClass(chs, 'zz')).toBe('a');
  });

  it('ISHB 400 example: Pd governed by y-y', () => {
    const s = findSection('ISHB 400')!;
    // cross-check computed radii against published example (rz 166.1, ry 51.6)
    expect(s.props.rz).toBeGreaterThan(150);
    expect(s.props.ry).toBeGreaterThan(45);
    const res = designCompression({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      P: 1_500_000, // 1500 kN
      Lz: 0.65 * 3500,
      Ly: 0.65 * 3500,
    });
    expect(res.governingAxis).toBe('yy');
    // Pd ≈ A·fcd ≈ 10466 × 200 ≈ 2090 kN (using computed A)
    expect(res.Pd / 1000).toBeGreaterThan(1800);
    expect(res.Pd / 1000).toBeLessThan(2300);
  });

  it('slenderness limit 180 for compression (Cl. 3.8)', () => {
    const s = findSection('ISMB 200')!;
    const res = designCompression({
      section: s,
      material,
      gammas: DEFAULT_GAMMAS,
      P: 100_000,
      Lz: 6000,
      Ly: 6000,
    });
    const sl = res.checks.find((c) => c.id === 'c-slenderness')!;
    expect(sl.ratio).toBeGreaterThan(1); // 6000/22 ≈ 272 > 180
    expect(sl.status).toBe('FAIL');
  });

  it('ε = √(250/fy)', () => {
    expect(epsilon(250)).toBeCloseTo(1.0, 6);
    expect(epsilon(350)).toBeCloseTo(Math.sqrt(250 / 350), 6);
  });

  it('buildFromDb gives published ISMB 300 properties', () => {
    const s = findSection('ISMB 300')!;
    expect(s.props.area).toBeCloseTo(5865, -1); // 58.65 cm²
    expect(s.props.Izz).toBeCloseTo(8603e4, -3); // 8603 cm⁴
    expect(s.mass).toBeCloseTo(46.0, 1);
  });
});
