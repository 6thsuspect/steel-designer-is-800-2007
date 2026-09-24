# Steel Designer IS:800-2007

Web application for structural steel design as per **IS 800:2007 (Limit State Design)**, covering
member design (tension / compression / flexure / combined forces), bolted and welded connections, serviceability checks,
and clause-wise professional design reports with SVG-based cross-section visualization.

Built with **React + TypeScript + Electron + Tailwind CSS + Vite**, with **SVG-based visualization** of standard Indian
sections (beams, columns, channels, angles — ISMB / ISLB / ISWB / ISHB / ISMC / ISA per SP:6 & IS 808) and built-up
sections (welded I, double angles, RHS/SHS/CHS).

---

## Application scope — 24 modules (PRD)

| Grp | Modules | Status |
|---|---|---|
| **A. Project & Design Setup** | 1. Design Basis & General (project data, IS 875 load combos, Table 1 material library, partial safety factors, section classification) | ✅ Phase 1   |
| **B. Member Design** | 2. Tension · 3. Compression (incl. lacing & battening) · 4. Flexure · 5. Combined Axial + Bending | ✅ Phase 1–2 |
| | 23. Special Members | 🔜 Phase 4   |
| **C. Connection Design** | 6. Bolted Connections (bearing + HSFG, prying, bolt groups) · 7. Welded Connections (fillet/butt, combined stresses, eccentric groups) | ✅ Phase 1   |
| **D. Component & System Design** | 8. Plate Elements · 9. Built-Up · 10. Base Plates · 11. Gusset Plates · 12. Beam-to-Column · 13. Stiffeners · 14. Plate Girders · 15. Splices · 16. Purlins · 17. Trusses · 18. Crane Girders | 🔜 Phases 2–4   |
| **E. Specialized & Reporting** | 21. Serviceability (deflection) · 24. Design Report (clause-wise, PDF/DOCX) | ✅ Phase 1   |
| | 19. Fatigue · 20. Seismic · 22. Durability | 🔜 Phases 3–4   |

Modules marked `P2–P4` in the sidebar show their PRD roadmap status (honest Phase roadmap per PRD §7) and reuse the
shared engine, classification and reporting infrastructure when implemented.

## Implemented design checks (clause references)

- **Tension (Cl. 6)** — Tdg gross yielding (6.2), Tdn net rupture with shear-lag β for angles (6.3.3), block shear both
  Cl. 6.4.1 modes, governing Td, lug-angle rules (Cl. 10.12: 1.2/1.1 & 1.4/1.2 factors, n′ ≥ n+1), slenderness limits (Cl. 3.8).
- **Compression (Cl. 7)** — effective lengths (Table 3), slenderness KL/r, buckling class auto per Table 10 (a–d),
  φ/χ Perry-Robertson fcd (7.1.2), Pd = Ae·fcd; **lacing** (7.4: 2.5% V, θ 40–70°, single/double) and **battens** (7.5).
- **Flexure (Cl. 8)** — section classification (Table 2), Md = βb·Zp·fy/γm0 (8.2.1.2), lateral-torsional buckling fbd (8.2.2),
  semi-compact Ze / slender Ze_eff (Webb's 15.7ε·tf flange-deduction method), shear Vd (8.4), web bearing & crippling (8.7.4).
- **Combined (Cl. 9)** — tension+biaxial bending (9.2), compression+biaxial bending with moment amplification
  m = Cm/(1−P/Pcr) (9.3.1), shear+bending (9.4).
- **Bolted connections (Cl. 10)** — shear Vdsb / bearing Vdpb (kb per 10.3.3) / tension Tndb, combined shear+tension,
  **HSFG slip resistance** (10.4.3: μf, ne, kh), **prying action** (AISC/Nair T-stub model: Q piecewise, tc = √(4Bb′c/0.9pfu)),
  pitch/edge-distance rules (10.2), bolt-group sizing with eccentricity (10.3.7).
- **Welded connections (Cl. 10.5)** — fillet & full/partial butt welds, effective throat, Fwd = fu/(√3γmw),
  min/max size (10.5.2), shop vs field (γmw 1.25 / 1.50), combined throat stresses √(σ⊥² + 3(τ⊥² + τ∥²)) (10.5.9),
  eccentric weld groups (elastic vector method).
- **Serviceability** — deflection formulae (UDL / point / cantilever) or manual entry, span/n limits (Cl. 5.6.1), live-load limits.
- **Reporting (Module 24)** — input summary, material & safety factors, section properties, clause-wise calculation steps
  (formula, symbols, substitution, result), summary table with UR + traffic lights, governing-check highlight,
  **compliance statement**, print/PDF export and **DOCX export**.

## Getting started

```bash
npm install          # web/development install
npm run dev          # Vite dev server (http://localhost:5173) — hot-reload UI
npm run build        # typecheck + vite build (dist/) + electron main (dist-electron/)
npm start            # full build, then launch the Electron desktop shell
npm test             # vitest — 59 tests: engine units + UI integration
```

Scripts: `dev`, `build`, `build:web`, `build:electron`, `electron`, `start`, `test`, `test:watch`, `preview`.

> **Note for this sandbox:** `.npmrc` sets `electron_skip_binary_download=1` (the Electron binary download fails behind
> this environment's TLS). Remove that line on a normal network before packaging desktop builds.

## Architecture

```
src/
├─ engine/            # Pure TypeScript IS 800:2007 calculation engine (no UI deps, worker-safe)
│  ├─ types.ts        #   CheckResult, CalcStep, Material, SafetyFactors (γm0/γm1/…)
│  ├─ materials.ts    #   Table 1 steels (E250–E410) with thickness-band fy
│  ├─ geometry.ts     #   Polygon section builder (fillet roots, arc corners) + properties
│  ├─ sections.ts     #   ISMB/ISLB/ISWB/ISHB/ISMC/ISA database + custom/built-up shapes
│  ├─ classify.ts     #   Table 2 element classification (Plastic…Slender)
│  ├─ buckling.ts     #   Table 3 effective lengths, Table 10 classes, Perry-Robertson fcd
│  ├─ tension.ts · compression.ts · bending.ts · combined.ts
│  ├─ bolts.ts · welds.ts · serviceability.ts
│  └─ report.ts       #   Clause-wise report model (FR-24.1)
├─ state/store.ts     # Project/case state, load combos, undo/redo, localStorage persistence
├─ modules/           # Module UIs: field definitions + evaluate() mappers (inputs → engine → report)
├─ components/        # SectionSVG (zoom/pan/hover), MemberDiagram, form & check UI
├─ export/            # PDF (print pipeline / Electron printToPDF) + DOCX (docx library)
└─ App.tsx            # Sidebar tree (A–E), workspace tabs Input | Results | Report
electron/
├─ main.ts            # Window, save/open dialogs, printToPDF (FR-24.4)
└─ preload.ts         # contextBridge: saveJSON / openJSON / saveBlob / savePDF
tests/                # 59 tests — worked examples + regression + UI integration
```

**Conventions** — engine internals use N / N·mm / MPa; `CheckResult.demand/capacity` are stored in display units
(kN, kN·m, mm) matching `.unit`. ε = √(250/fy). Constants: E = 2×10⁵ MPa, G = 76 900 MPa, ρ = 7850 kg/m³.
Safety factors per IS 800 Table 5 (editable in Module 1): γm0 = 1.10, γm1 = 1.25, γmb = γmf = γmw = 1.25 (field welds 1.50).

**Validation** — unit tests cover worked references: ISHB 400 column fcd/Pd, plate tension Tdg/Tdn/block shear,
M20 4.6 bearing bolts (Vdsb 45.3 kN, kb 0.5, Vdpb 82 kN) & HSFG slip, 6 mm E410 shop fillet weld (795.1 N/mm),
Table 2 classification cases, span/300 deflection, prying T-stub, lacing/battens. Run `npm test` to verify.

## Author

ARVIND SINGH RAWAT

*Final responsibility for any design lies with the user — always verify inputs and independently check results.*
