/** Number / string formatting helpers shared by UI and report generator. */

export function fmt(x: number, digits = 2): string {
  if (!isFinite(x)) return '∞';
  const abs = Math.abs(x);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return x.toExponential(2);
  return x.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtSmart(x: number): string {
  if (!isFinite(x)) return '∞';
  if (Math.abs(x) >= 100) return fmt(x, 1);
  if (Math.abs(x) >= 10) return fmt(x, 2);
  return fmt(x, 3);
}

export function kn(nNewtons: number): number {
  return nNewtons / 1000;
}

export function kNm(nMm: number): number {
  return nMm / 1e6;
}

/** Evaluate a simple arithmetic expression string safely (report substitution). */
export function sub(template: string, values: Record<string, number | string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = values[k];
    return v === undefined ? `{${k}}` : typeof v === 'number' ? fmtSmart(v) : v;
  });
}
