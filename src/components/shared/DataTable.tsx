import { useState, useMemo, ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { downloadCSV } from "@/lib/csv-utils";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  getValue?: (row: T) => string | number | null;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  exportFilename?: string;
  summaryRow?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  pageSize = 25,
  exportFilename,
  summaryRow,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return data;
    const getValue = col.getValue || ((r: T) => r[sortKey]);
    return [...data].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number")
        return sortDir === "asc" ? va - vb : vb - va;
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [data, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleExport = () => {
    if (!exportFilename) return;
    const headers = columns.map((c) => c.label);
    const rows = sorted.map((row) =>
      columns.map((c) => {
        const val = c.getValue ? c.getValue(row) : row[c.key];
        return val != null ? String(val) : "";
      })
    );
    const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");
    downloadCSV(exportFilename, csvContent);
  };

  return (
    <div className="space-y-2">
      {exportFilename && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport}>
            Export to CSV
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col) => (
                <TableHead key={col.key} className="whitespace-nowrap">
                  {col.sortable !== false ? (
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row, i) => (
              <TableRow
                key={i}
                className={`${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row) || ""}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className="whitespace-nowrap">
                    {col.render ? col.render(row) : (row[col.key] ?? "--")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {paged.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-8"
                >
                  No data found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {summaryRow}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
