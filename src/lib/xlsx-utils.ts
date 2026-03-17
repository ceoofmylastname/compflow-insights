import * as XLSX from "xlsx";

/**
 * Parse an XLSX/XLS file buffer into headers + rows (same shape as parseCSV).
 */
export function parseXLSX(buffer: ArrayBuffer): {
  headers: string[];
  rows: string[][];
} {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const raw: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (raw.length === 0) return { headers: [], rows: [] };

  const headers = raw[0].map((h) => String(h).trim());
  const rows = raw.slice(1).filter((r) => r.some((c) => String(c).trim()));

  return {
    headers,
    rows: rows.map((r) => r.map((c) => String(c).trim())),
  };
}
