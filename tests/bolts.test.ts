import { describe, it, expect } from 'vitest';
import { boltCapacities, checkBolted, BOLT_GRADES, holeDia, designBoltGroup } from '../src/engine/bolts';
import { makeMaterial, DEFAULT_GAMMAS } from '../src/engine/materials';

/**
 * Bolted connection validation (Cl. 10.2 / 10.3 / 10.4).
 * M20 Grade 4.6 bolt, 10 mm plate, e = 33 mm, p = 60 mm, single shear
 * through threads.
 */
describe('Bolted connections (Cl. 10.3)', () => {
  const plate = makeMaterial('E250');
  const bolt = BOLT_GRADES.find((b) => b.grade === '4.6')!;
  const geom = {
    d: 20,
    d0: holeDia(20),
    pitch: 60,
    gauge: 60,
    endDistance: 33,
    edgeDistance: 33,
    nBolts: 4,
    nShearPlanes: 1,
    nShearThroughThread: 1,
    thickness: 10,
  };

  it('hole diameter = d + 2 (d ≤ 24)', () => {
    expect(holeDia(20)).toBe(22);
    expect(holeDia(30)).toBe(33);
  });

  it('Vdsb = (fub/√3)(nn·Anb + ns·Asb)/γmb', () => {
    const cap = boltCapacities(geom, bolt, plate, DEFAULT_GAMMAS);
    const Asb = (Math.PI * 20 * 20) / 4;
    const Anb = 0.78 * Asb;
    const Vnsb = (400 / Math.sqrt(3)) * (1 * Anb + 0 * Asb);
    expect(cap.Vdsb).toBeCloseTo(Vnsb / 1.25, -1);
    // ≈ 45.3 kN
    expect(cap.Vdsb / 1000).toBeCloseTo(45.3, 1);
  });

  it('Vdpb = 2.5·kb·d·t·fu/γmb with kb = min(e/3d0, p/3d0 − 0.25, fub/fu, 1)', () => {
    const cap = boltCapacities(geom, bolt, plate, DEFAULT_GAMMAS);
    const kb = Math.min(33 / (3 * 22), 60 / (3 * 22) - 0.25, 400 / 410, 1);
    expect(kb).toBeCloseTo(33 / 66, 3); // 0.5 governs
    expect(cap.kb).toBeCloseTo(0.5, 3);
    expect(cap.Vdpb).toBeCloseTo((2.5 * 0.5 * 20 * 10 * 410) / 1.25, -1);
  });

  it('Tndb = 0.9·fub·Anb/γmb (≤ fyb·Asb/γm0)', () => {
    const cap = boltCapacities(geom, bolt, plate, DEFAULT_GAMMAS);
    const Asb = (Math.PI * 400) / 4;
    const Anb = 0.78 * Asb;
    const t1 = (0.9 * 400 * Anb) / 1.25;
    const t2 = (240 * Asb) / 1.1;
    expect(cap.Tndb).toBeCloseTo(Math.min(t1, t2), -1);
  });

  it('combined shear + tension interaction (Cl. 10.3.6)', () => {
    const res = checkBolted({
      geom,
      bolt,
      plate,
      gammas: DEFAULT_GAMMAS,
      loads: { shear: 30e3, tension: 40e3 },
    });
    const comb = res.checks.find((c) => c.id === 'b-combined')!;
    const vCap = Math.min(res.capacity.Vdsb, res.capacity.Vdpb);
    const rr = (30e3 / vCap) ** 2 + (40e3 / res.capacity.Tndb) ** 2;
    expect(comb.ratio).toBeCloseTo(rr, 4);
  });

  it('HSFG slip resistance (Cl. 10.4.3)', () => {
    const res = checkBolted({
      geom,
      bolt: BOLT_GRADES.find((b) => b.grade === '8.8')!,
      plate,
      gammas: DEFAULT_GAMMAS,
      loads: { shear: 50e3, tension: 0 },
      hsfg: { muF: 0.2, nFrictionSurfaces: 1 },
    });
    const slip = res.checks.find((c) => c.id === 'b-slip')!;
    // Vsf = 0.2 × 1 × 1 × (0.7 × 800 × 314.16) / 1.25 = 28.15 kN
    expect(slip.capacity! * 1000).toBeCloseTo((0.2 * 0.7 * 800 * (Math.PI * 400) / 4) / 1.25, -1);
  });

  it('detailing limits (Cl. 10.2)', () => {
    const res = checkBolted({
      geom: { ...geom, endDistance: 20, pitch: 30 }, // both too small
      bolt,
      plate,
      gammas: DEFAULT_GAMMAS,
      loads: { shear: 10e3, tension: 0 },
      shearedEdge: true,
    });
    const det = res.checks.find((c) => c.id === 'b-detailing')!;
    expect(det.status).toBe('FAIL');
  });

  it('prying T-stub check runs and returns Q ≤ 1', () => {
    const res = checkBolted({
      geom,
      bolt,
      plate,
      gammas: DEFAULT_GAMMAS,
      loads: { shear: 0, tension: 30e3 },
      prying: {
        present: true,
        plateThickness: 10,
        a: 35,
        b: 45,
        tributaryLength: 70,
        plateFu: 410,
      },
    });
    const pr = res.checks.find((c) => c.id === 'b-prying')!;
    expect(pr).toBeDefined();
    expect(pr.steps.length).toBe(3);
  });

  it('bolt group sizing (FR-6.3)', () => {
    const g = designBoltGroup(200e3, 45.3e3);
    expect(g.nBolts).toBe(5); // ceil(200/45.3)
  });
});
