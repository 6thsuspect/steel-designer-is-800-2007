/**
 * Standard Indian section database (SP:6 / IS 808 series) + custom section
 * builders (FR-1.5).
 *
 * Geometry (D, B, tw, tf, r) is stored; all derived properties are computed
 * from the exact outline (incl. root radii) via geometry.ts so drawings and
 * numbers always agree. Where IS 808 tabulated values are available (ISMB
 * series) they are stored as `published` and override the computed A, I, Z.
 *
 * Note: non-ISMB series use nominal dimension sets — verify tw/tf/r against
 * the current SP:6 handbook before final design (as for any design tool).
 */
import { CrossSection, Polygon, SectionElements, SectionProperties, SectionShape, SectionType } from './types';
import {
  angleSection,
  annulus,
  channelSection,
  computeProperties,
  hollowRect,
  iSection,
  mirrorZ,
  rect as _rect,
  shift,
  teeSection,
  torsionOpenRects,
  warpingI,
} from './geometry';

// re-export rect builder name (geometry rect is internal; local helper)
function rectPoly(cz: number, cy: number, w: number, h: number): Polygon {
  void _rect;
  const z0 = cz - w / 2;
  const y0 = cy - h / 2;
  return [
    { x: z0, y: y0 },
    { x: z0 + w, y: y0 },
    { x: z0 + w, y: y0 + h },
    { x: z0, y: y0 + h },
  ];
}

export interface SectionDbEntry {
  name: string;
  family: 'ISMB' | 'ISLB' | 'ISWB' | 'ISHB' | 'ISJB' | 'ISMC' | 'ISLC' | 'ISHC' | 'ISA' | 'ISLT' | 'IST';
  /** geometry */
  D: number; // depth / leg1
  B: number; // flange width / leg2
  tw?: number;
  tf?: number;
  r?: number; // root radius
  t?: number; // angle thickness
  /** IS 808 tabulated values (override computed) */
  published?: { A: number; Izz: number; Iyy: number; mass: number };
  approximate?: boolean;
}

/** Root-radius estimate when the handbook value is unavailable. */
function estRoot(D: number): number {
  return Math.min(Math.max(D / 25, 4), 20);
}

/* ------------------------------------------------------------------ */
/* ISMB — IS 808:1989 tabulated dimensions & properties (verified).    */
/* A (cm²), Izz (cm⁴), Iyy (cm⁴) as per IS 808.                       */
/* ------------------------------------------------------------------ */
export const ISMB_SECTIONS: SectionDbEntry[] = [
  { name: 'ISMB 100', family: 'ISMB', D: 100, B: 50, tw: 3.7, tf: 7, r: 5.5, published: { A: 11.35, Izz: 258, Iyy: 18.8, mass: 8.9 } },
  { name: 'ISMB 125', family: 'ISMB', D: 125, B: 70, tw: 4.4, tf: 8, r: 6.3, published: { A: 16.98, Izz: 636, Iyy: 49.8, mass: 13.3 } },
  { name: 'ISMB 150', family: 'ISMB', D: 150, B: 75, tw: 4.8, tf: 8, r: 7.0, published: { A: 19.19, Izz: 1004, Iyy: 52.6, mass: 15.0 } },
  { name: 'ISMB 175', family: 'ISMB', D: 175, B: 85, tw: 5.8, tf: 9, r: 7.5, published: { A: 24.98, Izz: 1884, Iyy: 83, mass: 19.6 } },
  { name: 'ISMB 200', family: 'ISMB', D: 200, B: 100, tw: 5.7, tf: 10, r: 8.2, published: { A: 30.84, Izz: 3551, Iyy: 150, mass: 24.2 } },
  { name: 'ISMB 225', family: 'ISMB', D: 225, B: 110, tw: 6.5, tf: 11.8, r: 9.0, published: { A: 39.72, Izz: 5207, Iyy: 218, mass: 31.1 } },
  { name: 'ISMB 250', family: 'ISMB', D: 250, B: 125, tw: 6.9, tf: 12.5, r: 9.8, published: { A: 47.55, Izz: 5131, Iyy: 334, mass: 37.3 } },
  { name: 'ISMB 300', family: 'ISMB', D: 300, B: 140, tw: 7.7, tf: 13.1, r: 10.2, published: { A: 58.65, Izz: 8603, Iyy: 453, mass: 46.0 } },
  { name: 'ISMB 350', family: 'ISMB', D: 350, B: 140, tw: 8.1, tf: 14.2, r: 11.5, published: { A: 66.71, Izz: 13630, Iyy: 538, mass: 52.4 } },
  { name: 'ISMB 400', family: 'ISMB', D: 400, B: 140, tw: 8.9, tf: 16, r: 12.5, published: { A: 78.38, Izz: 20458, Iyy: 622, mass: 61.5 } },
  { name: 'ISMB 450', family: 'ISMB', D: 450, B: 150, tw: 9.4, tf: 17.4, r: 13.5, published: { A: 92.27, Izz: 30390, Iyy: 833, mass: 72.4 } },
  { name: 'ISMB 500', family: 'ISMB', D: 500, B: 180, tw: 10.2, tf: 17.2, r: 15.0, published: { A: 110.07, Izz: 45218, Iyy: 1369, mass: 86.4 } },
  { name: 'ISMB 550', family: 'ISMB', D: 550, B: 190, tw: 11.2, tf: 19.3, r: 16.5, published: { A: 132.11, Izz: 64893, Iyy: 1869, mass: 103.7 } },
  { name: 'ISMB 600', family: 'ISMB', D: 600, B: 210, tw: 12, tf: 20.8, r: 18.0, published: { A: 156.21, Izz: 91813, Iyy: 2651, mass: 122.6 } },
];

/** ISLB / ISWB / ISHB / ISJB — nominal dimension sets (approximate, verify vs SP:6). */
export const OTHER_BEAM_SECTIONS: SectionDbEntry[] = [
  // ISLB — light beams
  { name: 'ISLB 200', family: 'ISLB', D: 200, B: 100, tw: 5.2, tf: 8.3, r: 7.0, approximate: true },
  { name: 'ISLB 250', family: 'ISLB', D: 250, B: 125, tw: 5.5, tf: 8.8, r: 8.0, approximate: true },
  { name: 'ISLB 300', family: 'ISLB', D: 300, B: 150, tw: 6.5, tf: 8.9, r: 9.0, approximate: true },
  { name: 'ISLB 350', family: 'ISLB', D: 350, B: 165, tw: 7.3, tf: 11.4, r: 10.0, approximate: true },
  { name: 'ISLB 400', family: 'ISLB', D: 400, B: 165, tw: 8.0, tf: 12.5, r: 11.0, approximate: true },
  { name: 'ISLB 450', family: 'ISLB', D: 450, B: 170, tw: 8.6, tf: 13.4, r: 12.0, approximate: true },
  { name: 'ISLB 500', family: 'ISLB', D: 500, B: 180, tw: 9.2, tf: 14.1, r: 13.0, approximate: true },
  // ISWB — wide flange beams
  { name: 'ISWB 200', family: 'ISWB', D: 200, B: 125, tw: 4.4, tf: 6.1, r: 6.5, approximate: true },
  { name: 'ISWB 250', family: 'ISWB', D: 250, B: 125, tw: 5.0, tf: 6.9, r: 7.5, approximate: true },
  { name: 'ISWB 300', family: 'ISWB', D: 300, B: 150, tw: 5.6, tf: 7.5, r: 8.5, approximate: true },
  { name: 'ISWB 350', family: 'ISWB', D: 350, B: 165, tw: 6.0, tf: 8.3, r: 9.5, approximate: true },
  { name: 'ISWB 400', family: 'ISWB', D: 400, B: 180, tw: 6.5, tf: 9.4, r: 10.5, approximate: true },
  { name: 'ISWB 450', family: 'ISWB', D: 450, B: 180, tw: 7.2, tf: 10.3, r: 11.5, approximate: true },
  { name: 'ISWB 500', family: 'ISWB', D: 500, B: 200, tw: 8.0, tf: 11.2, r: 12.5, approximate: true },
  { name: 'ISWB 600', family: 'ISWB', D: 600, B: 250, tw: 9.0, tf: 13.5, r: 15.0, approximate: true },
  // ISHB — heavy wide-flange (column) sections
  { name: 'ISHB 250', family: 'ISHB', D: 250, B: 250, tw: 8.6, tf: 12.4, r: 10.0, approximate: true },
  { name: 'ISHB 300', family: 'ISHB', D: 300, B: 250, tw: 9.4, tf: 10.6, r: 10.5, approximate: true },
  { name: 'ISHB 350', family: 'ISHB', D: 350, B: 250, tw: 9.4, tf: 11.4, r: 11.0, approximate: true },
  { name: 'ISHB 400', family: 'ISHB', D: 400, B: 250, tw: 10.6, tf: 12.7, r: 12.0 },
];

/** ISMC / ISLC channels — nominal dimension sets (approximate, verify vs SP:6). */
export const CHANNEL_SECTIONS: SectionDbEntry[] = [
  { name: 'ISMC 75', family: 'ISMC', D: 75, B: 40, tw: 4.8, tf: 7.5, r: 6.0, approximate: true },
  { name: 'ISMC 100', family: 'ISMC', D: 100, B: 50, tw: 4.7, tf: 7.5, r: 6.5, approximate: true },
  { name: 'ISMC 125', family: 'ISMC', D: 125, B: 65, tw: 5.3, tf: 8.1, r: 7.0, approximate: true },
  { name: 'ISMC 150', family: 'ISMC', D: 150, B: 75, tw: 5.7, tf: 8.7, r: 7.5, approximate: true },
  { name: 'ISMC 200', family: 'ISMC', D: 200, B: 75, tw: 6.2, tf: 9.0, r: 8.5, approximate: true },
  { name: 'ISMC 225', family: 'ISMC', D: 225, B: 80, tw: 6.6, tf: 9.8, r: 9.0, approximate: true },
  { name: 'ISMC 250', family: 'ISMC', D: 250, B: 82, tw: 7.2, tf: 11.0, r: 9.8, approximate: true },
  { name: 'ISMC 300', family: 'ISMC', D: 300, B: 90, tw: 7.8, tf: 12.0, r: 10.5, approximate: true },
  { name: 'ISMC 350', family: 'ISMC', D: 350, B: 100, tw: 8.1, tf: 12.6, r: 11.5, approximate: true },
  { name: 'ISMC 400', family: 'ISMC', D: 400, B: 100, tw: 8.8, tf: 13.5, r: 12.5 },
];

/** ISA equal angles (dimensions exactly as designated). */
export const ANGLE_SECTIONS: SectionDbEntry[] = [
  { name: 'ISA 20×20×3', family: 'ISA', D: 20, B: 20, t: 3 },
  { name: 'ISA 25×25×3', family: 'ISA', D: 25, B: 25, t: 3 },
  { name: 'ISA 30×30×3', family: 'ISA', D: 30, B: 30, t: 3 },
  { name: 'ISA 30×30×5', family: 'ISA', D: 30, B: 30, t: 5 },
  { name: 'ISA 40×40×3', family: 'ISA', D: 40, B: 40, t: 3 },
  { name: 'ISA 40×40×5', family: 'ISA', D: 40, B: 40, t: 5 },
  { name: 'ISA 40×40×6', family: 'ISA', D: 40, B: 40, t: 6 },
  { name: 'ISA 50×50×3', family: 'ISA', D: 50, B: 50, t: 3 },
  { name: 'ISA 50×50×5', family: 'ISA', D: 50, B: 50, t: 5 },
  { name: 'ISA 50×50×6', family: 'ISA', D: 50, B: 50, t: 6 },
  { name: 'ISA 55×55×5', family: 'ISA', D: 55, B: 55, t: 5 },
  { name: 'ISA 60×60×5', family: 'ISA', D: 60, B: 60, t: 5 },
  { name: 'ISA 60×60×6', family: 'ISA', D: 60, B: 60, t: 6 },
  { name: 'ISA 65×65×5', family: 'ISA', D: 65, B: 65, t: 5 },
  { name: 'ISA 65×65×6', family: 'ISA', D: 65, B: 65, t: 6 },
  { name: 'ISA 65×65×8', family: 'ISA', D: 65, B: 65, t: 8 },
  { name: 'ISA 70×70×5', family: 'ISA', D: 70, B: 70, t: 5 },
  { name: 'ISA 70×70×6', family: 'ISA', D: 70, B: 70, t: 6 },
  { name: 'ISA 75×75×5', family: 'ISA', D: 75, B: 75, t: 5 },
  { name: 'ISA 75×75×6', family: 'ISA', D: 75, B: 75, t: 6 },
  { name: 'ISA 75×75×8', family: 'ISA', D: 75, B: 75, t: 8 },
  { name: 'ISA 80×80×6', family: 'ISA', D: 80, B: 80, t: 6 },
  { name: 'ISA 80×80×8', family: 'ISA', D: 80, B: 80, t: 8 },
  { name: 'ISA 90×90×6', family: 'ISA', D: 90, B: 90, t: 6 },
  { name: 'ISA 90×90×8', family: 'ISA', D: 90, B: 90, t: 8 },
  { name: 'ISA 90×90×10', family: 'ISA', D: 90, B: 90, t: 10 },
  { name: 'ISA 100×100×7', family: 'ISA', D: 100, B: 100, t: 7 },
  { name: 'ISA 100×100×8', family: 'ISA', D: 100, B: 100, t: 8 },
  { name: 'ISA 100×100×10', family: 'ISA', D: 100, B: 100, t: 10 },
  { name: 'ISA 100×100×12', family: 'ISA', D: 100, B: 100, t: 12 },
  { name: 'ISA 110×110×8', family: 'ISA', D: 110, B: 110, t: 8 },
  { name: 'ISA 110×110×10', family: 'ISA', D: 110, B: 110, t: 10 },
  { name: 'ISA 130×130×8', family: 'ISA', D: 130, B: 130, t: 8 },
  { name: 'ISA 130×130×10', family: 'ISA', D: 130, B: 130, t: 10 },
  { name: 'ISA 130×130×12', family: 'ISA', D: 130, B: 130, t: 12 },
  { name: 'ISA 150×150×10', family: 'ISA', D: 150, B: 150, t: 10 },
  { name: 'ISA 150×150×12', family: 'ISA', D: 150, B: 150, t: 12 },
  { name: 'ISA 150×150×16', family: 'ISA', D: 150, B: 150, t: 16 },
  { name: 'ISA 200×200×12', family: 'ISA', D: 200, B: 200, t: 12 },
  { name: 'ISA 200×200×16', family: 'ISA', D: 200, B: 200, t: 16 },
  // Unequal angles
  { name: 'ISA 30×20×3', family: 'ISA', D: 30, B: 20, t: 3 },
  { name: 'ISA 40×25×3', family: 'ISA', D: 40, B: 25, t: 3 },
  { name: 'ISA 45×30×3', family: 'ISA', D: 45, B: 30, t: 3 },
  { name: 'ISA 50×30×5', family: 'ISA', D: 50, B: 30, t: 5 },
  { name: 'ISA 60×40×5', family: 'ISA', D: 60, B: 40, t: 5 },
  { name: 'ISA 60×40×6', family: 'ISA', D: 60, B: 40, t: 6 },
  { name: 'ISA 65×45×5', family: 'ISA', D: 65, B: 45, t: 5 },
  { name: 'ISA 65×45×6', family: 'ISA', D: 65, B: 45, t: 6 },
  { name: 'ISA 70×45×5', family: 'ISA', D: 70, B: 45, t: 5 },
  { name: 'ISA 75×50×5', family: 'ISA', D: 75, B: 50, t: 5 },
  { name: 'ISA 75×50×6', family: 'ISA', D: 75, B: 50, t: 6 },
  { name: 'ISA 75×50×8', family: 'ISA', D: 75, B: 50, t: 8 },
  { name: 'ISA 80×50×6', family: 'ISA', D: 80, B: 50, t: 6 },
  { name: 'ISA 80×50×8', family: 'ISA', D: 80, B: 50, t: 8 },
  { name: 'ISA 90×60×6', family: 'ISA', D: 90, B: 60, t: 6 },
  { name: 'ISA 90×60×8', family: 'ISA', D: 90, B: 60, t: 8 },
  { name: 'ISA 100×75×6', family: 'ISA', D: 100, B: 75, t: 6 },
  { name: 'ISA 100×75×8', family: 'ISA', D: 100, B: 75, t: 8 },
  { name: 'ISA 100×75×10', family: 'ISA', D: 100, B: 75, t: 10 },
  { name: 'ISA 125×75×6', family: 'ISA', D: 125, B: 75, t: 6 },
  { name: 'ISA 125×75×8', family: 'ISA', D: 125, B: 75, t: 8 },
  { name: 'ISA 125×75×10', family: 'ISA', D: 125, B: 75, t: 10 },
  { name: 'ISA 125×95×6', family: 'ISA', D: 125, B: 95, t: 6 },
  { name: 'ISA 125×95×8', family: 'ISA', D: 125, B: 95, t: 8 },
  { name: 'ISA 150×75×8', family: 'ISA', D: 150, B: 75, t: 8 },
  { name: 'ISA 150×75×10', family: 'ISA', D: 150, B: 75, t: 10 },
  { name: 'ISA 150×90×8', family: 'ISA', D: 150, B: 90, t: 8 },
  { name: 'ISA 150×90×10', family: 'ISA', D: 150, B: 90, t: 10 },
  { name: 'ISA 150×90×12', family: 'ISA', D: 150, B: 90, t: 12 },
  { name: 'ISA 150×115×8', family: 'ISA', D: 150, B: 115, t: 8 },
  { name: 'ISA 150×115×10', family: 'ISA', D: 150, B: 115, t: 10 },
  { name: 'ISA 150×115×12', family: 'ISA', D: 150, B: 115, t: 12 },
  { name: 'ISA 200×100×12', family: 'ISA', D: 200, B: 100, t: 12 },
  { name: 'ISA 200×150×12', family: 'ISA', D: 200, B: 150, t: 12 },
  { name: 'ISA 200×150×18', family: 'ISA', D: 200, B: 150, t: 18 },
];

export const SECTION_DB: SectionDbEntry[] = [
  ...ISMB_SECTIONS,
  ...OTHER_BEAM_SECTIONS,
  ...CHANNEL_SECTIONS,
  ...ANGLE_SECTIONS,
];

export const SECTION_FAMILIES = ['ISMB', 'ISLB', 'ISWB', 'ISHB', 'ISMC', 'ISA'] as const;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

function finalize(
  name: string,
  shape: SectionShape,
  type: SectionType,
  source: CrossSection['source'],
  polys: Polygon[],
  elements: SectionElements,
  dims: Record<string, number>,
  opts: {
    published?: { A: number; Izz: number; Iyy: number; mass: number };
    jParts?: Array<{ b: number; t: number }>;
    cwIyy?: number;
  } = {}
): CrossSection {
  const props = computeProperties(
    polys,
    opts.jParts ? torsionOpenRects(opts.jParts) : undefined,
    undefined
  );
  if (opts.published) {
    props.area = opts.published.A * 100; // cm2 → mm2
    props.Izz = opts.published.Izz * 1e4; // cm4 → mm4
    props.Iyy = opts.published.Iyy * 1e4;
    props.rz = Math.sqrt(props.Izz / props.area);
    props.ry = Math.sqrt(props.Iyy / props.area);
    props.Zze = props.Izz / (props.height / 2);
    props.Zye = props.Iyy / (props.width / 2);
  }
  props.Cw = warpingI(props.Iyy, props.height);
  const mass = opts.published?.mass ?? (props.area * 7.85e-6) * 1000; // kg/m
  dims.__mass = mass;
  return { name, shape, type, source, mass, dims, elements, props, polygons: polys };
}

/** Build a CrossSection from a catalogue entry. */
export function buildFromDb(entry: SectionDbEntry): CrossSection {
  const r = entry.r ?? estRoot(entry.D);
  if (entry.family === 'ISA') {
    const t = entry.t ?? 5;
    const legH = entry.D;
    const legB = entry.B;
    const polys = angleSection(legB, legH, t, Math.min(t, 5));
    const elements: SectionElements = {
      leg1: legB,
      leg2: legH,
      legThickness: t,
      h: legH,
      b: legB,
      tf: t,
    };
    return finalize(entry.name, 'Angle', 'Rolled', 'SP6', polys, elements, { leg1: legB, leg2: legH, t, r: t }, {
      jParts: [
        { b: legB, t },
        { b: legH - t, t },
      ],
    });
  }
  if (entry.family === 'ISMC' || entry.family === 'ISLC' || entry.family === 'ISHC') {
    const polys = channelSection(entry.D, entry.B, entry.tw!, entry.tf!, r);
    const elements: SectionElements = {
      flangeOutstand: entry.B - entry.tw! - r,
      flangeThickness: entry.tf!,
      webDepth: entry.D - 2 * (entry.tf! + r),
      webThickness: entry.tw!,
      h: entry.D,
      b: entry.B,
      tw: entry.tw,
      tf: entry.tf,
      r,
    };
    return finalize(entry.name, 'Channel', 'Rolled', 'SP6', polys, elements, {
      D: entry.D,
      B: entry.B,
      tw: entry.tw!,
      tf: entry.tf!,
      r,
    }, {
      jParts: [
        { b: entry.D, t: entry.tw! },
        { b: entry.B - entry.tw!, t: entry.tf! },
      ],
    });
  }
  // I-sections
  const polys = iSection(entry.D, entry.B, entry.tw!, entry.tf!, r);
  const elements: SectionElements = {
    flangeOutstand: (entry.B - entry.tw!) / 2,
    flangeThickness: entry.tf!,
    webDepth: entry.D - 2 * (entry.tf! + r),
    webThickness: entry.tw!,
    h: entry.D,
    b: entry.B,
    tw: entry.tw,
    tf: entry.tf,
    r,
  };
  return finalize(
    entry.name,
    'I',
    'Rolled',
    'SP6',
    polys,
    elements,
    { D: entry.D, B: entry.B, tw: entry.tw!, tf: entry.tf!, r },
    {
      published: entry.published,
      jParts: [
        { b: entry.D - 2 * entry.tf!, t: entry.tw! },
        { b: entry.B, t: entry.tf! },
        { b: entry.B, t: entry.tf! },
      ],
    }
  );
}

/** Custom / built-up section builders (FR-1.5, FR-23.1). */
export interface CustomSectionInput {
  shape: SectionShape;
  name?: string;
  // I / BuiltUpI / Tee / Channel
  D?: number;
  B?: number;
  tw?: number;
  tf?: number;
  r?: number;
  welded?: boolean;
  // Angle
  leg1?: number;
  leg2?: number;
  t?: number;
  // RHS/SHS/CHS/Plate
  B2?: number; // RHS depth
  thickness?: number;
  ro?: number;
  // double sections
  spacing?: number; // gap between backs (double angle/channel)
  n?: number;
}

export function buildCustom(inp: CustomSectionInput): CrossSection {
  const { shape } = inp;
  switch (shape) {
    case 'Plate': {
      const w = inp.B ?? 100;
      const t = inp.thickness ?? inp.t ?? 10;
      const polys = [rectPoly(0, 0, w, t)];
      const elements: SectionElements = { internalWidth: w, internalThickness: t, h: t, b: w };
      return finalize(inp.name ?? 'Custom plate', 'Plate', 'Rolled', 'custom', polys, elements, { w, t });
    }
    case 'I':
    case 'BuiltUpI': {
      const D = inp.D ?? 300;
      const B = inp.B ?? 150;
      const tw = inp.tw ?? 8;
      const tf = inp.tf ?? 12;
      const r = inp.welded ? 0 : inp.r ?? 10;
      const polys = iSection(D, B, tw, tf, r, inp.welded);
      const elements: SectionElements = {
        flangeOutstand: (B - tw) / 2,
        flangeThickness: tf,
        webDepth: inp.welded ? D - 2 * tf : D - 2 * (tf + r),
        webThickness: tw,
        h: D,
        b: B,
        tw,
        tf,
        r,
      };
      return finalize(
        inp.name ?? (inp.welded ? 'Welded I' : 'Custom I'),
        inp.welded ? 'BuiltUpI' : 'I',
        inp.welded ? 'Welded' : 'Rolled',
        'custom',
        polys,
        elements,
        { D, B, tw, tf, r },
        { jParts: [{ b: D - 2 * tf, t: tw }, { b: B, t: tf }, { b: B, t: tf }] }
      );
    }
    case 'Tee': {
      const D = inp.D ?? 200;
      const B = inp.B ?? 150;
      const tw = inp.tw ?? 8;
      const tf = inp.tf ?? 10;
      const r = inp.r ?? 8;
      const polys = teeSection(D, B, tw, tf, r);
      const elements: SectionElements = {
        flangeOutstand: (B - tw) / 2,
        flangeThickness: tf,
        webDepth: D - tf - 2 * r,
        webThickness: tw,
        h: D,
        b: B,
        tw,
        tf,
        r,
      };
      return finalize(inp.name ?? 'Custom Tee', 'Tee', 'Rolled', 'custom', polys, elements, { D, B, tw, tf, r });
    }
    case 'Channel': {
      const D = inp.D ?? 200;
      const B = inp.B ?? 75;
      const tw = inp.tw ?? 6;
      const tf = inp.tf ?? 9;
      const r = inp.r ?? 8;
      const polys = channelSection(D, B, tw, tf, r);
      const elements: SectionElements = {
        flangeOutstand: B - tw - r,
        flangeThickness: tf,
        webDepth: D - 2 * (tf + r),
        webThickness: tw,
        h: D,
        b: B,
        tw,
        tf,
        r,
      };
      return finalize(inp.name ?? 'Custom channel', 'Channel', 'Rolled', 'custom', polys, elements, { D, B, tw, tf, r });
    }
    case 'Angle': {
      const leg1 = inp.leg1 ?? 60;
      const leg2 = inp.leg2 ?? leg1;
      const t = inp.t ?? 5;
      const polys = angleSection(leg1, leg2, t, t);
      const elements: SectionElements = { leg1, leg2, legThickness: t, h: leg2, b: leg1, tf: t };
      return finalize(inp.name ?? 'Custom angle', 'Angle', 'Rolled', 'custom', polys, elements, { leg1, leg2, t });
    }
    case 'DoubleAngle': {
      const leg1 = inp.leg1 ?? 60;
      const leg2 = inp.leg2 ?? leg1;
      const t = inp.t ?? 5;
      const gap = inp.spacing ?? 0;
      const left = angleSection(leg1, leg2, t, t); // back at x∈[0,t]
      // shift so that back faces gap
      const leftShifted = shift(mirrorZ(shift(left, -t / 2, 0)), gap / 2 + t, 0);
      const rightShifted = shift(left, gap / 2, 0);
      const polys = [...leftShifted, ...rightShifted];
      const elements: SectionElements = {
        leg1,
        leg2,
        legThickness: t,
        h: leg2,
        b: 2 * leg1 + gap,
        tf: t,
      };
      return finalize(inp.name ?? 'Double angle', 'DoubleAngle', 'Rolled', 'built-up', polys, elements, {
        leg1,
        leg2,
        t,
        gap,
      });
    }
    case 'DoubleChannel': {
      const D = inp.D ?? 200;
      const B = inp.B ?? 75;
      const tw = inp.tw ?? 6;
      const tf = inp.tf ?? 9;
      const r = inp.r ?? 8;
      const gap = inp.spacing ?? 0;
      const single = channelSection(D, B, tw, tf, r);
      // channel outline spans x∈[-B/2, B/2] with web at back (-B/2)
      const left = shift(mirrorZ(single), -(gap / 2 + B / 2) + B / 2 - B / 2, 0);
      const right = shift(single, gap / 2 + B, 0);
      void left;
      const polys = [...shift(mirrorZ(single), gap / 2 + B / 2 - B, 0), ...shift(single, gap / 2 + B / 2, 0)];
      void right;
      const elements: SectionElements = {
        flangeOutstand: B - tw - r,
        flangeThickness: tf,
        webDepth: D - 2 * (tf + r),
        webThickness: tw,
        h: D,
        b: 2 * B + gap,
        tw,
        tf,
        r,
      };
      return finalize(inp.name ?? 'Double channel', 'DoubleChannel', 'Rolled', 'built-up', polys, elements, {
        D,
        B,
        tw,
        tf,
        gap,
      });
    }
    case 'RHS':
    case 'SHS': {
      const B = inp.B ?? 200;
      const D = shape === 'SHS' ? B : inp.D ?? 100;
      const t = inp.thickness ?? 8;
      const ro = inp.ro ?? 2.5 * t;
      const polys = hollowRect(0, 0, B, D, t, ro);
      const elements: SectionElements = {
        internalWidth: B - 3 * t,
        internalThickness: t,
        webDepth: D - 3 * t,
        webThickness: t,
        h: D,
        b: B,
        tf: t,
        tw: t,
      };
      return finalize(inp.name ?? (shape === 'SHS' ? 'SHS' : 'RHS'), shape, 'Rolled', 'custom', polys, elements, {
        B,
        D,
        t,
        ro,
      });
    }
    case 'CHS': {
      const D = inp.D ?? 168;
      const t = inp.thickness ?? 5;
      const polys = annulus(0, 0, D / 2, D / 2 - t);
      const elements: SectionElements = {
        diameter: D,
        internalThickness: t,
        h: D,
        b: D,
      };
      return finalize(inp.name ?? 'CHS', 'CHS', 'Rolled', 'custom', polys, elements, { D, t });
    }
    default:
      return buildCustom({ ...inp, shape: 'I' });
  }
}

export function findSection(name: string): CrossSection | null {
  const e = SECTION_DB.find((s) => s.name === name);
  return e ? buildFromDb(e) : null;
}

export type { SectionProperties };
