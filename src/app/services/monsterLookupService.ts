import { normalizeMonsterDefinition } from "../monsters/types";
import type { MonsterDefinition } from "../monsters/types";
import { parseCsv } from "./itemLookupService";

// Published Google Sheet (File > Share > Publish to web > CSV) with "Key" and "Payload" columns.
// Column A (Key): normalized lowercase alphanumeric keyword (e.g. "direboar", "icewolf").
// Column B (Payload): single-line JSON string representing the full monster definition object.
export const MONSTER_DATABASE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRrMfsMov7I0b_NeW6qMClvKeWt3c20H_GF10yzzRiBEsJBZ6htR_QdVr5P4Ri8PnCQ3maVWoNVoxNL/pub?gid=0&single=true&output=csv";

// Normalizes a monster id/name/sheet key into the shared lookup-key form (lowercase, alphanumeric only).
export const normalizeMonsterKey = (value: unknown): string =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface MonsterLookupFetchResult {
  // Raw Key -> Payload rows exactly as published in the sheet.
  rows: Map<string, string>;
  // Normalized monsters keyed by the sheet Key column.
  byKey: Map<string, MonsterDefinition>;
  // Normalized monsters keyed by the monster definition's own id.
  byId: Map<string, MonsterDefinition>;
  // Flat list of normalized monster definitions (registry order follows sheet row order).
  list: MonsterDefinition[];
  // Row-level problems encountered while parsing (bad JSON rows are skipped, not fatal).
  errors: string[];
}

export async function fetchMonsterLookup(): Promise<MonsterLookupFetchResult> {
  let response: Response;
  try {
    response = await fetch(MONSTER_DATABASE_CSV_URL);
  } catch {
    throw new Error("Could not reach the monster sheet. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error(`Monster sheet request failed (status ${response.status}).`);
  }

  const text = await response.text();
  // RFC4180 parsing identical to the item importer — payload JSON may contain commas/quotes.
  const rows = parseCsv(text);

  const result: MonsterLookupFetchResult = {
    rows: new Map(),
    byKey: new Map(),
    byId: new Map(),
    list: [],
    errors: [],
  };

  // Skip the header row (Key, Payload).
  for (const row of rows.slice(1)) {
    const key = row[0]?.trim();
    const payload = row[1];
    if (!key || payload === undefined) continue;

    result.rows.set(key, payload);

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      result.errors.push(`Row "${key}": payload is not valid JSON.`);
      continue;
    }

    const definition = normalizeMonsterDefinition(parsed);
    result.byKey.set(key, definition);
    result.byKey.set(normalizeMonsterKey(key), definition);
    result.byId.set(definition.id, definition);
    result.list.push(definition);
  }

  return result;
}
