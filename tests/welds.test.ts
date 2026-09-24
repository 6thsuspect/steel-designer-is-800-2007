import { describe, it, expect } from 'vitest';
import { designWeld, designFilletWeldSize, effectiveThroat, weldGroupAnalysis } from '../src/engine/welds';
import { makeMaterial, DEFAULT_GAMMAS } from '../src/engine/materials';

/** Welded connection validation (Cl. 10.5). */
describe('Welded connections (Cl. 10.5)', () => {
  const material = makeMaterial('E250');

  it('effective throat te = 0.7s (fillet)', () => {
    expect(effectiveThroat(6, 'fillet')).toBeCloseTo(4.2, 6);
    expect(effectiveThroat(10, 'butt-full')).toBe(10);
  });

  it('Fwd = te·fu/(√3·γmw); 6 mm fillet, E410 electrode, shop weld', () => {
    const res = designWeld({
      material,
      gammas: DEFAULT_GAMMAS,
      weldFu: 410,
      weldType: 'fillet',
      size: 6,
      length: 300,
      position: 'shop',
      normalForce: 0,
      shearAlongWeld: 200e3,
      shearAcrossWeld: 0,
      partThickness: 10,
    });
    // Fwd = 4.2 × (410/√3/1.25) = 4.2 × 189.3 = 795.1 N/mm → ×300 = 238.5 kN
    expect(res.Fwd).toBeCloseTo((0.7 * 6 * 410) / (Math.sqrt(3) * 1.25), 0);
    expect(res.checks[0].capacity! * 1000).toBeCloseTo(res.Fwd * 300, -2);
  });

  it('field weld uses γmw = 1.5', () => {
    const shop = designWeld({
      material, gammas: DEFAULT_GAMMAS, weldFu: 410, weldType: 'fillet',
      size: 6, length: 100, position: 'shop',
      normalForce: 10e3, shearAlongWeld: 0, shearAcrossWeld: 0, partThickness: 10,
    });
    const field = designWeld({
      material, gammas: DEFAULT_GAMMAS, weldFu: 410, weldType: 'fillet',
      size: 6, length: 100, position: 'field',
      normalForce: 10e3, shearAlongWeld: 0, shearAcrossWeld: 0, partThickness: 10,
    });
    expect(field.Fwd).toBeLessThan(shop.Fwd);
    expect(field.Fwd / shop.Fwd).toBeCloseTo(1.25 / 1.5, 3);
  });

  it('min/max weld size (Cl. 10.5.2)', () => {
    const res = designWeld({
      material, gammas: DEFAULT_GAMMAS, weldFu: 410, weldType: 'fillet',
      size: 2, length: 100, position: 'shop', // too small for t = 12
      normalForce: 5e3, shearAlongWeld: 0, shearAcrossWeld: 0, partThickness: 12,
    });
    expect(res.checks.find((c) => c.id === 'w-size')!.status).toBe('FAIL');
  });

  it('combined stresses (Cl. 10.5.9): √(σ⊥² + 3(τ⊥² + τ∥²)) ≤ fu/γmw', () => {
    const res = designWeld({
      material, gammas: DEFAULT_GAMMAS, weldFu: 410, weldType: 'fillet',
      size: 5, length: 200, position: 'shop',
      normalForce: 0, shearAlongWeld: 0, shearAcrossWeld: 0, partThickness: 10,
      stresses: { sigmaPerp: 50, tauPerp: 30, tauParallel: 80 },
    });
    const comb = res.checks.find((c) => c.id === 'w-combined')!;
    const eq = Math.sqrt(50 ** 2 + 3 * (30 ** 2 + 80 ** 2));
    expect(comb.demand).toBeCloseTo(eq, 3);
    expect(comb.capacity).toBeCloseTo(410 / 1.25, 2);
  });

  it('weld group eccentric analysis returns max force/length', () => {
    const res = weldGroupAnalysis(
      {
        segments: [
          // vertical weld 200 mm long
          { x1: 50, y1: -100, x2: 50, y2: 100 },
          // vertical weld on the other side
          { x1: -50, y1: -100, x2: -50, y2: 100 },
        ],
        force: { Vx: 100e3, Vy: 0, N: 0, M: 20e6 },
      },
      material,
      1.25,
      410,
      0.7,
      6
    );
    expect(res.ratio).toBeGreaterThan(0);
    expect(res.steps.length).toBe(2);
  });

  it('designFilletWeldSize picks s within limits', () => {
    const { size } = designFilletWeldSize(200e3, 300, 410, DEFAULT_GAMMAS, 'shop', 12);
    expect(size).toBeGreaterThanOrEqual(3);
    expect(size).toBeLessThanOrEqual(10.5);
  });
});
