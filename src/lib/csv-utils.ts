export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function autoMapFields(
  csvHeaders: string[],
  systemFields: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const sysField of systemFields) {
    const normalized = sysField.toLowerCase().replace(/[_\s]/g, "");
    const match = csvHeaders.find(
      (h) => h.toLowerCase().replace(/[_\s]/g, "") === normalized
    );
    if (match) mapping[sysField] = match;
  }
  return mapping;
}

export function rowsToCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) =>
    v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function cleanCurrency(val: string): number {
  return parseFloat(val.replace(/[$,\s]/g, "")) || 0;
}

export function normalizeStatus(val: string): string {
  const lower = val.trim().toLowerCase();
  const map: Record<string, string> = {
    active: "Active",
    submitted: "Submitted",
    pending: "Pending",
    terminated: "Terminated",
  };
  return map[lower] || val.trim();
}

const TEMPLATES: Record<string, { filename: string; headers: string[] }> = {
  agents: {
    filename: "agent-import-template.csv",
    headers: ["first_name", "last_name", "email", "npn", "position", "upline_email", "start_date", "annual_goal", "phone"],
  },
  policies: {
    filename: "policy-import-template.csv",
    headers: [
      "policy_number", "application_date", "client_name", "client_phone", "client_dob",
      "carrier", "product", "annual_premium", "modal_premium", "billing_interval",
      "status", "contract_type", "lead_source", "effective_date", "notes",
      "refs_collected", "refs_sold", "writing_agent_email",
    ],
  },
  commissions: {
    filename: "commission-levels-template.csv",
    headers: ["carrier", "product", "position", "rate", "start_date"],
  },
  contracts: {
    filename: "contracts-import-template.csv",
    headers: ["agent_email", "carrier", "agent_number", "contract_type", "status", "referral_code", "start_date"],
  },
};

export function downloadTemplate(type: keyof typeof TEMPLATES) {
  const template = TEMPLATES[type];
  if (!template) return;
  const csv = template.headers.join(",");
  downloadCSV(template.filename, csv);
}

export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}
