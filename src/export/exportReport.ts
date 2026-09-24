/**
 * Report export — PDF (via print pipeline; Electron uses printToPDF) and
 * DOCX (via the `docx` library) — FR-24.4.
 */
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle } from 'docx';
import { DesignReport } from '../engine/report';
import { fmtSmart } from '../engine/format';

/** PDF export: uses the browser/Electron print pipeline with print CSS. */
export async function exportPDF(): Promise<void> {
  // Electron: ask main process for printToPDF; browser: system print dialog.
  const w = window as unknown as { electronAPI?: { savePDF: (name: string) => Promise<string | null> } };
  if (w.electronAPI?.savePDF) {
    const el = document.getElementById('design-report');
    await w.electronAPI.savePDF(el ? 'design-report.pdf' : 'report.pdf');
    return;
  }
  window.print();
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.header, size: 18, font: 'Calibri' })] })],
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

/** DOCX export (FR-24.4) — full clause-wise report with tables. */
export async function exportDOCX(report: DesignReport, fileName?: string): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(report.title)] }),
    new Paragraph({ children: [new TextRun({ text: report.code, italics: true, size: 18 })] }),
    new Paragraph({
      children: [
        new TextRun({ text: `Project: ${report.projectName}   |   ${report.caseName} — ${report.module}`, bold: true }),
      ],
    }),
    new Paragraph({ children: [new TextRun(`Date: ${report.date}${report.author ? `   |   Prepared by: ${report.author}` : ''}`)] }),
    new Paragraph({
      children: [
        new TextRun({
          text: `OVERALL: ${report.overallStatus === 'PASS' ? 'PASS — ADEQUATE' : report.overallStatus === 'WARN' ? 'PASS — HIGH UTILIZATION' : 'FAIL — NOT ADEQUATE'}  (governing: ${report.governingCheck}, UR = ${report.governingRatio.toFixed(3)})`,
          bold: true,
        }),
      ],
    })
  );

  const mkTable = (header: string[], rows: string[][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: header.map((h) => cell(h, { header: true })) }),
        ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
      ],
    });

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('1. Input Summary')] }));
  children.push(mkTable(['Group', 'Parameter', 'Value'], report.inputs.map((r) => [r.group, r.label, r.value])));

  if (report.material) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('2. Material & Safety Factors')] }));
    children.push(mkTable(['Group', 'Parameter', 'Value', 'Ref'], report.material.rows.map((r) => [r.group, r.label, r.value, r.ref ?? ''])));
  }

  if (report.section) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('3. Section Properties')] }));
    children.push(mkTable(['Group', 'Property', 'Value'], report.section.rows.map((r) => [r.group, r.label, r.value])));
  }

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('4. Clause-wise Calculations')] }));
  report.checks.forEach((c, i) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun(`4.${i + 1} ${c.name} [${c.clause}] — ${c.status}${c.governing ? ' (GOVERNING)' : ''}`)],
      })
    );
    if (c.demand !== undefined) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Demand = ${fmtSmart(c.demand)} ${c.unit}; Capacity = ${fmtSmart(c.capacity ?? 0)} ${c.unit}; UR = ${c.ratio.toFixed(3)}`,
            }),
          ],
        })
      );
    }
    for (const s of c.steps) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${s.title} [${s.clause}]`, bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: s.formula, font: 'Consolas' })] }));
      for (const t of s.terms) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `    ${t.sym} = ${typeof t.value === 'number' ? fmtSmart(t.value) : t.value} ${t.unit ?? ''} (${t.name})`, font: 'Consolas', size: 16 })],
          })
        );
      }
      if (s.substituted) children.push(new Paragraph({ children: [new TextRun({ text: `    ${s.substituted}`, font: 'Consolas', size: 16 })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `    ⟹ ${s.result}`, bold: true })] }));
    }
    for (const nt of c.notes ?? []) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Note: ${nt}`, italics: true, size: 16 })] }));
    }
  });

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('5. Summary of Design Checks')] }));
  children.push(
    mkTable(
      ['#', 'Check', 'Clause', 'Demand', 'Capacity', 'UR', 'Status'],
      report.summary.map((s, i) => [
        String(i + 1),
        s.name + (s.governing ? ' *' : ''),
        s.clause,
        fmtSmart(s.demand),
        fmtSmart(s.capacity),
        s.ratio.toFixed(3),
        s.status,
      ])
    )
  );

  if (report.notes.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('6. Notes')] }));
    for (const n of report.notes) children.push(new Paragraph({ text: n, bullet: { level: 0 } }));
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Generated by Steel Designer IS800 v1.1.0 — calculations per IS 800:2007. Final responsibility for the design lies with the user.',
          italics: true,
          size: 16,
        }),
      ],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '999999' } },
    })
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const name = fileName ?? `${report.projectName}-${report.caseName}.docx`.replace(/[^\w\-. ]+/g, '');
  const w = window as unknown as { electronAPI?: { saveBlob: (name: string, b: Blob) => Promise<void> } };
  if (w.electronAPI?.saveBlob) {
    await w.electronAPI.saveBlob(name, blob);
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
