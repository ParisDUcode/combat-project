import type { MonsterDefinition, RollableAttack } from "./monsters/types";

export const MAX_ACTIVE_ENTITIES = 5;

export interface EntityInstance {
  uid: string;
  name: string;
  isPermanent: boolean;
  companionId?: string;
  monsterId?: string;
  currentHp: number;
  maxHp: number;
  armor: number;
  magicResist: number;
  speed?: string;
  notes?: string;
  attacks: RollableAttack[];
  // Snapshot of the monster definition (stats are needed for attack formulas); absent for custom entities.
  def?: MonsterDefinition;
}

export type CompanionRecords = Record<string, { currentHp: number }>;

export const normalizeLookupKey = (value: unknown): string =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const findMonsterByQuery = (
  list: MonsterDefinition[],
  query: string,
  keyMap?: Map<string, MonsterDefinition>,
): MonsterDefinition | undefined => {
  const key = normalizeLookupKey(query);
  if (!key) return undefined;
  return keyMap?.get(key)
    ?? list.find((m) => normalizeLookupKey(m.id) === key)
    ?? list.find((m) => normalizeLookupKey(m.name) === key);
};

// First unused "<id>-<n>" among the active entities.
export const nextEntityIndex = (entities: EntityInstance[], baseId: string): number => {
  const used = new Set(entities.map((e) => e.uid));
  let n = 1;
  while (used.has(`${baseId}-${n}`)) n += 1;
  return n;
};

export const clampHp = (hp: number, maxHp: number): number =>
  Math.min(Math.max(0, Math.floor(maxHp)), Math.max(0, Math.floor(hp)));

export const buildMonsterEntity = (
  def: MonsterDefinition,
  entities: EntityInstance[],
  options: { companionId?: string; currentHp?: number } = {},
): EntityInstance => {
  const baseId = options.companionId ?? def.id;
  const n = nextEntityIndex(entities, baseId);
  const isPermanent = Boolean(options.companionId);
  return {
    uid: `${baseId}-${n}`,
    name: isPermanent || n === 1 ? def.name : `${def.name} ${n}`,
    isPermanent,
    ...(options.companionId ? { companionId: options.companionId } : {}),
    monsterId: def.id,
    currentHp: clampHp(options.currentHp ?? def.hp, def.hp),
    maxHp: def.hp,
    armor: def.ac,
    magicResist: def.mr,
    speed: String(def.speed),
    attacks: def.attacks ?? [],
    def,
  };
};

export interface CustomEntityInput {
  name: string;
  maxHp: number;
  armor: number;
  magicResist: number;
  speed?: string;
  notes?: string;
}

export const buildCustomEntity = (input: CustomEntityInput, entities: EntityInstance[], stamp: number): EntityInstance => {
  const maxHp = Math.max(1, Math.floor(input.maxHp) || 1);
  let uid = `custom-${stamp}`;
  while (entities.some((e) => e.uid === uid)) uid += "x";
  return {
    uid,
    name: input.name.trim() || "Custom Entity",
    isPermanent: false,
    currentHp: maxHp,
    maxHp,
    armor: Math.max(0, Math.floor(input.armor) || 0),
    magicResist: Math.max(0, Math.floor(input.magicResist) || 0),
    ...(input.speed?.trim() ? { speed: input.speed.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    attacks: [],
  };
};

// Dismissing hides item companions (their HP record is kept elsewhere) and deletes volatile entities.
export const dismissEntity = (entities: EntityInstance[], uid: string): EntityInstance[] =>
  entities.filter((e) => e.uid !== uid);

export const clearCustomEntities = (entities: EntityInstance[]): EntityInstance[] =>
  entities.filter((e) => e.isPermanent);

export const keepEquippedCompanions = (entities: EntityInstance[], equippedIds: Set<string>): EntityInstance[] =>
  entities.filter((e) => !e.isPermanent || !e.companionId || equippedIds.has(e.companionId));

// Long rest: drop every temporary entity and restore every recorded companion to its base HP.
export const applyLongRestToEntities = (
  entities: EntityInstance[],
  companions: CompanionRecords,
  resolveBaseHp: (companionId: string) => number | undefined,
): { entities: EntityInstance[]; companions: CompanionRecords } => {
  const nextCompanions: CompanionRecords = {};
  for (const [id, record] of Object.entries(companions)) {
    const base = resolveBaseHp(id);
    nextCompanions[id] = { currentHp: base !== undefined ? base : record.currentHp };
  }
  const nextEntities = entities
    .filter((e) => e.isPermanent)
    .map((e) => (e.companionId && nextCompanions[e.companionId]
      ? { ...e, currentHp: clampHp(nextCompanions[e.companionId].currentHp, e.maxHp) }
      : e));
  return { entities: nextEntities, companions: nextCompanions };
};

export const normalizeCompanions = (raw: unknown): CompanionRecords => {
  const result: CompanionRecords = {};
  if (!raw || typeof raw !== "object") return result;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const hp = Number((value as { currentHp?: unknown } | null)?.currentHp);
    if (id && Number.isFinite(hp)) result[id] = { currentHp: Math.max(0, Math.floor(hp)) };
  }
  return result;
};

export const normalizeEntities = (raw: unknown): EntityInstance[] => {
  if (!Array.isArray(raw)) return [];
  const result: EntityInstance[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<EntityInstance>;
    if (typeof e.uid !== "string" || typeof e.name !== "string") continue;
    const maxHp = Math.max(1, Math.floor(Number(e.maxHp)) || 1);
    result.push({
      uid: e.uid,
      name: e.name,
      isPermanent: Boolean(e.isPermanent),
      ...(typeof e.companionId === "string" ? { companionId: e.companionId } : {}),
      ...(typeof e.monsterId === "string" ? { monsterId: e.monsterId } : {}),
      currentHp: clampHp(Number(e.currentHp) || 0, maxHp),
      maxHp,
      armor: Math.max(0, Math.floor(Number(e.armor)) || 0),
      magicResist: Math.max(0, Math.floor(Number(e.magicResist)) || 0),
      ...(typeof e.speed === "string" ? { speed: e.speed } : {}),
      ...(typeof e.notes === "string" ? { notes: e.notes } : {}),
      attacks: Array.isArray(e.attacks) ? e.attacks : [],
      ...(e.def ? { def: e.def } : {}),
    });
  }
  return result.slice(0, MAX_ACTIVE_ENTITIES);
};
