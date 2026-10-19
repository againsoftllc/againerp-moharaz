/**
 * Excel / PDF files for the lists (the "Import / Export" menu of a list). Common to every datatable: a list turns its grid into a
 * `TableData` (lib/list-io/grid-table.ts) and these functions write it; Excel files are read back into rows of text.
 * exceljs and jsPDF are heavy: they are loaded only when a file is actually made / read.
 */
export type CellValue = string | number | null;
export type TableData = { headers: string[]; rows: CellValue[][] };

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** An Excel (.xlsx) file: a bold header row, frozen, columns sized to their content. */
export async function downloadXlsx(table: TableData, filename: string, sheetName = "Sheet1"): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow(table.headers);
  for (const row of table.rows) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  table.headers.forEach((h, i) => {
    const longest = Math.max(h.length, ...table.rows.slice(0, 200).map((r) => String(r[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(60, Math.max(8, longest + 2));
  });
  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}

/** A PDF (A4 landscape): the title, the date and the table with its header repeated on every page. */
export async function downloadPdf(table: TableData, filename: string, title: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(12);
  doc.text(title, 28, 30);
  doc.setFontSize(8);
  doc.text(`${new Date().toLocaleString()} - ${table.rows.length} rows`, 28, 42);
  autoTable(doc, {
    startY: 50,
    head: [table.headers],
    body: table.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [44, 46, 63], textColor: 255 },
    margin: { left: 28, right: 28 },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/** The first sheet of an Excel file as rows of text (empty cells = ""); the first row is the header. */
export async function readXlsx(file: File): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  const width = ws.columnCount;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= width; c += 1) {
      const v = row.getCell(c).value;
      if (v === null || v === undefined) cells.push("");
      else if (typeof v === "object" && "text" in v) cells.push(String((v as { text: unknown }).text ?? ""));
      else if (typeof v === "object" && "result" in v) cells.push(String((v as { result: unknown }).result ?? ""));
      else if (v instanceof Date) cells.push(v.toISOString());
      else cells.push(String(v));
    }
    rows.push(cells);
  });
  return rows;
}
