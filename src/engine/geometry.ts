/**
 * Geometry kernel: polygon construction for standard rolled / welded shapes and
 * exact polygon-based section property evaluation.
 *
 * The same polygons feed the SVG visualiser (Module UI) and the property
 * calculator, guaranteeing that drawings and numbers always agree.
 *
 * All coordinates in mm: z = major (strong) axis (horizontal), y = minor axis
 * (vertical) — matching IS 800/SP:6 conventions where z-z is the major axis of
 * an I-section. For SVG the y-axis is flipped at render time.
 */
import { Polygon, SectionProperties } from './types';

/* ------------------------------------------------------------------ */
/* Polygon builders                                                    */
/* ------------------------------------------------------------------ */

export function rect(cz: number, cy: number, w: number, h: number): Polygon {
  const z0 = cz - w / 2;
  const y0 = cy - h / 2;
  return [
    { x: z0, y: y0 },
    { x: z0 + w, y: y0 },
    { x: z0 + w, y: y0 + h },
    { x: z0, y: y0 + h },
  ];
}

/** Concave-out quarter disc "fillet" fill at an inner corner (rolled root radius). */
function filletArc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segs = 8
): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Full ring as [outer, reversed inner] polygon pair (negative-area inner). */
export function annulus(cz: number, cy: number, rOuter: number, rInner: number, segs = 64): Polygon[] {
  const outer: Polygon = [];
  const inner: Polygon = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    outer.push({ x: cz + rOuter * Math.cos(a), y: cy + rOuter * Math.sin(a) });
  }
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    inner.push({ x: cz + rInner * Math.cos(a), y: cy + rInner * Math.sin(a) });
  }
  inner.reverse(); // hole
  return [outer, inner];
}

/** Hollow rectangle with rounded outside corners (RHS/SHS). */
export function hollowRect(oz: number, oy: number, b: number, h: number, t: number, ro: number): Polygon[] {
  const ri = Math.max(ro - t, 0.01);
  const outer: Polygon = [];
  const inner: Polygon = [];
  const corners = [
    { cz: oz + b / 2 - ro, cy: oy + h / 2 - ro, a0: 0, a1: Math.PI / 2 },
    { cz: oz - b / 2 + ro, cy: oy + h / 2 - ro, a0: Math.PI / 2, a1: Math.PI },
    { cz: oz - b / 2 + ro, cy: oy - h / 2 + ro, a0: Math.PI, a1: (3 * Math.PI) / 2 },
    { cz: oz + b / 2 - ro, cy: oy - h / 2 + ro, a0: (3 * Math.PI) / 2, a1: 2 * Math.PI },
  ];
  for (const c of corners) outer.push(...filletArc(c.cz, c.cy, ro, c.a0, c.a1, 16));
  const icorners = [
    { cz: oz + b / 2 - ro, cy: oy + h / 2 - ro, a0: 0, a1: Math.PI / 2 },
    { cz: oz - b / 2 + ro, cy: oy + h / 2 - ro, a0: Math.PI / 2, a1: Math.PI },
    { cz: oz - b / 2 + ro, cy: oy - h / 2 + ro, a0: Math.PI, a1: (3 * Math.PI) / 2 },
    { cz: oz + b / 2 - ro, cy: oy - h / 2 + ro, a0: (3 * Math.PI) / 2, a1: 2 * Math.PI },
  ];
  for (const c of icorners) inner.push(...filletArc(c.cz, c.cy, ri, c.a0, c.a1, 16));
  inner.reverse();
  return [outer, inner];
}

/**
 * Rolled (or welded) I / H section outline about (0,0) mid-height.
 * z = major axis along flanges, y = vertical (height h).
 * Root radius r (0 for welded with fillet welds ignored).
 */
export function iSection(h: number, b: number, tw: number, tf: number, r = 0, welded = false): Polygon[] {
  const polys: Polygon[] = [];
  const yTop = h / 2;
  const yBot = -h / 2;
  // Flanges as plain rects (root fillets added separately)
  polys.push(rect(0, yTop - tf / 2, b, tf));
  polys.push(rect(0, yBot + tf / 2, b, tf));
  polys.push(rect(0, 0, tw, h - 2 * tf));
  if (r > 0 && !welded) {
    // Four root fillets (material added in the re-entrant corners)
    const yg = yTop - tf; // flange underside
    const zg = tw / 2 + r;
    // top-right: tangent to flange underside at (zg, yg), to web at (tw/2, yg - r)
    polys.push([{ x: zg, y: yg }, ...filletArc(zg, yg - r, r, Math.PI / 2, Math.PI), { x: tw / 2, y: yg - r }]);
    // top-left (mirror)
    polys.push([{ x: -zg, y: yg }, ...filletArc(-zg, yg - r, r, 0, Math.PI / 2), { x: -tw / 2, y: yg - r }].reverse());
    // bottom-right
    const ygb = yBot + tf;
    polys.push([{ x: zg, y: ygb }, ...filletArc(zg, ygb + r, r, Math.PI, (3 * Math.PI) / 2), { x: tw / 2, y: ygb + r }]);
    // bottom-left
    polys.push([{ x: -zg, y: ygb }, ...filletArc(-zg, ygb + r, r, (3 * Math.PI) / 2, 2 * Math.PI), { x: -tw / 2, y: ygb + r }].reverse());
  }
  return polys;
}

/** Rolled channel (flanges to the +z side), centred on gross rect. */
export function channelSection(h: number, b: number, tw: number, tf: number, r = 0): Polygon[] {
  const polys: Polygon[] = [];
  const yTop = h / 2;
  const yBot = -h / 2;
  // Web on the left: x from -b/2 to -b/2+tw... Standard: web vertical at back
  const xBack = -b / 2;
  polys.push(rect(xBack + tw / 2, 0, tw, h));
  polys.push(rect(xBack + b / 2 + xBack / 2 + b / 2 - b / 2, yTop - tf / 2, b - tw, tf)); // top flange (from web to tip)
  // fix: flange from web face to toe
  polys.pop();
  polys.push(rect(xBack + tw + (b - tw) / 2, yTop - tf / 2, b - tw, tf));
  polys.push(rect(xBack + tw + (b - tw) / 2, yBot + tf / 2, b - tw, tf));
  if (r > 0) {
    const zg = xBack + tw + r;
    const yg = yTop - tf;
    polys.push([...filletArc(zg, yg - r, r, 0, Math.PI / 2), { x: zg, y: yg }, { x: xBack + tw, y: yg - r }]);
    const ygb = yBot + tf;
    polys.push([...filletArc(zg, ygb + r, r, (3 * Math.PI) / 2, 2 * Math.PI), { x: zg, y: ygb }, { x: xBack + tw, y: ygb + r }]);
  }
  return polys;
}

/** Angle (L) section: leg1 along z (bottom), leg2 vertical on the left. */
export function angleSection(leg1: number, leg2: number, t: number, r = 0): Polygon[] {
  // Orientation: horizontal leg bottom, vertical leg at left (back-to-back ready).
  const polys: Polygon[] = [];
  const z0 = -leg1 / 2 + 0; // centre-ish; will be re-centred by props anyway
  // Horizontal leg: z from -leg1/2 to +leg1/2? Use L-shape with corner at origin-ish.
  // Place outer corner at (-leg1 / 2 + ...): simpler: corner at (0,0):
  // horizontal leg: x∈[0, leg1], y∈[0,t]; vertical leg: x∈[0,t], y∈[0,leg2]
  const hz = -leg1 / 2; // shift later via centroid anyway
  polys.push(rect(leg1 / 2, t / 2, leg1, t));
  polys.push(rect(t / 2, leg2 / 2, t, leg2 - t));
  if (r > 0) {
    // root radius filling the re-entrant corner at (t, t) — quarter disc of area r²(1 − π/4)
    const pts = [
      { x: t, y: t },
      { x: t, y: t + r },
      ...filletArc(t + r, t + r, r, Math.PI, (3 * Math.PI) / 2, 10).slice(1),
    ];
    polys.push(pts.reverse());
  }
  void hz;
  return polys;
}

/** Tee (flange + stem), h = total depth. */
export function teeSection(h: number, b: number, tw: number, tf: number, r = 0): Polygon[] {
  const polys: Polygon[] = [];
  polys.push(rect(0, h / 2 - tf / 2, b, tf));
  polys.push(rect(0, -h / 2 + (h - tf) / 2, tw, h - tf));
  if (r > 0) {
    const yg = h / 2 - tf;
    const zg = tw / 2 + r;
    polys.push([{ x: zg, y: yg }, ...filletArc(zg, yg - r, r, Math.PI / 2, Math.PI), { x: tw / 2, y: yg - r }]);
    polys.push([{ x: -zg, y: yg }, ...filletArc(-zg, yg - r, r, 0, Math.PI / 2), { x: -tw / 2, y: yg - r }].reverse());
  }
  return polys;
}

/** Mirror a polygon set about the y-axis (z → −z) and shift along z. */
export function mirrorZ(polys: Polygon[]): Polygon[] {
  return polys.map((p) => p.map((pt) => ({ x: -pt.x, y: pt.y })));
}

export function shift(polys: Polygon[], dz: number, dy: number): Polygon[] {
  return polys.map((p) => p.map((pt) => ({ x: pt.x + dz, y: pt.y + dy })));
}

/* ------------------------------------------------------------------ */
/* Property evaluation                                                 */
/* ------------------------------------------------------------------ */

interface PolyMoments {
  A: number;
  Sz: number; // first moment about z-axis (∫y dA) — used for centroid y
  Sy: number; // first moment about y-axis (∫z dA)
  Izz: number; // ∫y² dA
  Iyy: number; // ∫z² dA
  Izy: number;
  zMin: number;
  zMax: number;
  yMin: number;
  yMax: number;
}

function polyMoments(poly: Polygon): PolyMoments {
  let A = 0,
    Sz = 0,
    Sy = 0,
    Izz = 0,
    Iyy = 0,
    Izy = 0;
  let zMin = Infinity,
    zMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const cr = p.x * q.y - q.x * p.y;
    A += cr;
    Sz += (p.y + q.y) * cr;
    Sy += (p.x + q.x) * cr;
    Izz += (p.y * p.y + p.y * q.y + q.y * q.y) * cr;
    Iyy += (p.x * p.x + p.x * q.x + q.x * q.x) * cr;
    Izy += (p.x * q.y + 2 * p.x * p.y + 2 * q.x * q.y + q.x * p.y) * cr;
    zMin = Math.min(zMin, p.x);
    zMax = Math.max(zMax, p.x);
    yMin = Math.min(yMin, p.y);
    yMax = Math.max(yMax, p.y);
  }
  A /= 2;
  Sz /= 6;
  Sy /= 6;
  Izz /= 12;
  Iyy /= 12;
  Izy /= 24;
  return { A, Sz, Sy, Izz, Iyy, Izy, zMin, zMax, yMin, yMax };
}

/**
 * Plastic modulus about the z-z (major) axis: equal-area axis distance ȳ,
 * Zp = Σ Ai·(ȳi,top + ȳi,bot) over the split parts. Computed numerically by
 * bisection on the equal-area axis, using per-polygon slice areas.
 */
function plasticModulusZ(polys: Polygon[], cy: number): number {
  // Slices: for each polygon compute area above/below a horizontal line y = c
  const areaAbove = (c: number) => polys.reduce((s, p) => s + signedSliceArea(p, c, true), 0);
  const total = polys.reduce((s, p) => s + Math.abs(polyMoments(p).A), 0) * 0 + Math.abs(polys.reduce((s, p) => s + polyMoments(p).A, 0));
  let lo = Math.min(...polys.map((p) => polyMoments(p).yMin));
  let hi = Math.max(...polys.map((p) => polyMoments(p).yMax));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (areaAbove(mid) > total / 2) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  // First moments of area above and below about y = c
  const mAbove = polys.reduce((s, p) => s + signedSliceFirstMoment(p, c, true), 0);
  const mBelow = polys.reduce((s, p) => s + signedSliceFirstMoment(p, c, false), 0);
  void cy;
  return (mAbove + mBelow) / 1; // both moments are |∫(y−c) dA| on their side
}

function signedSliceArea(poly: Polygon, c: number, above: boolean): number {
  // Clipping a polygon to y ≥ c (or y ≤ c) and returning signed area.
  const clip = clipPolygon(poly, c, above);
  return Math.abs(polyMoments(clip).A);
}

function signedSliceFirstMoment(poly: Polygon, c: number, above: boolean): number {
  const clip = clipPolygon(poly, c, above);
  const m = polyMoments(clip);
  // ∫|y − c| dA over the clip = |Sz − c·A| (all y−c same sign)
  return Math.abs(m.Sz - c * m.A);
}

function clipPolygon(poly: Polygon, c: number, above: boolean): Polygon {
  const out: Polygon = [];
  const inside = (p: { x: number; y: number }) => (above ? p.y >= c : p.y <= c);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const pin = inside(p);
    const qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (c - p.y) / (q.y - p.y || 1e-12);
      out.push({ x: p.x + t * (q.x - p.x), y: c });
    }
  }
  return out.length >= 3 ? out : [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
}

/** Plastic modulus about y-y (minor axis) — same approach on the z direction. */
function plasticModulusY(polys: Polygon[]): number {
  const areaRight = (c: number) => polys.reduce((s, p) => s + clipAreaZ(p, c, true), 0);
  const total = Math.abs(polys.reduce((s, p) => s + polyMoments(p).A, 0));
  let lo = Math.min(...polys.map((p) => polyMoments(p).zMin));
  let hi = Math.max(...polys.map((p) => polyMoments(p).zMax));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (areaRight(mid) > total / 2) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  let mR = 0;
  let mL = 0;
  for (const p of polys) {
    mR += clipFirstMomentZ(p, c, true);
    mL += clipFirstMomentZ(p, c, false);
  }
  return mR + mL;
}

function clipAreaZ(poly: Polygon, c: number, right: boolean): number {
  return Math.abs(polyMoments(clipPolygonZ(poly, c, right)).A);
}

function clipFirstMomentZ(poly: Polygon, c: number, right: boolean): number {
  const m = polyMoments(clipPolygonZ(poly, c, right));
  return Math.abs(m.Sy - c * m.A);
}

function clipPolygonZ(poly: Polygon, c: number, right: boolean): Polygon {
  const out: Polygon = [];
  const inside = (p: { x: number; y: number }) => (right ? p.x >= c : p.x <= c);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const pin = inside(p);
    const qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (c - p.x) / (q.x - p.x || 1e-12);
      out.push({ x: c, y: p.y + t * (q.y - p.y) });
    }
  }
  return out.length >= 3 ? out : [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
}

/**
 * St. Venant torsion constant approximation: for thin-walled open sections
 * J ≈ Σ b·t³/3 (per rectangle), for closed hollows J ≈ 4A_m²t/∮(ds/t).
 * We use a shape-aware approximation computed from the bounding elements:
 * caller passes the approximated J when a closed-form is known; otherwise the
 * generic open-section sum is used by `torsionFromThickness()`.
 */
export function torsionOpenRects(parts: Array<{ b: number; t: number }>): number {
  return parts.reduce((s, p) => s + (p.b * Math.pow(p.t, 3)) / 3, 0);
}

/** Warping constant for doubly-symmetric I-section: Cw ≈ Iyy·h²/4 (mm6). */
export function warpingI(Iyy: number, h: number): number {
  return (Iyy * h * h) / 4;
}

/**
 * Compute full section properties from polygons (holes as reversed-winding
 * polygons producing negative area).
 */
export function computeProperties(polys: Polygon[], jApprox?: number, cwApprox?: number): SectionProperties {
  let A = 0,
    Sz = 0,
    Sy = 0;
  let zMin = Infinity,
    zMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity;
  const ms = polys.map(polyMoments);
  for (const m of ms) {
    A += m.A;
    Sz += m.Sz;
    Sy += m.Sy;
    zMin = Math.min(zMin, m.zMin);
    zMax = Math.max(zMax, m.zMax);
    yMin = Math.min(yMin, m.yMin);
    yMax = Math.max(yMax, m.yMax);
  }
  const cy = Sz / A;
  const cz = Sy / A;
  // Second moments about centroid
  let Izz = 0,
    Iyy = 0;
  for (const m of ms) {
    Izz += m.Izz - m.A * (m.Sz / m.A) ** 2 + m.A * (m.Sz / m.A - cy) ** 2;
    Iyy += m.Iyy - m.A * (m.Sy / m.A) ** 2 + m.A * (m.Sy / m.A - cz) ** 2;
  }
  const height = yMax - yMin;
  const width = zMax - zMin;
  const Zze = Izz / Math.max(cy - yMin, yMax - cy);
  const Zye = Iyy / Math.max(cz - zMin, zMax - cz);
  const Zpz = plasticModulusZ(polys, cy);
  const Zpy = plasticModulusY(polys);
  return {
    area: A,
    cy,
    cz,
    Izz,
    Iyy,
    rz: Math.sqrt(Izz / A),
    ry: Math.sqrt(Iyy / A),
    Zze,
    Zye,
    Zpz,
    Zpy,
    J: jApprox ?? 0,
    Cw: cwApprox ?? 0,
    height,
    width,
  };
}
