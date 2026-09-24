/**
 * Section classification — IS 800:2007 Cl. 3.7 & Table 2
 * (Maximum width-to-thickness ratios of plate elements).
 *
 * Limits (×ε, ε = √(250/fy)):
 *  - Outstanding element of compression flange (rolled)  b/tf :  9.4 | 10.5 | 15.7
 *  - Outstanding element of compression flange (welded)  b/tf :  9.4 | 10.5 | 13.6
 *  - Internal element of compression flange (bending)    b/t  : 28.4 | 33.5 | 42.0
 *  - Web of I/H/box, NA at mid-depth                     d/tw :   84 |  105 |  126
 *  - Web of a channel                                    d/tw :   42 |   42 |   42
 *  - Angle in bending (both criteria)                    b/t  :  9.4 | 10.5 | 15.7
 *  - Single/separated angles in axial compression        b/t, d/t, (b+d)/t ≤ 15.7/15.7/25 (semi-compact)
 *  - CHS (moment or axial compression)                   D/t  :  44ε² | 55ε² | 88ε²
 *  - Stem of a T (rolled / cut from I or H)              d/tf :  8.4 |  9.4 | 18.9
 *  - Webs: shear buckling check required when d/tw > 67ε (Note 3 / Cl. 8.4.2)
 */
import { CrossSection, SectionClass, Material, CalcStep } from './types';
import { epsilon } from './materials';

export type StressCase = 'compression' | 'bending' | 'both';

export interface ElementClassification {
  element: string; // e.g. 'Flange outstand'
  ratio: string; // e.g. 'b/tf'
  value: number; // actual b/t in units of ε (value/ε displayed separately)
  valueOverEps: number;
  limits: [number, number, number] | null; // plastic | compact | semi-compact (×ε)
  cls: SectionClass;
  clause: string;
}

export interface ClassificationResult {
  overall: SectionClass;
  elements: ElementClassification[];
  eps: number;
  shearBucklingNeeded: boolean; // d/tw > 67ε (web of I/plate girder)
  steps: CalcStep[];
}

function classFromRatio(overEps: number, lim: [number, number, number]): SectionClass {
  if (overEps <= lim[0]) return 'Plastic';
  if (overEps <= lim[1]) return 'Compact';
  if (overEps <= lim[2]) return 'Semi-Compact';
  return 'Slender';
}

const WORST: Record<SectionClass, number> = {
  Plastic: 0,
  Compact: 1,
  'Semi-Compact': 2,
  Slender: 3,
};

export function worstClass(a: SectionClass, b: SectionClass): SectionClass {
  return WORST[a] >= WORST[b] ? a : b;
}

/**
 * Classify a cross-section for the given stress case (FR-1.6).
 * Element widths follow IS 800:2007 Fig. 2 definitions (flat widths).
 */
export function classifySection(
  section: CrossSection,
  material: Material,
  stress: StressCase = 'both'
): ClassificationResult {
  const eps = epsilon(material.fy);
  const el = section.elements;
  const items: ElementClassification[] = [];
  const LIM_OUT_ROLLED: [number, number, number] = [9.4, 10.5, 15.7];
  const LIM_OUT_WELDED: [number, number, number] = [9.4, 10.5, 13.6];
  const LIM_INTERNAL_BEND: [number, number, number] = [28.4, 33.5, 42.0];
  const LIM_WEB_MID: [number, number, number] = [84, 105, 126];
  const LIM_CHANNEL_WEB: [number, number, number] = [42, 42, 42];
  const LIM_ANGLE: [number, number, number] = [9.4, 10.5, 15.7];
  const LIM_T_STEM: [number, number, number] = [8.4, 9.4, 18.9];
  const LIM_CHS: [number, number, number] = [44, 55, 88];

  const welded = section.type === 'Welded' || section.shape === 'BuiltUpI';
  const clause = 'Table 2';

  const add = (
    element: string,
    ratio: string,
    actual: number,
    lim: [number, number, number] | null,
    cls: SectionClass,
    epsPow = 1
  ) => {
    items.push({
      element,
      ratio,
      value: actual,
      valueOverEps: lim ? actual / eps ** epsPow : 0,
      limits: lim,
      cls,
      clause,
    });
  };

  // --- Flange outstand of I / channel / T --------------------------------
  if (el.flangeOutstand !== undefined && el.flangeThickness) {
    const bt = el.flangeOutstand / el.flangeThickness;
    const lim = welded ? LIM_OUT_WELDED : LIM_OUT_ROLLED;
    add('Compression flange outstand', 'b/tf', bt, lim, classFromRatio(bt / eps, lim));
  }

  // --- Web of I/H/box (bending, NA at mid-depth) -------------------------
  if (el.webDepth !== undefined && el.webThickness && (section.shape === 'I' || section.shape === 'BuiltUpI' || section.shape === 'RHS' || section.shape === 'SHS' || section.shape === 'Tee')) {
    const dt = el.webDepth / el.webThickness;
    if (stress === 'compression' && (section.shape === 'I' || section.shape === 'BuiltUpI')) {
      // Table 2: web of I under axial compression — "Not applicable" (no limit).
    } else if (stress === 'bending' || stress === 'both') {
      add('Web (NA at mid-depth)', 'd/tw', dt, LIM_WEB_MID, classFromRatio(dt / eps, LIM_WEB_MID));
    }
  }

  // --- Web of channel -----------------------------------------------------
  if (section.shape === 'Channel' && el.webDepth !== undefined && el.webThickness) {
    const dt = el.webDepth / el.webThickness;
    add('Channel web', 'd/tw', dt, LIM_CHANNEL_WEB, classFromRatio(dt / eps, LIM_CHANNEL_WEB));
  }
  if (section.shape === 'Channel' && el.flangeOutstand !== undefined && el.flangeThickness) {
    const bt = el.flangeOutstand / el.flangeThickness;
    add('Channel flange outstand', 'b/tf', bt, LIM_OUT_ROLLED, classFromRatio(bt / eps, LIM_OUT_ROLLED));
  }

  // --- Internal element (box / RHS flange) --------------------------------
  if (el.internalWidth !== undefined && el.internalThickness && (stress === 'bending' || stress === 'both')) {
    const bt = el.internalWidth / el.internalThickness;
    add('Internal element (flange)', 'b/t', bt, LIM_INTERNAL_BEND, classFromRatio(bt / eps, LIM_INTERNAL_BEND));
  }

  // --- Angles -------------------------------------------------------------
  if (el.leg1 !== undefined && el.legThickness) {
    const t = el.legThickness;
    const b1 = (el.leg1 - t) / t;
    const b2 = el.leg2 !== undefined ? (el.leg2 - t) / t : b1;
    if (stress === 'compression') {
      // Single/separated angles in axial compression — semi-compact criteria
      const ok1 = b1 <= 15.7 * eps;
      const ok2 = b2 <= 15.7 * eps;
      const ok3 = (b1 + b2 + 2) <= 25 * eps; // (b+d)/t = b1 + b2 + 2
      const cls: SectionClass = ok1 && ok2 && ok3 ? 'Semi-Compact' : 'Slender';
      add('Angle leg 1 (axial)', 'b/t', b1 * t / 1 * (1 / t) * t, [0, 0, 15.7], cls);
      items[items.length - 1].value = b1;
      items[items.length - 1].valueOverEps = b1 / eps;
      add('Angle leg 2 (axial)', 'd/t', b2, [0, 0, 15.7], cls);
      add('Angle sum (axial)', '(b+d)/t', b1 + b2 + 2, [0, 0, 25], cls);
    }
    if (stress === 'bending' || stress === 'both') {
      add('Angle leg 1 (bending)', 'b/t', b1, LIM_ANGLE, classFromRatio(b1 / eps, LIM_ANGLE));
      add('Angle leg 2 (bending)', 'd/t', b2, LIM_ANGLE, classFromRatio(b2 / eps, LIM_ANGLE));
    }
  }

  // --- CHS ----------------------------------------------------------------
  if (el.diameter !== undefined && el.internalThickness) {
    const dt = el.diameter / el.internalThickness;
    const lim: [number, number, number] = [44, 55, 88];
    add('CHS wall', 'D/t', dt, lim, classFromRatio(dt / (eps * eps), lim), 2);
  }

  // --- T stem -------------------------------------------------------------
  if (section.shape === 'Tee' && el.webDepth !== undefined && el.webThickness) {
    const dt = el.webDepth / el.webThickness;
    add('T-stem', 'd/tf', dt, LIM_T_STEM, classFromRatio(dt / eps, LIM_T_STEM));
  }

  // --- Plate --------------------------------------------------------------
  if (section.shape === 'Plate' && el.internalWidth !== undefined && el.internalThickness) {
    // Plate in compression: outstanding element both sides — semi-compact ≤ 15.7ε
    const bt = el.internalWidth / el.internalThickness;
    add('Plate (outstand)', 'b/t', bt, LIM_OUT_ROLLED, classFromRatio(bt / eps, LIM_OUT_ROLLED));
  }

  let overall: SectionClass = 'Plastic';
  for (const it of items) overall = worstClass(overall, it.cls);
  if (items.length === 0) overall = 'Compact';

  const shearBucklingNeeded =
    el.webDepth !== undefined && el.webThickness ? el.webDepth / el.webThickness > 67 * eps : false;

  const steps: CalcStep[] = [
    {
      title: 'Slenderness parameter',
      clause: 'Table 2, Note 2',
      formula: 'ε = √(250/fy)',
      terms: [{ sym: 'fy', name: 'Yield stress', value: material.fy, unit: 'MPa' }],
      result: `ε = ${eps.toFixed(3)}`,
    },
    ...items.map((it) => ({
      title: it.element,
      clause: `Table 2 (${it.ratio})`,
      formula: `${it.ratio} ≤ limit × ε`,
      terms: [
        { sym: it.ratio, name: it.element, value: it.value, unit: '—' },
        ...(it.limits
          ? [
              {
                sym: 'limits',
                name: 'Plastic / Compact / Semi-compact',
                value: `${it.limits[0]}ε / ${it.limits[1]}ε / ${it.limits[2]}ε`,
              },
            ]
          : []),
      ],
      result: `${it.ratio} = ${it.value.toFixed(2)} = ${it.valueOverEps.toFixed(2)}ε → ${it.cls}`,
    })),
    {
      title: 'Overall classification',
      clause: 'Cl. 3.7.2 (most critical element governs)',
      formula: 'class = worst(element classes)',
      terms: items.map((it) => ({ sym: it.ratio, name: it.element, value: it.cls })),
      result: overall,
    },
  ];

  return { overall, elements: items, eps, shearBucklingNeeded, steps };
}
