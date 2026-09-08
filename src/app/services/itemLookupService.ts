// Published Google Sheet (File > Share > Publish to web > CSV) with "Key" and "Payload" columns.
export const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTkICL7e4sTecdSK5L05NdnktlUheRnsZ0d0RnAdpUIHGdCVks91ZWhFbIjc1v25Vz1Xz2jSzYgoM8w/pub?gid=0&single=true&output=csv";

// Minimal RFC4180 parser: handles quoted fields with embedded commas/quotes/newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignore, handled by \n
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export async function fetchItemLookupMap(): Promise<Map<string, string>> {
  let response: Response;
  try {
    response = await fetch(SHEET_CSV_URL);
  } catch {
    throw new Error("Could not reach the item sheet. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error(`Item sheet request failed (status ${response.status}).`);
  }
  const text = await response.text();
  const rows = parseCsv(text);
  const map = new Map<string, string>();
  // Skip the header row (Key, Payload).
  for (const row of rows.slice(1)) {
    const key = row[0]?.trim();
    const payload = row[1];
    if (key && payload !== undefined) {
      map.set(key, payload);
    }
  }
  return map;
}
