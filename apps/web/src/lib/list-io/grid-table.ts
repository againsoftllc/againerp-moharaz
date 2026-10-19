import type { GridApi } from "ag-grid-community";
import type { TableData } from "@/lib/list-io/spreadsheet";

/** Columns that hold controls / pictures / buttons, not data - never in an export. */
const NON_DATA_COLUMNS = new Set(["controls", "actions", "thumbnail", "aiImport", "ai-import", "select", "star", "rowNumber"]);

/**
 * A list's grid as a table to export: the columns that are **visible now**, in their on-screen order, with the header the person sees and the
 * value the cell shows (formatted), for **every row** the filters / search leave (not only the page on screen), in the sorted order.
 * Common to every datatable (`AgainListGrid` lists): a list's Export menu calls this.
 */
export function gridToTable<T>(api: GridApi<T>, opts: { extraSkip?: string[]; numbersAsText?: boolean; /** only these rows (by `id`), e.g. the ticked ones */ onlyIds?: Set<string> } = {}): TableData {
  const skip = new Set([...NON_DATA_COLUMNS, ...(opts.extraSkip ?? [])]);
  const columns = api
    .getAllDisplayedColumns()
    .filter((c) => {
      const def = c.getColDef();
      const id = c.getColId();
      return Boolean(def.headerName) && !skip.has(id) && !id.startsWith("competitor-") && !def.checkboxSelection;
    });
  const rows: TableData["rows"] = [];
  api.forEachNodeAfterFilterAndSort((node) => {
    if (!node.data) return;
    if (opts.onlyIds && !opts.onlyIds.has(String((node.data as { id?: string }).id ?? ""))) return;
    rows.push(
      columns.map((c) => {
        const colKey = c.getColId();
        // Excel: a number stays a number (sortable / summable); everything else is the text the cell shows. PDF: the text shown.
        if (!opts.numbersAsText) {
          const raw = api.getCellValue({ rowNode: node, colKey });
          if (typeof raw === "number") return raw;
        }
        const v = api.getCellValue({ rowNode: node, colKey, useFormatter: true });
        return v === null || v === undefined ? "" : String(v);
      }),
    );
  });
  return { headers: columns.map((c) => String(c.getColDef().headerName)), rows };
}
