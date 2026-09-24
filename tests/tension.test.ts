import { describe, it, expect } from 'vitest';
import { designTension } from '../src/engine/tension';
import { makeMaterial, DEFAULT_GAMMAS } from '../src/engine/materials';
import { buildCustom } from '../src/engine/sections';

/**
 * Hand-calculation validation — tension member (IS 800:2007 Cl. 6).
 * Plate 100 × 10 mm, E250 (fy = 250, fu = 410), two 18 mm bolt holes in chain.
 */
describe('Tension member design (Cl. 6)', () => {
  const material = makeMaterial('E250');
  const plate = buildCustom({ shape: 'Plate', B: 100, thickness: 10 });

  it('computes gross area of plate', () => {
    expect(plate.props.area).toBeCloseTo(1000, 0);
  });

  it('Tdg = Ag·fy/γm0 = 1000 × 250 / 1.1 = 227.27 kN', () => {
    const res = designTension({
      section: plate,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 150_000,
    });
    const yieldCheck = res.checks.find((c) => c.id === 't-yield')!;
    expect(yieldCheck.capacity! * 1000).toBeCloseTo((1000 * 250) / 1.1, -1);
  });

  it('Tdn = 0.9·An·fu/γm1 = 0.9 × 640 × 410 / 1.25 = 188.93 kN', () => {
    const An = (100 - 2 * 18) * 10; // 640 mm2
    const res = designTension({
      section: plate,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 150_000,
      netArea: An,
    });
    const rupture = res.checks.find((c) => c.id === 't-rupture')!;
    expect(rupture.capacity! * 1000).toBeCloseTo((0.9 * 640 * 410) / 1.25, -1);
  });

  it('block shear: Tdb = min of two modes (Cl. 6.4.1)', () => {
    // Shear along 2 lines of 4×50 pitch: Avg = 2×200×10 = 4000; Avn = 2×(200−3.5×18)×10
    const Avg = 2 * 200 * 10;
    const Avn = 2 * (200 - 3.5 * 18) * 10;
    const Atg = 60 * 10;
    const Atn = (60 - 0.5 * 18) * 10;
    const res = designTension({
      section: plate,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 150_000,
      netArea: 640,
      blockShear: { Avg, Avn, Atg, Atn },
    });
    const block = res.checks.find((c) => c.id === 't-block')!;
    const mode1 = (Avg * 250) / (Math.sqrt(3) * 1.1) + (0.9 * Atn * 410) / 1.25;
    const mode2 = (0.9 * Avn * 410) / (Math.sqrt(3) * 1.25) + (Atg * 250) / 1.1;
    expect(block.capacity! * 1000).toBeCloseTo(Math.min(mode1, mode2), -1);
  });

  it('governing strength is the minimum of the limit states', () => {
    const res = designTension({
      section: plate,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 100_000,
      netArea: 640,
    });
    // Tdg = 227.3, Tdn = 188.9 → rupture governs
    expect(res.Tdg / 1000).toBeCloseTo(188.93, 0);
    expect(res.governing).toContain('Rupture');
  });

  it('lug angle rules (Cl. 10.12) — 20%/40% over-strength for angles', () => {
    const res = designTension({
      section: plate,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 100_000,
      netArea: 640,
      lugAngle: {
        present: true,
        lugArea: 800,
        memberType: 'angle',
        forceOutstandingLeg: 40_000,
        fastenerCapToGusset: 50_000, // ≥ 1.2 × 40 = 48 kN OK
        fastenerCapToMember: 50_000, // < 1.4 × 40 = 56 kN → FAIL
        nBoltsLugToGusset: 2,
        wholeAreaEffective: true,
      },
    });
    const lug = res.checks.find((c) => c.id === 't-lug')!;
    expect(lug.status).toBe('FAIL'); // lug→member capacity insufficient
  });

  it('slenderness limit 400 (no stress reversal)', () => {
    const res = designTension({
      section: plate,
      material,
      gammas: DEFAULT_GAMMAS,
      T: 50_000,
      netArea: 640,
      slenderness: { lambda: 250, limit: 400 },
    });
    expect(res.checks.find((c) => c.id === 't-slenderness')!.status).toBe('PASS');
  });
});
