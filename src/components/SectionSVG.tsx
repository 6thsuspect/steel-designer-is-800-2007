/**
 * SVG-based cross-section visualiser (PRD §6 — interactive SVG diagrams).
 * Renders the same polygons used by the property calculator, with hover
 * highlights and wheel zoom / drag pan.
 */
import React, { useMemo, useRef, useState } from 'react';
import { CrossSection, Polygon } from '../engine/types';

interface Props {
  section: CrossSection;
  size?: number;
  showAxes?: boolean;
  title?: string;
  highlight?: 'flange' | 'web' | 'none';
  stress?: number; // optional utilization to tint
  className?: string;
}

export function SectionSVG({ section, size = 260, showAxes = true, title, highlight = 'none', stress, className }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const { paths, bb } = useMemo(() => {
    const polys = section.polygons;
    let zMin = Infinity, zMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of polys) {
      for (const pt of p) {
        zMin = Math.min(zMin, pt.x); zMax = Math.max(zMax, pt.x);
        yMin = Math.min(yMin, pt.y); yMax = Math.max(yMax, pt.y);
      }
    }
    // SVG y-down: flip y
    const paths = polys.map((p: Polygon) =>
      p.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${(-pt.y).toFixed(2)}`).join(' ') + ' Z'
    );
    return { paths, bb: { zMin, zMax, yMin, yMax } };
  }, [section]);

  const w = bb.zMax - bb.zMin + 20;
  const h = bb.yMax - bb.yMin + 20;
  const cx = (bb.zMin + bb.zMax) / 2;
  const cy = (bb.yMin + bb.yMax) / 2;
  const vb = `${cx - (w / 2) * scale + pan.x} ${-cy - (h / 2) * scale + pan.y} ${w * scale} ${h * scale}`;

  const p = section.props;
  const dims = section.elements;
  const stroke = stress !== undefined ? (stress > 1 ? '#dc2626' : stress > 0.95 ? '#d97706' : '#16a34a') : '#324c6d';

  return (
    <figure className={`select-none ${className ?? ''}`}>
      <svg
        viewBox={vb}
        width="100%"
        height={size}
        className="rounded-lg border border-steel-200 bg-white cursor-grab active:cursor-grabbing"
        onWheel={(e) => {
          e.preventDefault();
          setScale((s) => Math.min(Math.max(s * (e.deltaY > 0 ? 1.12 : 0.9), 0.35), 8));
        }}
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY })}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onMouseMove={(e) => {
          if (!drag.current) return;
          const f = w / 300 / scale;
          setPan((pn) => ({ x: pn.x - (e.clientX - drag.current!.x) * f, y: pn.y + (e.clientY - drag.current!.y) * f }));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onDoubleClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
      >
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={i === 0 ? '#9fb9d4' : 'url(#hole)'}
            fillOpacity={i === 0 ? 0.85 : 1}
            stroke={highlight === 'web' && i === 2 ? '#d97706' : highlight === 'flange' && i < 2 ? '#d97706' : stroke}
            strokeWidth={Math.max(w / 250, 0.6)}
            fillRule="evenodd"
            onMouseEnter={() => setHover(i === 0 ? 'Section outline' : 'Void')}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {showAxes && (
          <g stroke="#94a3b8" strokeWidth={Math.max(w / 400, 0.4)} strokeDasharray="4 3">
            <line x1={bb.zMin - 8} y1={0} x2={bb.zMax + 8} y2={0} />
            <line x1={0} y1={-bb.yMin - 8} x2={0} y2={-bb.yMax + 8} />
            <text x={bb.zMax + 4} y={-2} fontSize={Math.max(w / 22, 5)} fill="#64748b">z-z</text>
            <text x={2} y={-bb.yMax - 2} fontSize={Math.max(w / 22, 5)} fill="#64748b">y-y</text>
          </g>
        )}
        <defs>
          <pattern id="hole" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f3f6fa" />
          </pattern>
        </defs>
      </svg>
      <figcaption className="mt-1 text-[11px] text-steel-500 flex justify-between">
        <span>{title ?? section.name}{hover ? ` — ${hover}` : ''}</span>
        <span>
          {p.height.toFixed(0)} × {p.width.toFixed(0)} mm
          {dims.tw ? ` · tw ${dims.tw}` : ''}
          {dims.tf ? ` · tf ${dims.tf}` : ''}
          {scale !== 1 ? ` · zoom ${scale.toFixed(1)}×` : ''}
        </span>
      </figcaption>
    </figure>
  );
}

/** Simple member + load schematic for the active module (SVG, PRD §6). */
export function MemberDiagram({
  mode,
  value,
  valueUnit,
  span = 3000,
}: {
  mode: 'tension' | 'compression' | 'beam' | 'connection';
  value: number;
  valueUnit: string;
  span?: number;
}) {
  const color = '#324c6d';
  return (
    <svg viewBox="0 0 320 120" width="100%" height="130" className="rounded-lg border border-steel-200 bg-white">
      {mode === 'tension' || mode === 'compression' ? (
        <g>
          <rect x="110" y="45" width="100" height="30" fill="#c9d8e8" stroke={color} strokeWidth="1.5" />
          <g stroke={mode === 'tension' ? '#16a34a' : '#3b5d86'} strokeWidth="2.5" markerEnd="url(#arr)">
            {mode === 'tension' ? (
              <>
                <line x1="105" y1="60" x2="55" y2="60" />
                <line x1="215" y1="60" x2="265" y2="60" />
              </>
            ) : (
              <>
                <line x1="55" y1="60" x2="105" y2="60" />
                <line x1="265" y1="60" x2="215" y2="60" />
              </>
            )}
          </g>
          <text x="160" y="35" textAnchor="middle" fontSize="12" fill={color}>
            {value.toFixed(1)} {valueUnit}
          </text>
          <text x="160" y="95" textAnchor="middle" fontSize="10" fill="#64748b">
            {mode === 'tension' ? 'Axial tension' : 'Axial compression'} · L = {span} mm
          </text>
        </g>
      ) : mode === 'beam' ? (
        <g>
          <rect x="40" y="55" width="240" height="14" fill="#c9d8e8" stroke={color} strokeWidth="1.5" />
          {/* supports */}
          <polygon points="40,69 30,88 50,88" fill="#324c6d" />
          <polygon points="280,69 270,88 290,88" fill="#324c6d" />
          <circle cx="280" cy="73" r="4" fill="none" stroke="#324c6d" strokeWidth="1.5" />
          {/* UDL arrows */}
          {Array.from({ length: 9 }).map((_, i) => (
            <g key={i} stroke="#d97706" strokeWidth="1.6" markerEnd="url(#arrW)">
              <line x1={55 + i * 26} y1="18" x2={55 + i * 26} y2="48" />
            </g>
          ))}
          <text x="160" y="14" textAnchor="middle" fontSize="11" fill="#d97706">
            {value.toFixed(1)} {valueUnit}
          </text>
          <text x="160" y="105" textAnchor="middle" fontSize="10" fill="#64748b">
            Simply supported · span = {span} mm
          </text>
        </g>
      ) : (
        <g>
          <rect x="130" y="25" width="24" height="70" fill="#c9d8e8" stroke={color} strokeWidth="1.5" />
          <rect x="70" y="45" width="60" height="16" fill="#9fb9d4" stroke={color} strokeWidth="1.5" />
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={82 + (i % 2) * 36} cy={53 + Math.floor(i / 2) * 0} r="3.5" fill="#3b5d86" />
          ))}
          <text x="160" y="20" textAnchor="middle" fontSize="11" fill={color}>
            {value.toFixed(1)} {valueUnit}
          </text>
          <text x="160" y="112" textAnchor="middle" fontSize="10" fill="#64748b">Bolted / welded connection</text>
        </g>
      )}
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#16a34a" />
        </marker>
        <marker id="arrW" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#d97706" />
        </marker>
      </defs>
    </svg>
  );
}

/** Utilization bar with traffic-light coloring (PRD §6). */
export function UtilBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 140);
  const color = ratio > 1 ? 'bg-fail' : ratio >= 0.95 ? 'bg-warn' : 'bg-pass';
  return (
    <div className="w-full bg-steel-100 rounded-full h-2 overflow-hidden" title={`Utilization ${(ratio * 100).toFixed(1)}%`}>
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}
