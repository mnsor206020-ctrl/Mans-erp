/** UTF-8 BOM — makes Excel open the file with correct encoding. */
const BOM = "\uFEFF";

/**
 * Escapes a single CSV cell value.
 * - Wraps in double-quotes when the value contains a comma, double-quote, or newline.
 * - Internal double-quotes are doubled ("").
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a complete CSV string including UTF-8 BOM.
 * Rows use CRLF line endings for maximum compatibility.
 */
export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines: string[] = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return BOM + lines.join("\r\n");
}

/**
 * Generates a dated CSV filename.
 * Output: `prefix-YYYY-MM-DD.csv`
 */
export function generateFilename(prefix: string): string {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  return `${prefix}-${yyyy}-${mm}-${dd}.csv`;
}

/**
 * Triggers a browser download of the CSV content.
 * Must only be called in a browser context.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href          = url;
  link.download      = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
