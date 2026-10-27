import { toast } from "sonner";
import { downloadPdf, downloadXlsx, fileStamp, type TableData } from "@/lib/list-io/spreadsheet";

/** A list's Export menu: the table as Excel or PDF, with the toast every list shows. */
export async function exportListTable(
  table: TableData | undefined,
  format: "xlsx" | "pdf",
  { fileName, title, noun, pageOnly = false }: { fileName: string; title: string; noun: string; pageOnly?: boolean },
): Promise<void> {
  if (!table || table.rows.length === 0) {
    toast.error("Nothing to export");
    return;
  }
  try {
    const name = `${fileName}-${fileStamp()}`;
    if (format === "xlsx") await downloadXlsx(table, name, title);
    else await downloadPdf(table, name, title);
    toast.success(
      `Exported ${table.rows.length} ${noun}${pageOnly ? " on this page" : ""}, ${table.headers.length} columns`,
    );
  } catch (err) {
    toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
  }
}
