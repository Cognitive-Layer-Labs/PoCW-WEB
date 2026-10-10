/** CSV helpers for the admin exports. */

export type CsvValue = string | number | boolean | null | undefined;

/** Quote a CSV cell; neutralise spreadsheet formulas (=, +, -, @, tab, CR) in user-supplied text. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A downloadable CSV response named `<name>-<YYYY-MM-DD>.csv`. */
export function csvResponse(name: string, header: string[], rows: CsvValue[][]): Response {
  const body = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-${date}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
