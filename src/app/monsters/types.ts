export type MonsterStatKey = "PHYS" | "CON" | "INT" | "SOC";

export interface MonsterStats {
  PHYS: number;
  CON: number;
  INT: number;
  SOC: number;
}

export type DamageType = "physical" | "magic" | "true";

export interface RollFormula {
  diceCount: number;
  diceSides: number;
  stat?: MonsterStatKey;
  flatBonus?: number;
  minTotal?: number;
}

export type PassiveTrigger =
  | "encounter_start"
  | "turn_start"
  | "on_attack_hit"
  | "on_damaged"
  | "on_threshold"
  | "on_defeated";

export interface MonsterEffect {
  type: "damage" | "heal_self" | "resource_gain" | "note";
  formula?: RollFormula;
  damageType?: DamageType;
  resourceId?: string;
  note?: string;
}

export interface RollableAttack {
  id: string;
  name: string;
  formula: RollFormula;
  damageType?: DamageType;
  description?: string;
  effects?: MonsterEffect[];
}

export interface ActiveAbility {
  id: string;
  name: string;
  description?: string;
  target: "player" | "self" | "none";
  formula?: RollFormula;
  damageType?: DamageType;
  effects?: MonsterEffect[];
  cooldownTurns?: number;
  maxCharges?: number;
  resourceCost?: { resourceId: string; amount: number };
}

export interface PassiveAbility {
  id: string;
  name: string;
  trigger: PassiveTrigger;
  description?: string;
  effects: MonsterEffect[];
}

export interface MonsterResourcePool {
  id: string;
  name: string;
  current: number;
  max: number;
}

export interface MonsterDefinition {
  id: string;
  name: string;
  cr: string;
  stats: MonsterStats;
  hp: number;
  ac: number;
  mr: number;
  speed: number;
  attacks: RollableAttack[];
  activeAbilities: ActiveAbility[];
  passiveAbilities: PassiveAbility[];
  resourcePools?: MonsterResourcePool[];
  tags?: string[];
}

export interface MonsterCombatRuntime {
  cooldowns: Record<string, number>;
  charges: Record<string, number>;
  resources: Record<string, number>;
}

const DEFAULT_STATS: MonsterStats = {
  PHYS: 0,
  CON: 0,
  INT: 0,
  SOC: 0,
};

const DEFAULT_FORMULA: RollFormula = {
  diceCount: 1,
  diceSides: 4,
};

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.floor(toSafeNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
};

const normalizeStat = (stat: unknown): MonsterStatKey | undefined => {
  if (typeof stat !== "string") return undefined;
  const normalized = stat.toUpperCase().trim();
  if (normalized === "STR" || normalized === "DEX" || normalized === "PHYS") return "PHYS";
  if (normalized === "INT" || normalized === "WIS") return "INT";
  if (normalized === "CHA" || normalized === "SOC" || normalized === "SOCIAL") return "SOC";
  if (normalized === "CON") return "CON";
  return undefined;
};

const normalizeFormula = (formula: unknown): RollFormula => {
  if (!formula || typeof formula !== "object") return { ...DEFAULT_FORMULA };
  const value = formula as Partial<RollFormula>;
  const normalized: RollFormula = {
    diceCount: toPositiveInt(value.diceCount, 1),
    diceSides: toPositiveInt(value.diceSides, 4),
  };
  const stat = normalizeStat(value.stat);
  if (stat) normalized.stat = stat;
  if (value.flatBonus !== undefined) normalized.flatBonus = toSafeNumber(value.flatBonus, 0);
  if (value.minTotal !== undefined) normalized.minTotal = Math.max(0, toSafeNumber(value.minTotal, 0));
  return normalized;
};

const normalizeEffects = (effects: unknown): MonsterEffect[] => {
  if (!Array.isArray(effects)) return [];
  return effects
    .filter((effect) => effect && typeof effect === "object")
    .map((effect) => {
      const value = effect as Partial<MonsterEffect>;
      const type = value.type ?? "note";
      const normalized: MonsterEffect = {
        type: ["damage", "heal_self", "resource_gain", "note"].includes(type) ? type : "note",
      };
      if (value.formula) normalized.formula = normalizeFormula(value.formula);
      const damageType = value.damageType;
      if (damageType === "physical" || damageType === "magic" || damageType === "true") {
        normalized.damageType = damageType;
      }
      if (value.resourceId) normalized.resourceId = String(value.resourceId);
      if (value.note) normalized.note = String(value.note);
      return normalized;
    });
};

const normalizeAttack = (attack: unknown): RollableAttack | null => {
  if (!attack || typeof attack !== "object") return null;
  const value = attack as Partial<RollableAttack> & { die?: unknown; stat?: unknown; effect?: unknown; name?: unknown };
  const id = value.id ? String(value.id) : String(value.name ?? "attack").toLowerCase().replace(/\s+/g, "-");
  const name = String(value.name ?? "Attack");

  const legacyDie = value.die !== undefined ? toSafeNumber(value.die, 4) : undefined;
  const legacyStat = normalizeStat(value.stat);
  const legacyFormula: RollFormula | undefined = legacyDie !== undefined
    ? {
        diceCount: legacyDie > 0 ? 1 : 0,
        diceSides: legacyDie > 0 ? Math.floor(legacyDie) : 4,
        stat: legacyStat,
      }
    : undefined;

  const formula = normalizeFormula(value.formula ?? legacyFormula ?? DEFAULT_FORMULA);
  const effects = normalizeEffects(value.effects);
  if (value.effect && effects.length === 0) {
    effects.push({ type: "note", note: String(value.effect) });
  }

  const damageType = value.damageType === "physical" || value.damageType === "magic" || value.damageType === "true"
    ? value.damageType
    : undefined;

  return {
    id,
    name,
    formula,
    damageType,
    description: value.description ? String(value.description) : undefined,
    effects,
  };
};

const normalizeAbility = (ability: unknown): ActiveAbility | null => {
  if (!ability || typeof ability !== "object") return null;
  const value = ability as Partial<ActiveAbility>;
  const id = value.id ? String(value.id) : String(value.name ?? "ability").toLowerCase().replace(/\s+/g, "-");
  const damageType = value.damageType === "physical" || value.damageType === "magic" || value.damageType === "true"
    ? value.damageType
    : undefined;

  return {
    id,
    name: String(value.name ?? "Active Ability"),
    description: value.description ? String(value.description) : undefined,
    target: value.target === "self" || value.target === "none" ? value.target : "player",
    formula: value.formula ? normalizeFormula(value.formula) : undefined,
    damageType,
    effects: normalizeEffects(value.effects),
    cooldownTurns: value.cooldownTurns !== undefined ? Math.max(0, Math.floor(toSafeNumber(value.cooldownTurns, 0))) : undefined,
    maxCharges: value.maxCharges !== undefined ? Math.max(1, Math.floor(toSafeNumber(value.maxCharges, 1))) : undefined,
    resourceCost: value.resourceCost
      ? {
          resourceId: String(value.resourceCost.resourceId),
          amount: Math.max(1, Math.floor(toSafeNumber(value.resourceCost.amount, 1))),
        }
      : undefined,
  };
};

const normalizePassive = (passive: unknown): PassiveAbility | null => {
  if (!passive || typeof passive !== "object") return null;
  const value = passive as Partial<PassiveAbility>;
  const id = value.id ? String(value.id) : String(value.name ?? "passive").toLowerCase().replace(/\s+/g, "-");
  const trigger: PassiveTrigger = [
    "encounter_start",
    "turn_start",
    "on_attack_hit",
    "on_damaged",
    "on_threshold",
    "on_defeated",
  ].includes(value.trigger ?? "")
    ? (value.trigger as PassiveTrigger)
    : "turn_start";

  return {
    id,
    name: String(value.name ?? "Passive"),
    trigger,
    description: value.description ? String(value.description) : undefined,
    effects: normalizeEffects(value.effects),
  };
};

const normalizeResourcePool = (pool: unknown): MonsterResourcePool | null => {
  if (!pool || typeof pool !== "object") return null;
  const value = pool as Partial<MonsterResourcePool>;
  const max = Math.max(1, Math.floor(toSafeNumber(value.max, 1)));
  const currentRaw = Math.floor(toSafeNumber(value.current, max));
  return {
    id: String(value.id ?? "resource"),
    name: String(value.name ?? "Resource"),
    max,
    current: Math.max(0, Math.min(max, currentRaw)),
  };
};

const parseMonsterMr = (value: Partial<MonsterDefinition> & { tags?: unknown[] }, defaultValue = 0): number => {
  const direct = toSafeNumber((value as { mr?: unknown }).mr, Number.NaN);
  if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct));

  const tags = Array.isArray(value.tags) ? value.tags.map((tag) => String(tag).toLowerCase()) : [];
  const tagMatch = tags.find((tag) => tag.startsWith("mr-"));
  if (!tagMatch) return defaultValue;

  const parsed = Number(tagMatch.slice(3));
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(0, Math.floor(parsed));
};

export const normalizeMonsterDefinition = (monster: unknown): MonsterDefinition => {
  const value = (monster && typeof monster === "object" ? monster : {}) as Partial<MonsterDefinition> & { attacks?: unknown[]; stats?: Partial<MonsterStats> };
  const legacyStats = value.stats as Partial<Record<"STR" | "DEX" | "WIS" | "CHA" | "SOCIAL", unknown>> | undefined;
  const phys =
    toSafeNumber(value.stats?.PHYS, DEFAULT_STATS.PHYS)
    + toSafeNumber(legacyStats?.STR, 0)
    + toSafeNumber(legacyStats?.DEX, 0);
  const intellect =
    toSafeNumber(value.stats?.INT, DEFAULT_STATS.INT)
    + toSafeNumber(legacyStats?.WIS, 0);
  const social =
    toSafeNumber(value.stats?.SOC, DEFAULT_STATS.SOC)
    + toSafeNumber(legacyStats?.CHA, 0)
    + toSafeNumber(legacyStats?.SOCIAL, 0);
  const stats: MonsterStats = {
    PHYS: phys,
    CON: toSafeNumber(value.stats?.CON, DEFAULT_STATS.CON),
    INT: intellect,
    SOC: social,
  };
  const rawSpeed = (value as { speed?: unknown; spd?: unknown }).speed ?? (value as { spd?: unknown }).spd;
  const speed = Math.max(0, Math.floor(toSafeNumber(rawSpeed, 0)));

  const attacks = Array.isArray(value.attacks)
    ? value.attacks.map(normalizeAttack).filter((attack): attack is RollableAttack => Boolean(attack))
    : [];

  return {
    id: String(value.id ?? "monster"),
    name: String(value.name ?? "Monster"),
    cr: String(value.cr ?? "1"),
    stats,
    hp: Math.max(1, Math.floor(toSafeNumber(value.hp, 1))),
    ac: Math.max(0, Math.floor(toSafeNumber(value.ac, 0))),
    mr: parseMonsterMr(value as Partial<MonsterDefinition> & { tags?: unknown[] }, 0),
    speed,
    attacks,
    activeAbilities: Array.isArray(value.activeAbilities)
      ? value.activeAbilities.map(normalizeAbility).filter((ability): ability is ActiveAbility => Boolean(ability))
      : [],
    passiveAbilities: Array.isArray(value.passiveAbilities)
      ? value.passiveAbilities.map(normalizePassive).filter((passive): passive is PassiveAbility => Boolean(passive))
      : [],
    resourcePools: Array.isArray(value.resourcePools)
      ? value.resourcePools.map(normalizeResourcePool).filter((resource): resource is MonsterResourcePool => Boolean(resource))
      : [],
    tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag)) : [],
  };
};

export const normalizeMonsterCollection = (monsters: unknown): MonsterDefinition[] => {
  if (!Array.isArray(monsters)) return [];
  return monsters.map(normalizeMonsterDefinition);
};
